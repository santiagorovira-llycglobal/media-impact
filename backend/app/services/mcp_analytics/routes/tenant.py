# backend/app/services/mcp_analytics/routes/tenant.py
import logging
from typing import Optional

from fastapi import APIRouter, Request, Query, HTTPException
from pydantic import BaseModel

from app.services.auth_utils import TokenManager

logger = logging.getLogger(__name__)
router = APIRouter()

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
    # 1. Intentar obtener el tenant desde el host (ej: cliente.dashboard.llyc.global)
    host = request.headers.get("host", "")
    detected_tenant = None
    
    # Si contiene subdominios y no es localhost, extraer el primer segmento
    if host and "localhost" not in host and "127.0.0.1" not in host:
        parts = host.split(".")
        if len(parts) > 2:  # Ej: cliente.dashboard.llyc.global -> ['cliente', 'dashboard', 'llyc', 'global']
            detected_tenant = parts[0].lower().strip()
            
    # 2. Si no se detectó o se pasa como Query (híbrido para demos), usar el parámetro query
    if tenant:
        detected_tenant = tenant.lower().strip()
        
    # 3. Si sigue sin detectarse o es un valor vacío, usar el de LLYC por defecto
    if not detected_tenant or detected_tenant in ["www", "dashboard", "analytics", "media-impact-llyc"]:
        detected_tenant = "llyc"
        
    # 4. Intentar consultar la configuración en vivo en Firestore
    try:
        tm = TokenManager()
        if tm.db:
            doc = tm.db.collection("tenants").document(detected_tenant).get()
            if doc.exists:
                logger.info(f"Configuración de tenant '{detected_tenant}' recuperada con éxito desde Firestore.")
                return doc.to_dict()
    except Exception as e:
        logger.warning(f"No se pudo consultar el tenant '{detected_tenant}' en Firestore (usando fallback local): {e}")

    # 5. Mapeo de bases de datos de inquilinos local (Solo LLYC como fallback del sistema base)
    tenant_database = {
        "llyc": {
            "tenant_id": "llyc",
            "tenant_name": "LLYC Intelligence",
            "logo_url": "/logo_llyc.svg",
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
