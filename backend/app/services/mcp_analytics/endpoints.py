from fastapi import APIRouter, HTTPException, Request, Depends, Query, status, File, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse
from pydantic import BaseModel
import os
import json
import logging
import uuid
import re
import requests
from datetime import datetime
from typing import Optional, List, Dict, Any, Union

from app.core.config import settings
from app.services.auth_middleware import get_current_user
from app.services.auth_utils import TokenManager, RBACManager, get_effective_redirect_uri, get_backend_callback_url
from app.services.mcp_analytics.ga_service import GAService
from app.services.mcp_analytics.adobe_service import AdobeAnalyticsService
from app.services.mcp_analytics.ga_advanced_service import GA4AdvancedService
from app.services.mcp_analytics.ga_admin_service import GA4AdminService
from app.services.mcp_analytics.ga_quality_service import GA4QualityService
from app.services.mcp_analytics.ga_metadata_service import GA4MetadataService
from app.services.mcp_analytics.ga_risk_service import GA4RiskService
from app.services.mcp_analytics.ga_traffic_ia_service import GATrafficIAService
# from app.services.mcp_analytics.brandlight_service import BrandlightService
from app.services.mcp_analytics.peec_service import PeecService
from app.services.mcp_analytics.chat_service import ChatService
from app.services.mcp_analytics.query_history import QueryHistoryService
from app.services.mcp_analytics.ai_pattern_service import AIPatternService
from app.services.mcp_analytics.data_inspector import DataInspectorService
from app.services.mcp_analytics.session_service import session_service
from app.services.mcp_analytics.report_generator import ReportGenerator
from app.models.mcp_analytics.core_models import (
    RunReportRequest, RunReportResponse, DeepDiveRequest, 
    RiskAnalysisRequest, TrafficIARequest, TrafficIAResponse,
    ChatRequest, ChatResponse, TrafficIAURLAnalysisRequest, TrafficIAURLAnalysisResponse,
    AIPatternRequest, GAAccount, GAProperty,
    AdvancedReportRequest, FunnelAnalysisRequest, TrafficIAAnalysisRequest,
    PDFInsightsRequest, PDFInsightsResponse,
    EngagementScoreExplanationRequest, EngagementScoreExplanationResponse
)

router = APIRouter()
logger = logging.getLogger(__name__)

class TenantConfigResponse(BaseModel):
    tenant_id: str
    tenant_name: str
    logo_url: str
    primary_color: str
    secondary_color: str
    font_family: str
    support_email: str

@router.get("/tenant/config", response_model=TenantConfigResponse)
async def get_tenant_config(request: Request, tenant: Optional[str] = Query(None)):
    """
    Obtiene la configuración visual y de branding de forma dinámica según el subdominio
    o parámetro de consulta (estrategia híbrida), consultando en Firestore con fallback a local.
    """
    # 1. Intentar obtener el tenant desde el host (ej: sanitas.dashboard.llyc.global)
    host = request.headers.get("host", "")
    detected_tenant = None
    
    # Si contiene subdominios y no es localhost, extraer el primer segmento
    if host and "localhost" not in host and "127.0.0.1" not in host:
        parts = host.split(".")
        if len(parts) > 2:  # Ej: sanitas.dashboard.llyc.global -> ['sanitas', 'dashboard', 'llyc', 'global']
            detected_tenant = parts[0].lower().strip()
            
    # 2. Si no se detectó o se pasa como Query (híbrido para demos), usar el parámetro query
    if tenant:
        detected_tenant = tenant.lower().strip()
        
    # 3. Si sigue sin detectarse o es un valor vacío, usar el de LLYC por defecto
    if not detected_tenant or detected_tenant in ["www", "dashboard", "analytics", "media-impact-llyc"]:
        detected_tenant = "llyc"
        
    # 4. Intentar consultar la configuración en vivo en Firestore
    try:
        from app.services.auth_utils import TokenManager
        tm = TokenManager()
        if tm.db:
            doc = tm.db.collection("tenants").document(detected_tenant).get()
            if doc.exists:
                logger.info(f"Configuración de tenant '{detected_tenant}' recuperada con éxito desde Firestore.")
                return doc.to_dict()
    except Exception as e:
        logger.warning(f"No se pudo consultar el tenant '{detected_tenant}' en Firestore (usando fallback local): {e}")

    # 5. Mapeo de bases de datos de inquilinos local (Fallback de cortesía si Firestore está vacío o sin internet)
    tenant_database = {
        "sanitas": {
            "tenant_id": "sanitas",
            "tenant_name": "Sanitas",
            "logo_url": "https://upload.wikimedia.org/wikipedia/commons/e/e4/Sanitas_Logo.svg",
            "primary_color": "#0070B0", # Azul Sanitas
            "secondary_color": "#00A2E2",
            "font_family": "Open Sans, sans-serif",
            "support_email": "soporte.sanitas@llyc.global"
        },
        "llyc": {
            "tenant_id": "llyc",
            "tenant_name": "LLYC Intelligence",
            "logo_url": "https://upload.wikimedia.org/wikipedia/commons/e/e5/LLYC_logo.svg",
            "primary_color": "#E51D24", # Rojo LLYC
            "secondary_color": "#1C2541", # Azul LLYC
            "font_family": "Montserrat, sans-serif",
            "support_email": "intelligence.mcp@llyc.global"
        }
    }
    
    # 6. Obtener configuración o lanzar 404 si es un cliente inexistente (Safeguard de seguridad)
    config = tenant_database.get(detected_tenant)
    if not config:
        raise HTTPException(
            status_code=404,
            detail=f"Organización '{detected_tenant}' no registrada en la plataforma analítica de LLYC."
        )
        
    return config

