# LLYC Intelligence Dashboard — Git & GitHub Standards (GEMINI.md)

Este documento establece el protocolo estándar de desarrollo, control de versiones, flujos de trabajo en GitHub y políticas de seguridad que todo colaborador y agente de IA debe cumplir estrictamente en este repositorio.

---

## 🌿 1. Estrategia de Ramas (Branching Policy)

Manejamos una versión simplificada de **GitHub Flow** para asegurar agilidad y estabilidad:

* **`main`**: Rama de producción y producción continua. Debe estar **siempre compilable, estable y probada**. Nadie realiza commits directos a `main` en producción excepto por hotfixes críticos aprobados.
* **Ramas de Feature/Fix**: Se crean a partir de `main` con la nomenclatura:
  - `feature/<tema>`: Para nuevas características o integraciones (ej. `feature/brandlight-service`).
  - `fix/<bug>`: Para corrección de errores (ej. `fix/auth-jwt-validation`).
  - `devops/<infra>`: Para tareas de infraestructura y CI/CD (ej. `devops/github-actions`).
  - `docs/<doc>`: Para actualizaciones de documentación o guías (ej. `docs/dns-guide`).

---

## 💬 2. Estándares de Mensajes de Commit (Conventional Commits)

Los mensajes de commit deben seguir la especificación de **Conventional Commits** para mantener un historial limpio, estructurado y permitir la generación automática de changelogs:

Formato: `<tipo>(<ámbito opcional>): <descripción corta en minúsculas y presente>`

### Tipos Soportados:
* **`feat`**: Nueva funcionalidad (ej. `feat(backend): add brandlight api connector class`).
* **`fix`**: Corrección de un error (ej. `fix(frontend): repair user session refresh logic`).
* **`ci`**: Cambios en configuraciones de CI/CD (ej. `ci(github): configure cloud run and firebase deployment workflow`).
* **`docs`**: Cambios en documentación (ej. `docs: update roadmap and developer readmes`).
* **`style`**: Formateo de código, estilos, etc. (sin cambios funcionales).
* **`refactor`**: Reorganización de código que no añade features ni corrige bugs.
* **`chore`**: Tareas de mantenimiento, actualización de dependencias menores, etc.

---

## 🚨 3. Protocolo de Git y Pre-Push Mandatorio

**REGLA DE ORO DE CONTROL DE VERSIONES**: Está estrictamente prohibido realizar commits locales o pushes remotos de forma proactiva. **NUNCA se iniciará la fase de commit o push hasta que el usuario lo solicite de manera explícita.**

Queda estrictamente prohibido realizar `git add .` o `git add -A`. Todo archivo debe ser agregado de manera individual y selectiva (`git add <archivo_específico>`). 
Bajo ninguna circunstancia se realizará un `git push` sin autorización previa y explícita del usuario.

El proceso de desarrollo, confirmación y empuje de cambios debe seguir estrictamente este orden paso a paso:

### Paso 1: Inspección de Estado y Diferencias
* Ejecutar y analizar el estado actual del repositorio:
  ```bash
  git status
  ```
* Analizar detalladamente las diferencias de los archivos modificados línea por línea para certificar que solo se tocan las áreas pretendidas:
  ```bash
  git diff HEAD
  ```

### Paso 2: Pruebas de Compilación (Filtro de Calidad)
* **Frontend**: Compilar y validar que no existan errores de TypeScript ni fallos en el empaquetado:
  ```bash
  cd frontend && npm run build
  ```
* **Backend**: Validar que todos los archivos de Python modificados o creados compilen perfectamente sin errores de sintaxis:
  ```bash
  python3 -m py_compile <archivos_modificados>
  ```
* *Nota: Si alguna de las compilaciones falla, se debe detener inmediatamente el proceso, depurar el error, resolverlo y reiniciar el protocolo obligatoriamente desde el Paso 1.*

