# backend/app/services/mcp_analytics/routes/oauth.py
from typing import Dict
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

router = APIRouter()

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
