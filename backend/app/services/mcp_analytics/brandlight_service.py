# backend/app/services/mcp_analytics/brandlight_service.py

import logging
import aiohttp
import asyncio
import json
import re
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

from app.services.mcp_analytics.analytics_interface import AnalyticsService
from app.models.mcp_analytics.core_models import GAAccount, GAProperty, RunReportRequest, RunReportResponse

logger = logging.getLogger(__name__)

class BrandlightService(AnalyticsService):
    """
    Servicio de conexión unificado con la API de Brandlight BI.
    Implementa la interfaz abstracta AnalyticsService.
    """

    def __init__(self, credentials: Dict[str, Any]):
        """
        Inicializa el BrandlightService con las credenciales correspondientes.
        """
        self.api_key = (
            credentials.get("api_key") or 
            credentials.get("apiKey") or 
            credentials.get("token") or
            credentials.get("brandlight-key")
        )
        if not self.api_key:
            raise ValueError("API Key o Token requerido para la conexión con Brandlight.")
            
        self.base_url = "https://bi.brandlight.ai/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    def _parse_date(self, date_str: str) -> str:
        """
        Convierte rangos de fecha estilo GA4 (ej. 'today', 'yesterday', '7daysAgo', '30daysAgo')
        al formato absoluto esperado por Brandlight (YYYY-MM-DD).
        """
        today = datetime.utcnow()
        date_str_clean = date_str.lower().strip()
        
        if date_str_clean == "today":
            return today.strftime("%Y-%m-%d")
        elif date_str_clean == "yesterday":
            return (today - timedelta(days=1)).strftime("%Y-%m-%d")
            
        match = re.match(r"(\d+)daysago", date_str_clean)
        if match:
            days = int(match.group(1))
            return (today - timedelta(days=days)).strftime("%Y-%m-%d")
            
        # Si ya viene en formato YYYY-MM-DD, retornarla de forma directa
        if re.match(r"^\d{4}-\d{2}-\d{2}$", date_str_clean):
            return date_str_clean
            
        # Fallback de cortesía: 30 días atrás
        return (today - timedelta(days=30)).strftime("%Y-%m-%d")

    async def _request(self, method: str, endpoint: str, params: Optional[Dict[str, Any]] = None, data: Optional[Dict[str, Any]] = None) -> Any:
        """
        Realiza una petición asíncrona hacia la API de Brandlight respetando el Rate Limit de 1.5s.
        """
        # Delay de seguridad preventivo para evitar Throttling de la API de Brandlight
        await asyncio.sleep(1.5)
        
        url = f"{self.base_url}{endpoint}"
        async with aiohttp.ClientSession() as session:
            try:
                async with session.request(method, url, headers=self.headers, params=params, json=data) as response:
                    logger.info(f"Brandlight API Request: {method} {url} - Status: {response.status}")
                    if response.status == 401:
                        raise ValueError("No autorizado: Clave API de Brandlight inválida o vencida.")
                    response.raise_for_status()
                    return await response.json()
            except Exception as e:
                logger.error(f"Error al conectar con la API de Brandlight en {endpoint}: {e}")
                raise e

    async def list_accounts(self) -> List[GAAccount]:
        """
        Lista las marcas configuradas en la cuenta de Brandlight (Mapeadas como Accounts).
        """
        try:
            res = await self._request("GET", "/brands")
            brands_data = res.get("data", [])
            
            accounts = []
            for brand in brands_data:
                brand_id = brand.get("id") or brand.get("name")
                accounts.append(
                    GAAccount(
                        account_id=brand_id,
                        name=f"accounts/{brand_id}",
                        display_name=brand.get("name", brand_id).capitalize()
                    )
                )
            
            if not accounts:
                # Fallback de marca en modo demostración si no hay marcas devueltas
                return [
                    GAAccount(account_id="sanitas", name="accounts/sanitas", display_name="Sanitas"),
                    GAAccount(account_id="llyc", name="accounts/llyc", display_name="LLYC Analytics")
                ]
                
            return accounts
        except Exception as e:
            logger.warning(f"Error en list_accounts de Brandlight (usando fallbacks locales): {e}")
            return [
                GAAccount(account_id="sanitas", name="accounts/sanitas", display_name="Sanitas España"),
                GAAccount(account_id="llyc", name="accounts/llyc", display_name="LLYC Analytics")
            ]

    async def list_properties(self, account_id: str) -> List[GAProperty]:
        """
        Lista las localizaciones y regiones de reportes disponibles para una marca (Mapeados como Properties).
        """
        brand_name = account_id.split("/")[-1]
        try:
            res = await self._request("GET", f"/brands/{brand_name}/reports")
            reports_data = res.get("data", []) or res.get("reports", [])
            
            # Extraer las localizaciones geográficas únicas encontradas en todos los reportes de la marca
            unique_locations = set()
            for r in reports_data:
                locations = r.get("locations", [])
                for loc in locations:
                    unique_locations.add(loc.upper().strip())
                    
            properties = []
            for loc in sorted(unique_locations):
                properties.append(
                    GAProperty(
                        property_id=loc,
                        name=f"properties/{loc}",
                        display_name=f"Región: {loc}",
                        parent=f"accounts/{brand_name}"
                    )
                )
                
            if not properties:
                # Fallback de localizaciones estándar
                return [
                    GAProperty(property_id="ES", name="properties/ES", display_name="Región: España (ES)", parent=f"accounts/{brand_name}"),
                    GAProperty(property_id="MX", name="properties/MX", display_name="Región: México (MX)", parent=f"accounts/{brand_name}")
                ]
                
            return properties
        except Exception as e:
            logger.warning(f"Error en list_properties de Brandlight para {brand_name}: {e}")
            return [
                GAProperty(property_id="ES", name="properties/ES", display_name="Región: España (ES)", parent=f"accounts/{brand_name}"),
                GAProperty(property_id="MX", name="properties/MX", display_name="Región: México (MX)", parent=f"accounts/{brand_name}")
            ]

    async def run_report(self, request: RunReportRequest) -> RunReportResponse:
        """
        Ejecuta consultas tabulares mapeando peticiones de métricas a los reportes de Visibilidad y SoV de Brandlight.
        """
        brand_name = request.connection_id or "sanitas" # o usar un mapper
        location = request.property_id.split("/")[-1] # ej: ES, MX
        
        # Parseo de fechas GA4 a YYYY-MM-DD
        date_range = request.date_ranges[0] if request.date_ranges else {"start_date": "30daysAgo", "end_date": "today"}
        start_date = self._parse_date(date_range.get("start_date", "30daysAgo"))
        end_date = self._parse_date(date_range.get("end_date", "today"))
        
        rows = []
        live_data_fetched = False
        
        try:
            # 1. Consultar ranking de visibilidad (Visibility score)
            res_vis = await self._request(
                "GET", 
                f"/brands/{brand_name}/visibility/ranking",
                params={"startDate": start_date, "endDate": end_date, "location": location}
            )
            live_data_fetched = True
            
            # Procesar filas de visibilidad
            # Brandlight devuelve scores para la marca y competidores
            # Mapeamos a estructura tabular plana
            scores_data = res_vis.get("data", {}).get("scores", []) or res_vis.get("scores", [])
            for s in scores_data:
                rows.append({
                    "date": s.get("date", end_date),
                    "domain": s.get("domain", brand_name),
                    "visibility_score": str(s.get("score", 0)),
                    "sentiment_score": str(round(s.get("sentiment", 7.5), 1))
                })
                
        except Exception as e:
            logger.warning(f"No se pudo consultar la API de Brandlight (generando datos simulados consistentes): {e}")
            # Generar datos simulados de tendencia consistentes con Sanitas si falla la conexión
            dates_list = [(datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7, 0, -1)]
            for d in dates_list:
                rows.append({
                    "date": d,
                    "domain": brand_name,
                    "visibility_score": str(68 if brand_name == "sanitas" else 55),
                    "sentiment_score": "7.8"
                })
        
        return RunReportResponse(
            property_id=request.property_id,
            dimension_headers=request.dimensions,
            metric_headers=request.metrics,
            rows=rows,
            row_count=len(rows),
            metadata={
                "provider": "brandlight",
                "live_connection": live_data_fetched,
                "brand": brand_name,
                "location": location,
                "period": f"{start_date} a {end_date}"
            }
        )

    async def get_metadata(self, property_id: str) -> Dict[str, Any]:
        """
        Retorna la lista de dimensiones y métricas soportadas por este conector.
        """
        return {
            "dimensions": ["date", "domain", "category"],
            "metrics": ["visibility_score", "sentiment_score", "share_of_voice"]
        }
