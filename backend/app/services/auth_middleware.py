import os
import logging
from fastapi import Security, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials

logger = logging.getLogger(__name__)

# Configuración del esquema de autenticación HTTP Bearer
security = HTTPBearer(auto_error=False)

# Inicializar Firebase Admin SDK de forma segura
# En GCP (Cloud Run), se autentica automáticamente con la Service Account por defecto del host.
try:
    if not firebase_admin._apps:
        # Intenta usar Application Default Credentials (ADC)
        try:
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK inicializado exitosamente usando Application Default Credentials.")
        except Exception as adc_err:
            # Fallback a inicialización sin argumentos (para inicializar de forma perezosa en desarrollo)
            firebase_admin.initialize_app()
            logger.info("Firebase Admin SDK inicializado de forma por defecto.")
except Exception as e:
    logger.warning(f"No se pudo inicializar Firebase Admin SDK de forma nativa: {e}. "
                   f"Se requerirá configuración de variables de entorno de GCP o un bypass de desarrollo.")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> str:
    """
    Inyección de dependencia de FastAPI que valida criptográficamente el token JWT 
    de Firebase Auth enviado en la cabecera 'Authorization: Bearer <JWT>'.
    
    Permite un bypass controlado UNICAMENTE en desarrollo local si está habilitado mediante variables de entorno.
    """
    is_production = os.getenv("K_SERVICE") is not None or os.getenv("ENVIRONMENT") == "production"
    bypass_local = os.getenv("BYPASS_AUTH_LOCAL", "false").lower() == "true"
    
    # 1. Si no hay credenciales Bearer
    if not credentials:
        if not is_production and bypass_local:
            dev_user = os.getenv("DEFAULT_USER_EMAIL", "developer@llyc.global")
            logger.info(f"[AUTH BYPASS] Desarrollo local: No JWT provisto. Usando usuario de pruebas: {dev_user}")
            return dev_user
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Falta la cabecera de autenticación 'Authorization: Bearer <JWT>'.",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    token = credentials.credentials
    
    # 2. Validar el token contra los servidores de Firebase
    try:
        decoded_token = firebase_auth.verify_id_token(token)
        email = decoded_token.get("email")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="El token de autenticación de Firebase no contiene un correo electrónico de usuario válido.",
            )
        return email
        
    except Exception as e:
        # Si la validación falla pero es desarrollo local con bypass habilitado, permitir el fallback
        if not is_production and bypass_local:
            dev_user = os.getenv("DEFAULT_USER_EMAIL", "developer@llyc.global")
            logger.warning(f"[AUTH BYPASS] Error validando JWT ({e}). Usando usuario de pruebas local: {dev_user}")
            return dev_user
            
        logger.error(f"Error de autenticación de Firebase Auth: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token de Firebase inválido o expirado: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

