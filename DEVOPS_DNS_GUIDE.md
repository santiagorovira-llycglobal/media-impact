# LLYC Intelligence Dashboard — Guía de Configuración DNS, Firebase y GCP

Este documento proporciona los detalles técnicos, registros DNS, secretos de GitHub Actions y permisos de IAM necesarios para que el equipo de Infraestructura / TI pueda **dar de alta la infraestructura cloud, configurar el DNS y habilitar el despliegue continuo (CI/CD)**.

---

## 🌐 1. Arquitectura de Dominio y DNS

Manejaremos un esquema multi-tenant basado en subdominios dinámicos:
* **Dominio Base**: `analytics.llyc.ai`
* **Esquema de Clientes**: `*.analytics.llyc.ai` (ej: `cocacola.analytics.llyc.ai`, `santander.analytics.llyc.ai`).

### Registros DNS Requeridos (A configurar por TI en el DNS de LLYC)

Para habilitar subdominios dinámicos e integrarlos con Firebase Hosting, se deben configurar los siguientes registros en el proveedor de DNS:

| Tipo | Host / Nombre | Valor / Destino | TTL | Propósito |
| :--- | :--- | :--- | :--- | :--- |
| **CNAME** | `analytics` | `c.storage.googleapis.com.` (o el asignado por Firebase) | Auto / 3600 | Dominio de aterrizaje principal |
| **A (Wildcard)** | `*.analytics` | **[IP de Firebase Hosting 1]**<br>**[IP de Firebase Hosting 2]** | Auto / 3600 | Redirección de todos los subdominios de clientes a Firebase Hosting |
| **TXT** | `analytics.llyc.ai` | `firebase-verification-hash-proporcionado-por-consola` | Auto / 3600 | Verificación de propiedad del dominio en Firebase |

> 💡 *Nota: Las IPs específicas de Firebase Hosting se obtienen de la consola de Firebase al dar de alta el dominio personalizado.*

---

## 🔒 2. Configuración en Firebase (DNS & Auth Hub)

Se deben aprovisionar los siguientes servicios en la consola de Firebase:

### A. Proyecto de Firebase
1. Crear un proyecto en Firebase (ej: `llyc-intelligence-mcp`).
2. Enlazarlo con el proyecto de Google Cloud (compartiendo el mismo ID de proyecto) para habilitar el uso integrado de Secret Manager y Cloud Run.

### B. Firebase Auth (Gestor de Identidades & Google OAuth)
1. Activar **Firebase Authentication**.
2. Habilitar el proveedor de inicio de sesión de **Google** (Google Sign-In).
3. Configurar los **Dominios Autorizados** (Authorized Domains) en la pestaña *Ajustes de Firebase Auth*:
   - Añadir `media-impact-llyc.web.app`
   - Añadir `*.analytics.llyc.ai` (o el dominio final corporativo)
   - Añadir `localhost` e `127.0.0.1` (para desarrollo local)
4. Configurar el **Cliente de OAuth 2.0 de Google** en la consola de Google Cloud (`APIs y servicios > Credenciales > ID de cliente de OAuth 2.0`):
   - **Orígenes de JavaScript autorizados**:
     - `https://media-impact-llyc.web.app`
     - `http://localhost:5173`
     - `http://localhost:3000`
   - **URIs de redirección autorizados**:
     - `https://llyc-adtech-pruebas.firebaseapp.com/__/auth/handler` (Este callback es crítico para que el Popup de Firebase resuelva de forma exitosa).

### C. Firebase Hosting (Frontend & Enrutamiento de API)
La plataforma utiliza un único dominio unificado mediante redirección en el archivo `firebase.json` de la raíz:
- `/api/v1/**` redirige al backend en Cloud Run (`llyc-intelligence-api`).
- `**` sirve la SPA de React en `frontend/dist/index.html`.

---

## ☁️ 3. Permisos de IAM en GCP (Cuenta de Servicio de Despliegue)

Se requiere crear una Cuenta de Servicio en Google Cloud (ej: `github-actions-deployer@<project-id>.iam.gserviceaccount.com`) para que GitHub Actions pueda desplegar y gestionar los recursos. Debe tener asignados estrictamente los siguientes roles de IAM:

| Servicio GCP | Rol de IAM | Propósito |
| :--- | :--- | :--- |
| **Cloud Run** | `Cloud Run Admin` (`roles/run.admin`) | Crear, actualizar y desplegar la API del backend. |
| **Cloud Build** | `Cloud Build Editor` (`roles/cloudbuild.builds.editor`) | Compilar el código del backend en contenedores en GCP. |
| **Storage** | `Storage Admin` (`roles/storage.admin`) | Almacenar temporalmente los fuentes compilados de la API. |
| **Artifact Registry** | `Artifact Registry Writer` (`roles/artifactregistry.writer`) | Subir la imagen de Docker compilada al registro de GCP. |
| **IAM** | `Service Account User` (`roles/iam.serviceAccountUser`) | Permitir a Cloud Run ejecutarse bajo la identidad del backend. |
| **Secret Manager** | `Secret Manager Admin` (`roles/secretmanager.admin`) | Permitir que el backend (y opcionalmente el desplegador) administre secretos de clientes. |

---

## 🔑 4. Secretos Requeridos en GitHub Actions para el CI/CD

Para automatizar el pipeline de despliegue continuo de manera modular y permitir **cambiar el proyecto de GCP de forma 100% parametrizada sin modificar el código**, el equipo de TI debe configurar los siguientes secretos en el repositorio de GitHub (`Settings > Secrets and variables > Actions`):

### Variables de Entorno y Configuración Cloud
* **`GCP_PROJECT_ID`**: El ID del proyecto de Google Cloud / Firebase donde se desplegará todo (ej: `llyc-intelligence-mcp-prod`). **Esto permite migrar la plataforma a otro proyecto de GCP simplemente cambiando este valor.**
* **`GCP_SA_KEY`**: La clave privada JSON de la cuenta de servicio de GCP creada en el punto 3.
* **`VITE_FIREBASE_API_KEY`**: La API Key pública de Firebase Web (ej: `AIzaSyA2-o1pcwp5wNGCzEP09V34mdzG8LZMDak`). **Al guardarla aquí, se inyecta de forma segura únicamente en tiempo de compilación de React, protegiendo el código de tener secretos expuestos en Git.**
* **`FIREBASE_SERVICE_ACCOUNT_KEY`**: La clave JSON de la cuenta de servicio generada desde la consola de Firebase. Se requiere para que Firebase Hosting autorice la publicación del frontend (opcional si se usa GCP_SA_KEY).

### Credenciales de APIs de Analítica
* **`GEMINI_API_KEY`**: Clave de API de Google Gemini para habilitar los análisis inteligentes automatizados.
* **`GOOGLE_CLIENT_ID`**: ID de cliente OAuth 2.0 de Google.
* **`GOOGLE_CLIENT_SECRET`**: Clave secreta OAuth 2.0 de Google.

---

## 📋 Resumen de Acción Inmediata para el Equipo de TI

1. **Paso 1**: Crear el proyecto unificado en la consola de Firebase/GCP.
2. **Paso 3**: Generar las claves JSON para la cuenta de servicio de GCP y la cuenta de servicio de Firebase.
3. **Paso 4**: Añadir los 6 secretos listados en la sección 4 en el repositorio de GitHub de LLYC.
4. **Paso 5**: Dar de alta el dominio personalizado `analytics.llyc.ai` en Firebase Hosting y añadir los registros DNS correspondientes (incluyendo el Wildcard `*.analytics.llyc.ai`).
