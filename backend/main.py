# backend/main.py - LLYC Intelligence Dashboard FastAPI Backend (GCP Cloud Run Deploy)
import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LLYC Intelligence Dashboard API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from app.services.mcp_analytics.endpoints import router as mcp_router

app.include_router(mcp_router, prefix="/api/v1/mcp-analytics", tags=["MCP Analytics"])

@app.get("/")
async def root():
    return {"message": "LLYC Intelligence Dashboard API is running", "status": "ok"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
