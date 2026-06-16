#!/bin/bash

# Script de Testeo Local - LLYC Intelligence Dashboard (MIGRADO A REACT)
# Este script levanta el backend (FastAPI) y el frontend (Vite/React).

echo "🚀 Iniciando entorno de testeo local (React Version)..."

# 1. Configuración del Backend
echo "📦 Configurando Backend (puerto 8080)..."
cd backend

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt --quiet

if [ ! -f ".env" ]; then
    echo "⚠️ ADVERTENCIA: No se encontró el archivo backend/.env"
    echo "Copiando plantilla base dinámica..."
    ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
    printf "GCP_PROJECT_ID=$ACTIVE_PROJECT\nGOOGLE_CLOUD_PROJECT=$ACTIVE_PROJECT\nGEMINI_API_KEY=tu_api_key_aqui\n" > .env
fi

# Iniciar backend en segundo plano
uvicorn main:app --host 127.0.0.1 --port 8080 > ../backend.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend corriendo en http://localhost:8080 (PID: $BACKEND_PID)"

# 2. Configuración del Frontend
echo "⚛️ Configurando Frontend React (puerto 3000)..."
cd ../frontend

# Asegurar dependencias
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install --silent
fi

# Iniciar servidor de desarrollo Vite en segundo plano
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend React corriendo en http://localhost:3000 (PID: $FRONTEND_PID)"

echo "--------------------------------------------------------"
echo "✅ TODO LISTO: Abre http://localhost:3000 en tu navegador"
echo "Para detener los servidores, usa: kill $BACKEND_PID $FRONTEND_PID"
echo "Los logs están disponibles en backend.log y frontend.log"
echo "--------------------------------------------------------"

# Mantener el script vivo
wait