# Helper to get credentials (migrated from main.py)
def get_credentials(session_id: Optional[str] = None, connection_id: Optional[str] = None, user_email: Optional[str] = None, force_refresh: bool = False) -> Optional[Any]:
    """Retrieves credentials from the session or platform connection."""
    # Try platform connection first
    if connection_id and user_email:
        try:
            target_user = user_email.lower().strip()
            logger.info(f"Getting credentials for connection_id: {connection_id}, user: {target_user}, force_refresh={force_refresh}")
            tm = TokenManager()
            connection = tm.get_connection(connection_id)
            if connection and RBACManager.can_view(connection.get("permissions", {}), target_user):
                tokens = connection.get("tokens", {})
                logger.info(f"Building Credentials for connection {connection_id} (Platform: {connection.get('platform')}). Available keys: {list(tokens.keys())}")
                
                # Support multiple key variations
                access_token = tokens.get("access_token") or tokens.get("accessToken")
                refresh_token = tokens.get("refresh_token") or tokens.get("refreshToken")
                
                from google.oauth2.credentials import Credentials
                creds = Credentials(
                    token=access_token,
                    refresh_token=refresh_token,
                    token_uri="https://oauth2.googleapis.com/token",
                    client_id=settings.GOOGLE_CLIENT_ID,
                    client_secret=settings.GOOGLE_CLIENT_SECRET,
                    scopes=tokens.get("scopes", ["https://www.googleapis.com/auth/analytics.readonly"])
                )
                
                # Check and refresh if needed
                # If expiry is missing, force_refresh might be needed if token is invalid
                should_refresh = force_refresh or (creds.refresh_token and (not creds.token or creds.expired))
                
                if should_refresh and creds.refresh_token:
                    logger.info(f"Triggering token refresh for {connection_id}...")
                    from google.auth.transport.requests import Request as AuthRequest
                    try:
                        creds.refresh(AuthRequest())
                        logger.info("Token refreshed successfully. Saving back to connection.")
                        
                        # Update the connection with the new token
                        try:
                            new_tokens = tokens.copy()
                            new_tokens["access_token"] = creds.token
                            if creds.refresh_token:
                                new_tokens["refresh_token"] = creds.refresh_token
                            
                            doc_ref = tm.db.collection(tm.collection).document(connection_id)
                            encrypted_tokens = tm._encrypt_tokens(new_tokens)
                            doc_ref.update({"tokens": encrypted_tokens, "updated_at": datetime.utcnow()})
                            logger.info(f"Connection {connection_id} tokens updated in Firestore.")
                        except Exception as save_ex:
                            logger.error(f"Failed to save refreshed tokens: {save_ex}")
                    except Exception as refresh_err:
                        logger.error(f"Refresh failed for {connection_id}: {refresh_err}")
                
                return creds
            else:
                if not connection:
                    logger.warning(f"Connection {connection_id} not found in Firestore.")
                else:
                    logger.warning(f"RBAC rejected for {target_user} on connection {connection_id}.")
        except Exception as e:
            logger.error(f"Error fetching credentials from connection {connection_id}: {e}", exc_info=True)

    # Fallback to legacy session
    if not session_id:
        return None
    session = session_service.get_session(session_id)
    if not session:
        return None
    
    provider = session.get("provider", "google")
    if provider == "google":
        creds_data = session.get("credentials")
        if not creds_data: return None
        from google.oauth2.credentials import Credentials
        return Credentials.from_authorized_user_info(creds_data)
    
    return None