### Paso 3: Actualización de Documentación y Dependencias
* Certificar que los `README.md`, Devlogs, diagramas o bitácoras de cambios del repositorio estén actualizados con los cambios del commit actual.
* Si se agregaron librerías, asegurar que los archivos de dependencias (`package.json`, `requirements.txt`) estén modificados y agregados al commit de forma consistente.

### Paso 4: Confirmación del Commit y Mensaje (Commit Stage)
* Proponer al usuario una propuesta clara de mensaje de commit siguiendo el formato de **Conventional Commits**.
* Solicitar confirmación del mensaje de commit.
* Una vez confirmado, realizar la confirmación local agregando únicamente los archivos específicos:
  ```bash
  git add <archivo1> <archivo2>
  git commit -m "<mensaje_confirmado>"
  ```

### Paso 5: Solicitud de Autorización de Push (Push Stage)
* Preguntar de manera directa y clara al usuario la confirmación para realizar el push a la rama remota.
* **Solo tras recibir el "OK" o confirmación afirmativa del usuario**, proceder a ejecutar:
  ```bash
  git push origin <rama_actual>
  ```
* Confirmar que el push fue exitoso ejecutando un `git status` final.

---

## 🛠️ 5. Protocolo de gcloud y Diagnóstico de Despliegues

Cuando se trabaje con herramientas de **Google Cloud Platform (gcloud CLI)** o se investiguen fallos de despliegue, todo colaborador o agente de IA debe cumplir obligatoriamente con el siguiente protocolo:

### Paso 1: Verificación de Proyecto Activo (Always Check Project)
* Nunca asumir o asumir por defecto qué proyecto de GCP está activo en el entorno.
* Antes de ejecutar cualquier comando de IAM, servicios, despliegue o habilitación de APIs, se debe verificar explícitamente el proyecto seleccionado ejecutando:
  ```bash
  gcloud config get-value project
  ```
* Confirmar o cambiar el proyecto activamente si no coincide con el proyecto objetivo:
  ```bash
  gcloud config set project <proyecto_objetivo>
  ```

### Paso 2: Diagnóstico Profundo de Fallos de Compilación (Cloud Build Logs)
* Si el despliegue de Cloud Run o Cloud Functions falla durante la fase de empaquetado/construcción, **está prohibido limitarse únicamente a la información superficial provista por GitHub Actions**.
* El desarrollador o agente debe ir directamente al motor de compilación remota de GCP para inspeccionar el historial y logs completos:
  * **Listar las últimas compilaciones** para identificar el `BUILD_ID` que ha fallado:
    ```bash
    gcloud builds list --limit=5
    ```
  * **Obtener los logs detallados** de la compilación utilizando el ID respectivo para ver trazas completas de Docker, sintaxis o dependencias:
    ```bash
    gcloud builds log <BUILD_ID>
    ```

### Paso 3: Monitoreo en Tiempo Real del CI/CD (GitHub CLI - gh)
* Se establece como excelente práctica el monitoreo del progreso del pipeline de integración y despliegue continuo directamente desde la terminal utilizando GitHub CLI.
* Para vigilar y seguir en tiempo real una corrida de Actions activa hasta su finalización:
  ```bash
  gh run watch
  ```
* Para listar el historial reciente de ejecuciones de GitHub Actions:
  ```bash
  gh run list --limit=5
  ```
* Para inspeccionar los logs de un job específico fallido en GitHub:
  ```bash
  gh run view <run-id> --log --job=<job-id>
  ```

---

## 🔒 6. Políticas de Seguridad y Secretos

* **Protección de Credenciales**: Está estrictamente prohibido comprometer archivos `.env`, tokens OAuth, API Keys (GA4, Adobe, Brandlight, Peec.ai) o claves JSON de GCP en el repositorio.
* **GCP Secret Manager**: Toda credencial sensible en entornos remotos debe leerse directamente desde GCP Secret Manager en tiempo de ejecución.
* **Validación de Commits**: No se añadirán al commit archivos temporales, logs (`*.log`), bases de datos locales (`*.db`), ni directorios de dependencias (`node_modules/`, `venv/`). Asegurar que estén cubiertos en el `.gitignore`.
