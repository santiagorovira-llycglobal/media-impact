# LLYC Intelligence Dashboard — Brandlight BI & Enterprise BigQuery Architecture

Este documento detalla los objetivos, arquitectura de datos (Data Warehouse), flujos de trabajo e interfaz de usuario (UX) para el **LLYC Intelligence Dashboard**, alineado con la visión de una **plataforma analítica empresarial, multi-tenant, altamente escalable e integrada con Google BigQuery**.

---

## 🎯 Visión del MVP & Evolución de Arquitectura

El LLYC Intelligence Dashboard evoluciona de ser un prototipo de consulta en tiempo real ("Direct API-to-UI") a convertirse en una **plataforma SaaS analítica robusta respaldada por un Data Lake en Google BigQuery**.

### 🔄 Los 3 Cambios de Paradigma Clave:

1. **Obsolescencia de la Welcome Screen**:
   * *Antes*: El usuario entraba a una pantalla de bienvenida que le solicitaba conectar credenciales o subir archivos cada vez.
   * *Ahora*: El cliente accede a su subdominio (ej: `sanitas.analytics.llyc.ai`) y, tras autenticarse mediante Firebase Auth, **aterriza directamente en su Dashboard pre-configurado**. Las conexiones ya han sido parametrizadas de forma segura por el Superadmin de LLYC.
2. **Carga de Datos CSV en Caliente**:
   * *Antes*: El CSV se subía en la Welcome Screen para "inicializar" el dashboard.
   * *Ahora*: La carga de archivos locales (CSV/Excel) se integra como un **botón de acción directa dentro del propio Dashboard** (en la barra de filtros o cabecera), permitiendo análisis complementarios en caliente sin romper el flujo de visualización.
3. **Arquitectura basada en BigQuery (ETL vs. Live APIs)**:
   * *Antes*: El frontend/backend hacía peticiones en tiempo real a las APIs externas (GA4, Adobe, Brandlight) para pintar los gráficos (lento, propenso a caídas y limitaciones de cuota / rate limits).
   * *Ahora*: Las credenciales guardadas disparan un **motor ETL en segundo plano**. El backend extrae la información de las APIs de origen, la unifica y la almacena estructuradamente en **Google BigQuery**. El Dashboard consulta **únicamente a BigQuery**, garantizando velocidad de carga ultrarrápida (<500ms), persistencia histórica e independencia de las APIs de origen.

---

## 🏛️ Arquitectura de Datos Unificada (ETL & BigQuery)

```
[ GA4 / Adobe Analytics ] ──┐
[ Peec.ai Analytics ] ────┼──► [ Proceso ETL ] ──► [ Google BigQuery ] ──► [ FastAPI Backend ] ──► [ React Frontend ]
[ Brandlight BI API ] ────┘    (GCP Cloud Run)    (Tablas por Tenant)     (Consultas Estructuradas) (Visualización)
```

### 1. El Proceso ETL (Extract, Transform, Load)
* **Activación**: Se ejecuta de forma programada (cron diario/semanal) o se dispara bajo demanda cuando el Superadmin añade o actualiza credenciales.
* **Extracción**: Consume datos de GA4 (API de Reportes), Adobe (analytics API), Peec.ai y Brandlight (reportes de visibilidad y Share of Voice).
* **Transformación**: Normaliza las métricas y dimensiones a un esquema común (Schema Alignment):
  - Fechas en formato estándar `YYYY-MM-DD`.
  - Normalización de dimensiones de tráfico orgánico, referido de IA y búsquedas orgánicas.
* **Carga**: Inserta los registros procesados en **Google BigQuery**.

### 2. Estructura de BigQuery (Data Warehouse Schema)
Para garantizar la segregación absoluta de inquilinos, utilizaremos un dataset único con **tablas particionadas por `tenant_id`**, o datasets independientes por cliente si las políticas de ciberseguridad corporativas lo exigen:

* **Tabla `fact_traffic_evolution`**:
  `tenant_id | date | source | medium | total_sessions | ai_referred_sessions | engagement_score`
* **Tabla `fact_ai_visibility`**:
  `tenant_id | date | engine_name | visibility_score | sentiment_score | share_of_voice`
* **Tabla `dim_content_recommendations`**:
  `tenant_id | date | topic | priority_score | recommendation_strategy | execution_steps`

---

## 🎨 Flujos de Experiencia de Usuario (UX)

### A. Experiencia del Cliente (End User)
1. El usuario accede a `https://sanitas.analytics.llyc.global`.
2. Visualiza una pantalla de **Login Corporativo** (Firebase Auth).
3. Tras loguearse, entra directamente a su Dashboard pintado con su logotipo oficial y sus colores corporativos (azul Sanitas).
4. El Dashboard carga instantáneamente los datos de tráfico e IA desde las tablas de BigQuery.
5. Si desea cruzar datos históricos con un reporte local nuevo, hace clic en el botón **"Importar datos locales (CSV)"** en la barra superior para procesar el archivo en caliente.

### B. Experiencia del Consultor de LLYC (Superadmin)
1. El consultor accede a `https://analytics.llyc.global/admin`.
2. Se autentica obligatoriamente con su cuenta corporativa de Google Workspace (`@llyc.global`).
3. Accede al **Panel de Control Centralizado**:
   - **Gestor de Tenants**: Crear un nuevo cliente (ej: `Sanitas`), subir su logotipo en SVG, definir sus colores hexadecimales y guardar.
   - **Gestor de Conexiones (Secret Manager)**: Introducir las API Keys, tokens OAuth o Client Secrets de GA4, Adobe, Brandlight y Peec de forma segura.
   - **Trigger de ETL**: Botón para forzar la sincronización inicial de datos del nuevo cliente hacia BigQuery en caliente.

---

## 📅 Roadmap de Implementación Refactorizado

### 🏁 Fase 1: Core del Backend, Secret Manager & BigQuery Setup
* [x] Diseñar y desplegar `SecretManagerService` para resguardo de llaves sensibles.
* [x] Crear endpoints CRUD de administración de Tenants (`endpoints.py`) protegidos para cuentas `@llyc.global`.
* [ ] Crear las tablas base y esquemas de datos en **Google BigQuery**.
* [ ] Diseñar el servicio de conexión a BigQuery (`BigQueryService`) en FastAPI para servir datos tabulares al dashboard.

### ⚙️ Fase 2: Proceso ETL & Conectores de Datos (Brandlight)
* [ ] Refactorizar el `BrandlightService` bajo el patrón `AnalyticsService` para extraer métricas de visibilidad y Share of Voice.
* [ ] Implementar el script o función de **ETL unificada** (`etl_service.py`) que extraiga datos de los conectores (Brandlight, Peec, GA4, Adobe) y los cargue en BigQuery.

### 💻 Fase 3: Frontend Admin Panel & Refactorización de UX
* [ ] **Refactor de Bienvenida**: Convertir `WelcomeScreen.tsx` en una pantalla de Login pura o derivar el acceso directo al dashboard según el subdominio.
* [ ] **Integrar CSV en el Dashboard**: Mover la carga de CSV de la pantalla de bienvenida a un botón/modal interactivo dentro del Navbar o barra de filtros.
* [ ] **Crear la vista `/admin`**: Diseñar el formulario interactivo para que los consultores de LLYC administren clientes y guarden secretos de forma visual.

### 🧪 Fase 4: Integración, QA y Despliegue de Producción
* [ ] Validar los permisos de IAM de la cuenta de servicio de GCP para leer/escribir en BigQuery.
* [ ] Pruebas extremas de visualización dinámica cruzando datos de BigQuery.