def get_analytics_service(session_id: Optional[str] = None, connection_id: Optional[str] = None, user_email: Optional[str] = None, force_refresh: bool = False) -> Any:
    """Factory to get the correct analytics service based on the session or connection."""
    
    # Try platform connection first
    if connection_id and user_email:
        target_user = user_email.lower().strip()
        
        # Immediate fallback for presentation/mock connections without Firestore
        if connection_id == "peec-temp":
            return PeecService({"api_key": "peec-temp"})
        elif connection_id == "adobe-temp":
            return AdobeAnalyticsService({
                "client_id": "adobe-temp",
                "client_secret": "adobe-temp",
                "org_id": "adobe-temp",
                "company_id": "adobe-temp"
            })

        tm = TokenManager()
        connection = tm.get_connection(connection_id)
        if not connection:
             raise HTTPException(status_code=404, detail=f"Connection {connection_id} not found")
        
        if not RBACManager.can_view(connection.get("permissions", {}), target_user):
             raise HTTPException(status_code=403, detail="Unauthorized to access this connection")
             
        platform = connection.get("platform", "").upper()
        tokens = connection.get("tokens", {})
        metadata = connection.get("metadata", {})
        
        # Merge tokens and metadata for service initialization
        # This is critical for Adobe as IDs might be in metadata
        service_creds = {**tokens, **metadata}
        
        if platform in ["GA4", "GOOGLE_ANALYTICS"]:
            credentials = get_credentials(connection_id=connection_id, user_email=target_user, force_refresh=force_refresh)
            if not credentials:
                raise HTTPException(status_code=401, detail="Could not retrieve valid credentials for GA4")
            return GAService(credentials, inspector=get_inspector_service())
        elif platform == "ADOBE_ANALYTICS" or platform == "ADOBE":
            return AdobeAnalyticsService(service_creds)
        # elif platform == "BRANDLIGHT":
        #    return BrandlightService(service_creds)
        elif platform == "PEEC":
            return PeecService(service_creds)
        else:
             raise HTTPException(status_code=400, detail=f"Unsupported platform for MCP: {platform}")

    # Fallback to legacy session
    if not session_id:
        raise HTTPException(status_code=401, detail="No session_id or connection_id provided")
    
    session = session_service.get_session(session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
        
    provider = session.get("provider", "google")
    if provider == "google":
        credentials = get_credentials(session_id=session_id)
        if not credentials:
            raise HTTPException(status_code=401, detail="Google credentials not found in session")
        return GAService(credentials, inspector=get_inspector_service())
    elif provider == "adobe":
        adobe_creds = session.get("adobe_credentials")
        if not adobe_creds:
            raise HTTPException(status_code=401, detail="Adobe credentials not found in session")
        return AdobeAnalyticsService(adobe_creds)
    elif provider == "peec":
        peec_creds = session.get("peec_credentials") or session.get("credentials")
        if not peec_creds:
            raise HTTPException(status_code=401, detail="Peec credentials not found in session")
        return PeecService(peec_creds)
    
    raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

def get_inspector_service():
    return DataInspectorService()

# --- OAuth Endpoints ---

@router.get("/oauth/login")
async def oauth_login(request: Request, provider: str = "google"):
    """Inicia el flujo de autenticación OAuth (MOCKED FOR PRESENTATION)."""
    # Para presentación, redirigimos directamente al dashboard con parámetros mock
    redirect_uri = "http://localhost:3000?connection_id=mock-ga4&session_id=presentacion-llyc"
    return RedirectResponse(redirect_uri)

@router.post("/oauth/callback")
async def oauth_callback(request: Request, data: Dict[str, str]):
    """Callback de OAuth (MOCKED FOR PRESENTATION)."""
    return {
        "status": "success",
        "session_id": "presentacion-llyc",
        "connection_id": "mock-ga4"
    }

# --- Core MCP Endpoints ---

@router.get("/session/check")
async def check_session(session_id: Optional[str] = None):
    """Verifica si la sesión es válida."""
    if not session_id:
        return {"authenticated": False, "message": "No session_id provided"}
    
    session = session_service.get_session(session_id)
    if not session:
        return {"authenticated": False, "message": "Invalid session"}
    
    provider = session.get("provider", "google")
    if provider == "adobe":
        if not session.get("adobe_credentials"):
            return {"authenticated": False, "message": "Adobe credentials not found", "action": "show_adobe_modal", "provider": provider}
    else:
        if not session.get("credentials"):
            return {"authenticated": False, "message": "Credentials not found", "action": "redirect_to_login", "provider": provider}
    return {"authenticated": True, "session_id": session_id, "message": "Session is valid", "user_email": session.get("user_email"), "provider": provider}

@router.get("/user-connections")
async def list_user_connections(user_email: str = Depends(get_current_user)):
    """Lista las conexiones de GA4 y Adobe Analytics disponibles para el usuario en la plataforma."""
    try:
        target_email = user_email.lower().strip()
        tm = TokenManager()
        all_connections = tm.list_user_connections(target_email)
        
        # Filtrar solo GA4 y Adobe
        filtered = []
        for conn in all_connections:
            platform = conn.get("platform", "").upper()
            if platform in ["GA4", "ADOBE_ANALYTICS", "GOOGLE_ANALYTICS", "ADOBE", "BRANDLIGHT", "PEEC"]:
                filtered.append({
                    "connection_id": conn["id"],
                    "platform": platform,
                    "display_name": conn.get("metadata", {}).get("account_name", conn["id"]),
                    "account_id": conn.get("metadata", {}).get("account_id")
                })
        return {"connections": filtered}
    except Exception as e:
        logger.error(f"Error listing user connections: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/test-connection")
async def test_connection(
    connection_id: str,
    session_id: Optional[str] = None,
    user_email: str = Depends(get_current_user)
):
    """Prueba si una conexión es válida y devuelve detalles en caso de error."""
    try:
        service = get_analytics_service(session_id, connection_id, user_email, force_refresh=True)
        try:
            accounts = await service.list_accounts()
            
            if not accounts and getattr(service, "provider", None) == "adobe":
                # Si es Adobe y devolvió 0, devolvemos el RAW para inspección
                return {
                    "status": "warning", 
                    "accounts_found": 0, 
                    "message": "Adobe Discovery returned 0 accounts",
                    "raw_adobe_response": service._last_raw_discovery
                }
                
            return {"status": "ok", "accounts_found": len(accounts)}
        except Exception as inner_e:
            res = {"status": "error", "message": str(inner_e)}
            if getattr(service, "provider", None) == "adobe" and service._last_raw_discovery:
                res["raw_adobe_response"] = service._last_raw_discovery
            return res
            
    except Exception as e:
        logger.error(f"Connection test failed for {connection_id}: {e}")
        return {"status": "error", "message": str(e)}

@router.get("/accounts")
async def list_accounts(
    session_id: Optional[str] = None, 
    connection_id: Optional[str] = None, 
    user_email: str = Depends(get_current_user)
):
    """Lista las cuentas del proveedor configurado con reintento de refresh."""
    try:
        service = get_analytics_service(session_id, connection_id, user_email)
        try:
            accounts = await service.list_accounts()
            return {"accounts": [acc.model_dump() for acc in accounts]}
        except Exception as e:
            if "401" in str(e) or "authentication" in str(e).lower() or "unauthenticated" in str(e).lower():
                logger.info("401 detected in list_accounts, attempting forced token refresh...")
                service = get_analytics_service(session_id, connection_id, user_email, force_refresh=True)
                accounts = await service.list_accounts()
                return {"accounts": [acc.model_dump() for acc in accounts]}
            raise e
    except Exception as e:
        logger.error(f"Error in list_accounts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/properties")
async def list_properties(
    account_id: Optional[str] = None, 
    session_id: Optional[str] = None, 
    connection_id: Optional[str] = None, 
    user_email: str = Depends(get_current_user)
):
    """Lista las propiedades del proveedor configurado con reintento de refresh."""
    try:
        clean_account_id = None
        if account_id:
            clean_account_id = account_id.split("/")[-1]
            
        service = get_analytics_service(session_id, connection_id, user_email)
        try:
            properties = await service.list_properties(clean_account_id)
            return {"properties": [prop.model_dump() for prop in properties]}
        except Exception as e:
            if "401" in str(e) or "authentication" in str(e).lower() or "unauthenticated" in str(e).lower():
                logger.info("401 detected in list_properties, attempting forced token refresh...")
                service = get_analytics_service(session_id, connection_id, user_email, force_refresh=True)
                properties = await service.list_properties(clean_account_id)
                return {"properties": [prop.model_dump() for prop in properties]}
            raise e
    except Exception as e:
        logger.error(f"Error in list_properties: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/adobe/segments/{property_id}")
async def list_adobe_segments(
    property_id: str,
    connection_id: str,
    user_email: str = Depends(get_current_user)
):
    """Lista los segmentos disponibles para un Report Suite de Adobe Analytics."""
    try:
        # We must use the analytics service factory to get an authenticated Adobe service
        service = get_analytics_service(connection_id=connection_id, user_email=user_email)
        
        # Check if the service is indeed an AdobeAnalyticsService
        if not isinstance(service, AdobeAnalyticsService):
            raise HTTPException(status_code=400, detail="This endpoint is only for Adobe Analytics connections.")
            
        segments = await service.list_segments(property_id)
        return {"segments": segments}
    except HTTPException as e:
        # Re-raise HTTP exceptions to let FastAPI handle them
        raise e
    except Exception as e:
        logger.error(f"Error in list_adobe_segments for property {property_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run-report", response_model=RunReportResponse)
async def run_report(
    request: RunReportRequest, 
    session_id: Optional[str] = None, 
    connection_id: Optional[str] = None, 
    user_email: str = Depends(get_current_user)
):
    """Ejecuta un reporte en el proveedor configurado."""
    s_id = request.session_id or session_id
    c_id = request.connection_id or connection_id
    service = get_analytics_service(s_id, c_id, user_email)
    result = await service.run_report(request)
    return result

# --- Advanced Analysis Endpoints ---

@router.post("/advanced-report")
async def execute_advanced_report(
    request: AdvancedReportRequest,
    session_id: Optional[str] = None,
    connection_id: Optional[str] = None,
    user_email: str = Depends(get_current_user)
):
    """Ejecuta reporte avanzado con validación de alcances y calidad."""
    s_id = request.session_id or session_id
    c_id = request.connection_id or connection_id
    
    try:
        service = get_analytics_service(s_id, c_id, user_email)
        if getattr(service, "provider", None) == "adobe":
            return await service.execute_advanced_report(
                request.property_id, 
                request.report_type,
                request.start_date, 
                request.end_date,
                request.custom_config
            )
    except Exception as e:
        logger.error(f"Adobe Advanced Report routing failed: {e}")
        return {"error": str(e)}
    
    # Fallback to GA4 Advanced
    credentials = get_credentials(s_id, c_id, user_email)
    if not credentials:
        raise HTTPException(status_code=401, detail="No autenticado")
    
    advanced_service = GA4AdvancedService(credentials=credentials)
    return await advanced_service.execute_advanced_report(
        property_id=request.property_id,
        report_type=request.report_type,
        start_date=request.start_date,
        end_date=request.end_date,
        custom_config=request.custom_config
    )

@router.post("/funnel-analysis")
async def execute_funnel_analysis(
    request: FunnelAnalysisRequest,
    session_id: Optional[str] = None,
    connection_id: Optional[str] = None,
    user_email: str = Depends(get_current_user)
):
    """Ejecuta análisis de funnel (embudo) con eventos secuenciales."""
    s_id = request.session_id or session_id
    c_id = request.connection_id or connection_id
    
    try:
        service = get_analytics_service(s_id, c_id, user_email)
        if getattr(service, "provider", None) == "adobe":
            return await service.execute_funnel_analysis(
                request.property_id, 
                request.steps,
                request.start_date, 
                request.end_date
            )
    except Exception as e:
        logger.error(f"Adobe Funnel routing failed: {e}")
        return {"error": str(e)}
    
    credentials = get_credentials(s_id, c_id, user_email)
    if not credentials:
        raise HTTPException(status_code=401, detail="No autenticado")
    
    advanced_service = GA4AdvancedService(credentials=credentials)
    return await advanced_service.execute_funnel_analysis(
        property_id=request.property_id,
        steps=request.steps,
        start_date=request.start_date,
        end_date=request.end_date
    )

@router.post("/deep-dive")
async def execute_deep_dive(
    request: DeepDiveRequest,
    session_id: Optional[str] = None,
    connection_id: Optional[str] = None,
    user_email: str = Depends(get_current_user)
):
    """Ejecuta análisis profundo (Deep Dive) multisección."""
    s_id = request.session_id or session_id
    c_id = request.connection_id or connection_id
    
    try:
        service = get_analytics_service(s_id, c_id, user_email)
        if getattr(service, "provider", None) == "adobe":
            return await service.execute_deep_dive(request.property_id, request.start_date, request.end_date)
    except Exception as e:
        logger.error(f"Adobe Deep Dive routing failed: {e}")
        return {"error": str(e)}
    
    credentials = get_credentials(s_id, c_id, user_email)
    if not credentials:
        raise HTTPException(status_code=401, detail="No autenticado")
    advanced_service = GA4AdvancedService(credentials=credentials)
    return await advanced_service.execute_deep_dive(request.property_id, request.start_date, request.end_date)

@router.post("/risk-analysis")
async def execute_risk_analysis(
    request: RiskAnalysisRequest,
    user_email: str = Depends(get_current_user)
):
    s_id = request.session_id
    c_id = request.connection_id
    
    try:
        service = get_analytics_service(s_id, c_id, user_email)
        if getattr(service, "provider", None) == "adobe":
            return await service.analyze_risk(
                request.property_id, 
                request.start_date, 
                request.end_date,
                request.break_even_roas
            )
    except Exception as e:
        logger.error(f"Adobe Risk routing failed: {e}")
        return {"error": str(e)}
    
    credentials = get_credentials(s_id, c_id, user_email)
    if not credentials:
        raise HTTPException(status_code=401, detail="No autenticado")
    
    risk_service = GA4RiskService(credentials)
    return await risk_service.analyze_risk(request.property_id, {"start_date": request.start_date, "end_date": request.end_date}, request.break_even_roas)

@router.post("/traffic-ia", response_model=TrafficIAResponse)
async def analyze_traffic_ia(
    request: TrafficIARequest,
    user_email: str = Depends(get_current_user)
):
    s_id = request.session_id
    c_id = request.connection_id
    
    try:
        service = get_analytics_service(s_id, c_id, user_email)
        if getattr(service, "provider", None) == "adobe":
            return await service.analyze_traffic_ia(
                request.property_id, 
                request.start_date, 
                request.end_date,
                language=getattr(request, 'language', 'es'),
                segment_id=getattr(request, 'segment_id', None)
            )
    except Exception as e:
        logger.error(f"Adobe Traffic-IA routing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
    credentials = get_credentials(s_id, c_id, user_email)
    if not credentials:
        raise HTTPException(status_code=401, detail="No autenticado")
    ia_service = GATrafficIAService(credentials)
    return await ia_service.analyze_traffic_ia(request.property_id, {"start_date": request.start_date, "end_date": request.end_date}, language=getattr(request, 'language', 'es'))

@router.post("/traffic-ia/url-analysis", response_model=TrafficIAURLAnalysisResponse)
async def execute_traffic_ia_url_analysis(
    request: TrafficIAURLAnalysisRequest, 
    session_id: Optional[str] = None,
    connection_id: Optional[str] = None,
    user_email: str = Depends(get_current_user)
):
    s_id = request.session_id or session_id
    c_id = request.connection_id or connection_id
    
    try:
        service = get_analytics_service(s_id, c_id, user_email)
        if getattr(service, "provider", None) == "adobe":
            return await service.analyze_url_performance(request.property_id, {"start_date": request.start_date, "end_date": request.end_date}, request.urls)
    except Exception as e:
        logger.error(f"Adobe URL Analysis routing failed: {e}")
        return {"url_performance": [], "summary": {"total_sessions": 0, "urls_analyzed": request.urls}, "daily_trend": [], "traffic_sources_analysis": []}

    credentials = get_credentials(s_id, c_id, user_email)
    if not credentials:
        raise HTTPException(status_code=401, detail="No autenticado")
    traffic_service = GATrafficIAService(credentials=credentials)
    return await traffic_service.analyze_url_performance(request.property_id, {"start_date": request.start_date, "end_date": request.end_date}, request.urls)

@router.get("/property-audit")
async def audit_property(
    property_id: str, 
    session_id: Optional[str] = None,
    connection_id: Optional[str] = None,
    user_email: str = Depends(get_current_user)
):
    """Audita la configuración de una propiedad."""
    service = get_analytics_service(session_id, connection_id, user_email)
    return await service.audit_configuration(property_id)

@router.post("/chat", response_model=ChatResponse)
async def chat_with_data(
    request: ChatRequest,
    session_id: Optional[str] = None,
    connection_id: Optional[str] = None,
    user_email: str = Depends(get_current_user)
):
    """Chat interactivo con los datos de GA4/Adobe."""
    s_id = request.session_id or session_id
    c_id = request.connection_id or connection_id
    
    service = get_analytics_service(s_id, c_id, user_email)
    chat_service = ChatService(service)
    
    result = await chat_service.process_message(
        message=request.message,
        context=request.context,
        chat_history=[{"role": m.role, "content": m.content} for m in (request.chat_history or [])]
    )
    
    return ChatResponse(
        message=result.get("message", ""),
        suggestions=result.get("suggestions"),
        data=result.get("data")
    )

@router.post("/upload-data")
async def upload_data(file: UploadFile = File(...), user_email: str = Depends(get_current_user)):
    """Sube un archivo local para análisis (CSV/Excel)."""
    try:
        from app.services.mcp_analytics.local_data_service import LocalDataService
        service = LocalDataService()
        result = await service.save_file(file, user_email)
        return result
    except Exception as e:
        logger.error(f"Error uploading file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-pdf-insights", response_model=PDFInsightsResponse)
async def generate_pdf_insights(
    request: PDFInsightsRequest,
    user_email: str = Depends(get_current_user)
):
    """
    Genera un análisis narrativo profundo para el reporte PDF usando Gemini.
    """
    try:
        from google import genai
        
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Gemini API Key not configured")
            
        client = genai.Client(api_key=api_key)
        
        # Enriquecer el resumen de datos para el prompt
        data_summary = json.dumps(request.data, indent=2)
        lang_inst = "Responde en Español" if request.language == "es" else "Respond in English"
        
        prompt = f"""
        ERES: Un Consultor Senior de Growth Marketing y Estrategia Digital en LLYC, experto en IA Generativa y Analítica Avanzada.
        OBJETIVO: Analizar los datos de un reporte de '{request.report_type}' de la propiedad '{request.property_name}' y redactar un informe ejecutivo de altísimo valor para el C-Level del cliente.
        
        CONTEXTO DE LOS DATOS (JSON):
        {data_summary}
        
        REGLAS DE ORO DE REDACCIÓN:
        1. {lang_inst}.
        2. TONO: Extremadamente profesional, estratégico, directo y accionable. Evita introducciones genéricas como "Aquí tienes el análisis".
        3. FORMATO: Usa negritas (**KPI**) para resaltar números y hallazgos críticos.
        4. IDENTIDAD: Habla como un consultor humano experto. No menciones que eres una IA.
        5. ENFOQUE: No te limites a leer los datos; interpreta qué significan para el negocio. Si el Sniper Score es bajo, explica por qué y cómo mejorarlo. Si hay tráfico inferido de IA, destaca el potencial de 'Dark Social'.
        
        ESTRUCTURA TÉCNICA REQUERIDA (JSON ESTRICTO):
        Devuelve ÚNICAMENTE un objeto JSON con estas llaves:
        - executive_summary: Un párrafo potente (5-6 líneas) con el hallazgo más disruptivo del período.
        - sections: Una lista de 4 objetos con:
            * 'title': Título estratégico (ej: "Optimización del Funnel de IA", "AEO: El nuevo SEO").
            * 'content': 2-3 párrafos de análisis profundo, citando métricas específicas de los datos adjuntos.
            * 'key_takeaway': Una "bala de plata" o acción táctica inmediata de impacto.
        - footer_disclaimer: Cláusula de confidencialidad y rigor estadístico de LLYC.
        
        INDICACIONES ESPECÍFICAS PARA '{request.report_type}':
        - Analiza la "Batalla de IAs": ¿Qué motor (ChatGPT, Claude, Perplexity) es más eficiente?
        - Comenta sobre los Behavioral Clusters: ¿Por qué tenemos más 'Researchers' o 'Quick Answers'?
        - Sugiere estrategias de AEO (AI Engine Optimization) para las Landing Pages con mayor afinidad.
        """
        
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt,
            config={
                'response_mime_type': 'application/json'
            }
        )
        
        if response and response.text:
            # Clean possible markdown formatting if Gemini returns it despite the config
            clean_text = response.text.strip()
            if clean_text.startswith("```"):
                # Remove first line (e.g. ```json) and last line (```)
                lines = clean_text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines[-1].strip() == "```":
                    lines = lines[:-1]
                clean_text = "\n".join(lines).strip()
                
            return json.loads(clean_text)
        else:
            raise Exception("Empty response from Gemini")
            
    except Exception as e:
        logger.error(f"Failed to generate PDF insights: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/explain-engagement-score", response_model=EngagementScoreExplanationResponse)
async def explain_engagement_score(
    request: EngagementScoreExplanationRequest,
    user_email: str = Depends(get_current_user)
):
    """
    Explica el Engagement Score (Sniper Score) usando IA basada en la metodología oficial.
    """
    try:
        from google import genai
        
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Gemini API Key not configured")
            
        client = genai.Client(api_key=api_key)
        
        lang_inst = "Responde en Español" if request.language == "es" else "Respond in English"
        
        prompt = f"""
        ERES: Un Analista de Datos Senior experto en la metodología "Sniper Score" de LLYC.
        OBJETIVO: Explicar de forma clara y técnica por qué un segmento de tráfico tiene un Engagement Score de {request.engagement_score}.
        
        DATOS ACTUALES:
        - Engagement Score: {request.engagement_score} / 100
        - Conversiones: {request.conversions}
        - Duración Media: {request.avg_duration}s
        - Páginas por Sesión: {request.pages_per_session}
        
        METODOLOGÍA (Sniper Score v3):
        La fórmula es S(c, d, p) = B(c) + [30 / log10((d * p) + 10)]
        Donde:
        - B(c) es un Bono Base: Si hay conversiones (>0), B(c) = 70. Si no, B(c) = 0.
        - d * p es la "Fricción" (Duración x Profundidad).
        - La IA premia la EFICIENCIA: Menos fricción con el mismo resultado sube el score. Una fricción excesiva (dar vueltas sin convertir) baja el score.
        
        REQUERIMIENTOS DE RESPUESTA:
        1. {lang_inst}.
        2. ESTRUCTURA (JSON):
           - explanation: Un párrafo narrativo que interprete el score según la eficiencia observada.
           - methodology_summary: Un resumen de qué es el Sniper Score (máximo 2 líneas).
           - calculation_detail: Una explicación de cómo los datos ({request.conversions} conv, {request.avg_duration}s, {request.pages_per_session} pág) influyeron en el {request.engagement_score} final.
        
        Devuelve ÚNICAMENTE el JSON.
        """
        
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt,
            config={
                'response_mime_type': 'application/json'
            }
        )
        
        if response and response.text:
            clean_text = response.text.strip()
            if clean_text.startswith("```"):
                lines = clean_text.splitlines()
                if lines[0].startswith("```"): lines = lines[1:]
                if lines[-1].strip() == "```": lines = lines[:-1]
                clean_text = "\n".join(lines).strip()
                
            return json.loads(clean_text)
        else:
            raise Exception("Empty response from Gemini")
            
    except Exception as e:
        logger.error(f"Failed to explain engagement score: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==========================================
# 🛠️ ENDPOINTS DE SUPERADMINISTRACIÓN (LLYC)
# ==========================================

from pydantic import Field

class TenantAdminRequest(BaseModel):
    tenant_id: str = Field(..., description="ID del tenant en minúsculas y sin espacios (ej: 'sanitas')")
    tenant_name: str = Field(..., description="Nombre comercial visible (ej: 'Sanitas España')")
    logo_url: str = Field(..., description="URL del logo en SVG/PNG")
    primary_color: str = Field(..., description="Color primario hexadecimal (ej: '#0070B0')")
    secondary_color: str = Field(..., description="Color secundario hexadecimal (ej: '#00A2E2')")
    font_family: str = Field(default="Open Sans, sans-serif", description="Familia tipográfica")
    support_email: str = Field(..., description="Email de soporte del cliente")

class TenantSecretRequest(BaseModel):
    secret_type: str = Field(..., description="Tipo de secreto (ej: 'brandlight-key', 'peec-key')")
    secret_value: str = Field(..., description="Valor sensible de la API key")

def get_current_admin(user_email: str = Depends(get_current_user)):
    """
    Filtro de seguridad estricto para garantizar que sólo cuentas de dominio @llyc.global
    puedan acceder a las operaciones de administración.
    """
    if not user_email.lower().strip().endswith("@llyc.global"):
        raise HTTPException(
            status_code=403,
            detail="Acceso denegado: Se requiere una cuenta corporativa de LLYC"
        )
    return user_email

@router.get("/admin/tenants", response_model=List[Dict[str, Any]])
async def list_tenants_admin(user_email: str = Depends(get_current_admin)):
    """
    Lista todos los tenants creados en Firestore (Solo Superadmin LLYC).
    """
    try:
        from app.services.auth_utils import TokenManager
        tm = TokenManager()
        if not tm.db:
            # Si no hay conexión a Firestore activa, devolver mock inicial
            return [
                {
                    "tenant_id": "sanitas",
                    "tenant_name": "Sanitas España",
                    "logo_url": "https://upload.wikimedia.org/wikipedia/commons/e/e4/Sanitas_Logo.svg",
                    "primary_color": "#0070B0",
                    "secondary_color": "#00A2E2",
                    "font_family": "Open Sans, sans-serif",
                    "support_email": "soporte.sanitas@llyc.global"
                }
            ]
            
        tenants_ref = tm.db.collection("tenants")
        docs = tenants_ref.stream()
        tenants = []
        for doc in docs:
            tenants.append(doc.to_dict())
            
        # Si la base de datos está vacía, retornar al menos LLYC y Sanitas por defecto
        if not tenants:
            return [
                {
                    "tenant_id": "llyc",
                    "tenant_name": "LLYC Intelligence",
                    "logo_url": "https://upload.wikimedia.org/wikipedia/commons/e/e5/LLYC_logo.svg",
                    "primary_color": "#E51D24",
                    "secondary_color": "#1C2541",
                    "font_family": "Montserrat, sans-serif",
                    "support_email": "intelligence.mcp@llyc.global"
                },
                {
                    "tenant_id": "sanitas",
                    "tenant_name": "Sanitas España",
                    "logo_url": "https://upload.wikimedia.org/wikipedia/commons/e/e4/Sanitas_Logo.svg",
                    "primary_color": "#0070B0",
                    "secondary_color": "#00A2E2",
                    "font_family": "Open Sans, sans-serif",
                    "support_email": "soporte.sanitas@llyc.global"
                }
            ]
            
        return tenants
    except Exception as e:
        logger.error(f"Error al listar tenants en admin: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/tenants", response_model=Dict[str, Any])
async def create_or_update_tenant_admin(
    tenant_req: TenantAdminRequest,
    user_email: str = Depends(get_current_admin)
):
    """
    Crea o actualiza la configuración de marca de un tenant en Firestore (Solo Superadmin LLYC).
    """
    try:
        from app.services.auth_utils import TokenManager
        tm = TokenManager()
        tenant_id = tenant_req.tenant_id.lower().strip()
        
        tenant_data = {
            "tenant_id": tenant_id,
            "tenant_name": tenant_req.tenant_name,
            "logo_url": tenant_req.logo_url,
            "primary_color": tenant_req.primary_color,
            "secondary_color": tenant_req.secondary_color,
            "font_family": tenant_req.font_family,
            "support_email": tenant_req.support_email,
            "updated_by": user_email,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if tm.db:
            tm.db.collection("tenants").document(tenant_id).set(tenant_data, merge=True)
            logger.info(f"Tenant '{tenant_id}' guardado con éxito en Firestore por {user_email}")
        else:
            logger.warning("Firestore no disponible, simulando guardado de Tenant local.")
            
        return {"status": "success", "message": f"Tenant '{tenant_id}' guardado con éxito.", "data": tenant_data}
        
    except Exception as e:
        logger.error(f"Error al guardar tenant: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/tenants/{tenant_id}/secrets", response_model=Dict[str, Any])
async def save_tenant_secret_admin(
    tenant_id: str,
    secret_req: TenantSecretRequest,
    user_email: str = Depends(get_current_admin)
):
    """
    Guarda y encripta una clave sensible de un cliente (ej: Brandlight API Key)
    directamente en GCP Secret Manager (Solo Superadmin LLYC).
    """
    try:
        from app.services.mcp_analytics.secret_manager_service import SecretManagerService
        sms = SecretManagerService()
        
        tenant_id_clean = tenant_id.lower().strip()
        secret_type_clean = secret_req.secret_type.lower().strip()
        
        # 1. Guardar secreto en GCP Secret Manager
        success = sms.save_tenant_secret(
            tenant_id=tenant_id_clean,
            secret_type=secret_type_clean,
            secret_value=secret_req.secret_value
        )
        
        if not success:
            raise Exception("No se pudo persistir el secreto en GCP Secret Manager.")
            
        return {
            "status": "success",
            "message": f"Secreto '{secret_type_clean}' guardado y encriptado con éxito para el tenant '{tenant_id_clean}'."
        }
        
    except Exception as e:
        logger.error(f"Error al guardar secreto de tenant en admin: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/tenants/{tenant_id}/logo", response_model=Dict[str, Any])
async def upload_tenant_logo_admin(
    tenant_id: str,
    file: UploadFile = File(...),
    user_email: str = Depends(get_current_admin)
):
    """
    Sube un archivo de logotipo (SVG o PNG) corporativo de un cliente directamente
    a un bucket de Google Cloud Storage (GCS) y devuelve su URL CDN pública (Solo Superadmin LLYC).
    """
    try:
        from app.services.mcp_analytics.gcs_service import GCSService
        gcs = GCSService()
        
        tenant_id_clean = tenant_id.lower().strip()
        content_type = file.content_type or "image/svg+xml"
        
        # Validar tipo de archivo permitido (SVG o PNG)
        if "svg" not in content_type and "png" not in content_type:
            raise HTTPException(
                status_code=400,
                detail="Formato de archivo no permitido: Sólo se admiten archivos SVG (.svg) o PNG (.png)"
            )
            
        file_content = await file.read()
        
        # Subir el logotipo a Google Cloud Storage
        public_url = gcs.upload_logo(
            tenant_id=tenant_id_clean,
            file_content=file_content,
            content_type=content_type
        )
        
        if not public_url:
            raise Exception("Error al subir el logotipo a Google Cloud Storage.")
            
        # Si Firestore está disponible, actualizar de forma automática el logo_url del tenant
        from app.services.auth_utils import TokenManager
        tm = TokenManager()
        if tm.db:
            tm.db.collection("tenants").document(tenant_id_clean).update({"logo_url": public_url})
            logger.info(f"Firestore actualizado con la nueva logo_url de GCS para el tenant '{tenant_id_clean}'.")
            
        return {
            "status": "success",
            "message": f"Logotipo subido y enlazado con éxito para el tenant '{tenant_id_clean}'.",
            "logo_url": public_url
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error al subir logotipo de tenant en admin: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ETLTriggerRequest(BaseModel):
    tenant_id: str = Field(..., description="ID del tenant a sincronizar (ej: 'sanitas')")
    historical_backfill: bool = Field(default=False, description="Si es True, realiza un backfill histórico (ej. últimos 90 días). Si es False, es un incremento de 2 días.")

@router.post("/admin/etl/trigger", response_model=Dict[str, Any])
async def trigger_tenant_etl_admin(
    req: ETLTriggerRequest,
    user_email: str = Depends(get_current_admin)
):
    """
    Desencadena de manera manual o programada (Cloud Scheduler) la ingesta ETL de un cliente.
    Descarga el histórico, limpia duplicados y lo inserta de manera limpia en BigQuery.
    """
    try:
        tenant_id = req.tenant_id.lower().strip()
        
        # 1. Recuperar todas las credenciales activas del tenant desde Secret Manager
        from app.services.mcp_analytics.secret_manager_service import SecretManagerService
        sms = SecretManagerService()
        
        credentials = {}
        secret_types = ["brandlight-key", "peec-key", "ga4-creds", "adobe-creds"]
        for st in secret_types:
            val = sms.get_tenant_secret(tenant_id, st)
            if val:
                credentials[st] = val
                
        # 2. Definir ventana de tiempo (backfill histórico de 90 días vs incremento diario de 2 días)
        if req.historical_backfill:
            date_from = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")
        else:
            date_from = (datetime.utcnow() - timedelta(days=2)).strftime("%Y-%m-%d")
            
        date_to = datetime.utcnow().strftime("%Y-%m-%d")
        
        # 3. Lanzar la ETL de forma asíncrona
        from app.services.mcp_analytics.etl_service import MCPETLService
        etl = MCPETLService(tenant_id=tenant_id)
        
        # Ejecutar sincronización
        sync_result = await etl.run_full_sync(
            credentials=credentials,
            date_from=date_from,
            date_to=date_to
        )
        
        return {
            "status": "success",
            "message": f"ETL completada para el tenant '{tenant_id}'.",
            "sync_details": sync_result
        }
        
    except Exception as e:
        logger.error(f"Error al desencadenar ETL en admin: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/etl/history", response_model=List[Dict[str, Any]])
async def list_etl_history_admin(user_email: str = Depends(get_current_admin)):
    """
    Recupera el historial de ejecuciones de ETL para todos los inquilinos desde Firestore (Solo Superadmin LLYC).
    """
    try:
        from app.services.auth_utils import TokenManager
        tm = TokenManager()
        if not tm.db:
            return []
            
        runs_ref = tm.db.collection("etl_runs")
        # Listar últimas 50 corridas ordenadas por fecha descendente
        docs = runs_ref.order_by("timestamp", direction="DESCENDING").limit(50).stream()
        runs = []
        for doc in docs:
            runs.append(doc.to_dict())
            
        return runs
    except Exception as e:
        logger.error(f"Error al listar historial de ETL: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/etl/alerts", response_model=List[Dict[str, Any]])
async def list_etl_alerts_admin(user_email: str = Depends(get_current_admin)):
    """
    Lista las alertas activas de fallos en el proceso ETL desde Firestore (Solo Superadmin LLYC).
    """
    try:
        from app.services.auth_utils import TokenManager
        tm = TokenManager()
        if not tm.db:
            return []
            
        alerts_ref = tm.db.collection("etl_alerts")
        # Filtrar únicamente alertas activas
        docs = alerts_ref.where("status", "==", "active").order_by("timestamp", direction="DESCENDING").stream()
        alerts = []
        for doc in docs:
            alerts.append(doc.to_dict())
            
        return alerts
    except Exception as e:
        logger.error(f"Error al listar alertas de ETL: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/etl/alerts/{alert_id}/dismiss", response_model=Dict[str, Any])
async def dismiss_etl_alert_admin(
    alert_id: str,
    user_email: str = Depends(get_current_admin)
):
    """
    Marca una alerta de ETL como resuelta/descartada en Firestore (Solo Superadmin LLYC).
    """
    try:
        from app.services.auth_utils import TokenManager
        tm = TokenManager()
        if tm.db:
            alert_ref = tm.db.collection("etl_alerts").document(alert_id)
            alert_ref.update({
                "status": "dismissed",
                "resolved_by": user_email,
                "resolved_at": datetime.utcnow().isoformat()
            })
            logger.info(f"Alerta '{alert_id}' marcada como resuelta por {user_email}")
            return {"status": "success", "message": f"Alerta '{alert_id}' descartada de forma exitosa."}
        else:
            raise Exception("Firestore no está disponible.")
    except Exception as e:
        logger.error(f"Error al descartar alerta de ETL: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/admin/tenants/{tenant_id}/data-gaps", response_model=Dict[str, Any])
async def detect_tenant_data_gaps_admin(
    tenant_id: str,
    user_email: str = Depends(get_current_admin)
):
    """
    Detecta huecos (fechas faltantes sin datos) en las tablas de BigQuery para un tenant (Solo Superadmin LLYC).
    """
    try:
        from app.services.mcp_analytics.bigquery_service import BigQueryService
        bqs = BigQueryService()
        
        tenant_id_clean = tenant_id.lower().strip()
        gaps_result = bqs.get_data_gaps(tenant_id=tenant_id_clean)
        
        return gaps_result
    except Exception as e:
        logger.error(f"Error al detectar huecos para {tenant_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class PatchGapsRequest(BaseModel):
    gaps: List[Dict[str, str]] = Field(..., description="Lista de rangos de fechas a rellenar, ej: [{'start': '2026-06-01', 'end': '2026-06-05'}]")

@router.post("/admin/tenants/{tenant_id}/patch", response_model=Dict[str, Any])
async def patch_tenant_data_gaps_admin(
    tenant_id: str,
    req: PatchGapsRequest,
    user_email: str = Depends(get_current_admin)
):
    """
    Lanza el Patcher de datos para rellenar (sincronizar) de forma masiva los huecos detectados
    en BigQuery de forma limpia y sin duplicados (Solo Superadmin LLYC).
    """
    try:
        tenant_id_clean = tenant_id.lower().strip()
        
        # 1. Recuperar todas las credenciales activas del tenant desde Secret Manager
        from app.services.mcp_analytics.secret_manager_service import SecretManagerService
        sms = SecretManagerService()
        
        credentials = {}
        secret_types = ["brandlight-key", "peec-key", "ga4-creds", "adobe-creds"]
        for st in secret_types:
            val = sms.get_tenant_secret(tenant_id_clean, st)
            if val:
                credentials[st] = val
                
        # 2. Instanciar el coordinador de ETL
        from app.services.mcp_analytics.etl_service import MCPETLService
        etl = MCPETLService(tenant_id=tenant_id_clean)
        
        patch_results = []
        
        # 3. Iterar por cada hueco/rango de fechas solicitado y sincronizarlo de forma limpia (idempotente)
        for gap in req.gaps:
            start_date = gap.get("start")
            end_date = gap.get("end")
            
            if not start_date or not end_date:
                continue
                
            logger.info(f"🛠️ Lanzando Patcher de datos para '{tenant_id_clean}' en el periodo: {start_date} a {end_date}...")
            
            sync_res = await etl.run_full_sync(
                credentials=credentials,
                date_from=start_date,
                date_to=end_date
            )
            
            patch_results.append({
                "range": f"{start_date} a {end_date}",
                "status": sync_res.get("status"),
                "records_processed": sync_res.get("records_processed", 0)
            })
            
        return {
            "status": "success",
            "message": f"Proceso de parchado (Patching) finalizado con éxito para '{tenant_id_clean}'.",
            "patched_ranges": patch_results
        }
        
    except Exception as e:
        logger.error(f"Error al parchar datos del tenant {tenant_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
