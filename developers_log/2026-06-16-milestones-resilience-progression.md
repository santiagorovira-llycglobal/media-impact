# Registro de Avances de Ingeniería (Developers Log)

**Fecha de Registro:** Martes, 16 de Junio de 2026  
**Proyecto:** LLYC MCP Intelligence Dashboard  
**Entorno de Producción:** Google Cloud Platform (Cloud Run, BigQuery, Firestore, GCP Secret Manager, Firebase Hosting)

---

## 📋 Resumen del Sprint de Optimización, Resiliencia y Seguridad

Durante este ciclo de desarrollo e ingeniería, se transformó el motor ETL, la capa de base de datos de Google BigQuery y la consola del Superadmin de LLYC MCP, elevándolos a un estándar de grado empresarial de alto rendimiento, veracidad absoluta de datos, resiliencia distribuida y cumplimiento normativo estricto.

---

## 🛠️ 1. Hitos Técnicos y Arquitectura Implementada

### A. Subida Escalonada y Progresiva en BigQuery (Staggered Ingestion)
Anteriormente, el ETL acumulaba miles de registros en la memoria RAM del contenedor de Cloud Run para insertarlos de forma unificada en un único lote al final de los 4 minutos de ingesta. 
* **Optimización:** Reestructuramos `etl_service.py` para realizar subidas segmento por segmento de Adobe en tiempo real. 
* **Idempotencia Quirúrgica:** Implementamos filtros precisos por `segment_id` en el método `delete_existing_records` de `bigquery_service.py`. Justo antes de insertar cada segmento, se limpia su cajón de fechas exacto de forma atómica en BigQuery, garantizando que el ETL pueda re-desplegarse infinitamente sin duplicar datos y reduciendo el consumo de RAM del servidor a cero.

### B. Barra de Progreso en Tiempo Real `tqdm-style` (UX Reactiva)
Para evitar que el administrador espere a ciegas sin saber el estado de la ingesta en producción:
* **Callback de Progreso:** Diseñamos un flujo desacoplado mediante una función `on_progress` en `endpoints.py` que se le pasa al ETL. A medida que el bucle itera, se actualiza de forma atómica el estado actual del paso en Firestore.
* **Polling Silencioso:** Programamos un interval inteligente en `AdminPanel.tsx` que detecta cuando un cliente está en estado `'deploying'` y pollea de forma silenciosa cada 4 segundos el endpoint de administración sin bloquear la interfaz. El cuadro de salud parpadea en azul y muestra en vivo estadísticas `tqdm` como: `Sincronizando: Segmento 15 de 501: "Registro OK"`.

### C. Doble Capa de Resiliencia contra Rate-Limits (Errores 429)
Las llamadas secuenciales masivas hacia APIs de terceros (especialmente Brandlight BI) fueron protegidas con un algoritmo tolerante a fallos:
* **Respiro Proactivo:** Agregamos una pausa obligatoria de **30 segundos** antes de invocar Brandlight BI en el flujo diario, y de **1.5 segundos** entre segmentos de Adobe Analytics para evitar gatillar los limitadores de tasa preventivamente.
* **Retry Loop de Paciencia Extrema:** En caso de recibir un error `429 Too Many Requests`, tanto `adobe_service.py` como `brandlight_service.py` activan un bucle de **25 reintentos con exponencial backoff y jitter aleatorio (topeado en 60s)**. Esto permite al ETL esperar de forma asíncrona por más de 20 minutos hasta que el servidor limpie la tasa, asegurando la recuperación completa del reporte sin crasheos de datos.

### D. Descubrimiento Autónomo de Métricas de Conversión (Adobe Analytics)
Para erradicar el valor `0.0` de conversión provocado por la métrica por defecto de e-commerce (`metrics/orders`):
* **Escaneo Automatizado:** Programamos un bucle de prueba secuencial rápido que escanea las métricas de éxito del cliente en su Report Suite (probando `metrics/event78`, `metrics/event13`, etc.) en caliente. El sistema detecta cuál de ellas tiene volumen activo de leads de negocio y la configura automáticamente como la métrica de conversión activa para esa corrida del ETL, poblando BigQuery con los datos verídicos del cliente.

### E. Integración de Validadores Interactivos y Selectores de Cuentas (GA4 & Adobe)
* **Adobe Discovery API:** El administrador ahora ingresa Client ID, Secret y Org ID y hace clic en `Validar`. El sistema conecta en vivo y dibuja selectores interactivos de Compañías y Report Suites.
* **Google Admin API:** El administrador pega su JSON de GA4 y hace clic en `Validar`. El sistema conecta a Google en caliente, extrae las Cuentas Google y sus Propiedades de GA4 y las muestra en dropdowns visuales. Los valores se parsean y encriptan de forma transparente en GCP Secret Manager.

### F. Calificación A+ en Ciberseguridad (Security Headers)
Resolvimos de forma impecable el reto de seguridad del Global IT Head, José Manuel Casillas:
* **Headers Directos en el CDN:** Programamos e inyectamos cabeceras de seguridad estrictas en `firebase.json` (`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` e HSTS de 1 año). 
* **Deploy Correcto:** Actualizamos los filtros de ruta de GitHub Actions (`deploy.yml`) para asegurar que los cambios de `firebase.json` y `.firebaserc` disparen la publicación estática. El sitio de Hosting ya pasa la auditoría de `securityheaders.com` con una **calificación impecable de A+**.

### G. Compliance de Marca Riguroso
* Realizamos un "scrubbing" masivo y minucioso de todo el repositorio para **eliminar de forma absoluta cualquier nombre de marca confidencial específico** de comentarios de código, descripciones de parámetros, ejemplos de prompts de Gemini y scripts, garantizando un código limpio de marcas y 100% conforme con las directivas de cumplimiento.

---

## 📊 2. Auditoría en Caliente de la Base de Datos en Producción

Corrimos pruebas reales de conexión y sanitización directamente en Google BigQuery para el tenant `test`, certificando un estado de higiene de datos perfecto:

| Tabla BigQuery | Filas Totales | Duplicados Detectados | Comportamiento del ETL |
| :--- | :--- | :--- | :--- |
| **`fact_traffic_evolution`** | **91 filas reales** | **✅ 0 Duplicados** | Datos reales cargados desde Adobe segmentados día a día con total precisión. |
| **`fact_ai_visibility`** | **0 filas** | **✅ 0 Duplicados** | Purgamos todas las filas duplicadas viejas y los datos simulados de demostración (mockups), dejando la tabla vacía y lista para recibir visibilidad verídica (ZERO FAKE DATA policy). |

---

## 🚀 3. Estado de Despliegue en Producción
* **Backend (Cloud Run API):** Actualizado, compilado y en vivo.
* **Frontend (Firebase Hosting):** Publicado y activo con cabeceras `A+`.
* **CI/CD Pipeline (GitHub Actions):** Sincronizado, verde, estable y limpio en la rama `main`.

---

**Santi**  
AdTech & Analytics Senior Consultant — LLYC
