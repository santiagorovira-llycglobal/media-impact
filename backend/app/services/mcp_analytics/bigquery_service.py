# backend/app/services/mcp_analytics/bigquery_service.py

import os
import logging
from typing import Any, Dict, List, Optional
from google.cloud import bigquery
from app.core.config import settings

logger = logging.getLogger(__name__)

class BigQueryService:
    """
    Servicio de datos empresarial para interactuar con Google BigQuery.
    Maneja la creación de tablas, la ingesta de datos de ETL (Load) y las consultas analíticas del Dashboard.
    """

    def __init__(self, project_id: Optional[str] = None):
        self.project_id = project_id or os.getenv("GCP_PROJECT_ID") or settings.GCP_PROJECT_ID
        # Nota: BigQuery no admite guiones (-) en el ID del Dataset, por lo que usamos guiones bajos (_)
        self.dataset_id = os.getenv("BQ_DATASET_ID", "media_impact_data")
        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                self._client = bigquery.Client(project=self.project_id)
                logger.info(f"Google BigQuery Client inicializado correctamente para el proyecto: {self.project_id}")
            except Exception as e:
                logger.warning(f"No se pudo inicializar Google BigQuery Client (posible entorno local): {e}")
        return self._client

    def create_dataset_and_tables(self) -> bool:
        """
        Crea el dataset y las tablas analíticas necesarias en BigQuery si no existen.
        """
        if not self.client:
            logger.error("BigQuery Client no disponible. Saltando creación de tablas.")
            return False

        try:
            # 1. Crear Dataset
            dataset_ref = bigquery.DatasetReference(self.project_id, self.dataset_id)
            try:
                self.client.get_dataset(dataset_ref)
                logger.info(f"El Dataset '{self.dataset_id}' ya existe en BigQuery.")
            except Exception:
                logger.info(f"Creando nuevo Dataset '{self.dataset_id}' en BigQuery...")
                dataset = bigquery.Dataset(dataset_ref)
                dataset.location = "US"  # O "EU" según corresponda
                self.client.create_dataset(dataset, timeout=30)
                logger.info(f"✅ Dataset '{self.dataset_id}' creado con éxito.")

            # 2. Definir esquemas de tablas
            schemas = {
                "fact_traffic_evolution": [
                    bigquery.SchemaField("tenant_id", "STRING", mode="REQUIRED"),
                    bigquery.SchemaField("date", "DATE", mode="REQUIRED"),
                    bigquery.SchemaField("source", "STRING", mode="NULLABLE"),
                    bigquery.SchemaField("medium", "STRING", mode="NULLABLE"),
                    bigquery.SchemaField("total_sessions", "INTEGER", mode="NULLABLE"),
                    bigquery.SchemaField("ai_referred_sessions", "INTEGER", mode="NULLABLE"),
                    bigquery.SchemaField("ai_inferred_sessions", "INTEGER", mode="NULLABLE"),
                    bigquery.SchemaField("engagement_score", "FLOAT", mode="NULLABLE"),
                ],
                "fact_ai_visibility": [
                    bigquery.SchemaField("tenant_id", "STRING", mode="REQUIRED"),
                    bigquery.SchemaField("date", "DATE", mode="REQUIRED"),
                    bigquery.SchemaField("domain", "STRING", mode="REQUIRED"),
                    bigquery.SchemaField("visibility_score", "FLOAT", mode="NULLABLE"),
                    bigquery.SchemaField("sentiment_score", "FLOAT", mode="NULLABLE"),
                    bigquery.SchemaField("share_of_voice", "FLOAT", mode="NULLABLE"),
                ],
                "dim_content_recommendations": [
                    bigquery.SchemaField("tenant_id", "STRING", mode="REQUIRED"),
                    bigquery.SchemaField("date", "DATE", mode="REQUIRED"),
                    bigquery.SchemaField("topic", "STRING", mode="REQUIRED"),
                    bigquery.SchemaField("priority_score", "INTEGER", mode="NULLABLE"),
                    bigquery.SchemaField("recommendation_strategy", "STRING", mode="NULLABLE"),
                    bigquery.SchemaField("execution_steps", "STRING", mode="NULLABLE"),
                ]
            }

            # 3. Crear Tablas si no existen
            for table_name, schema in schemas.items():
                table_ref = bigquery.TableReference(dataset_ref, table_name)
                try:
                    self.client.get_table(table_ref)
                    logger.info(f"La tabla '{table_name}' ya existe en BigQuery.")
                except Exception:
                    logger.info(f"Creando tabla analítica '{table_name}'...")
                    table = bigquery.Table(table_ref, schema=schema)
                    # Configurar particionamiento por fecha para optimizar costos de consulta
                    table.time_partitioning = bigquery.TimePartitioning(
                        type_=bigquery.TimePartitioningType.DAY,
                        field="date"
                    )
                    self.client.create_table(table, timeout=30)
                    logger.info(f"✅ Tabla '{table_name}' creada con éxito con particionamiento diario.")

            return True
        except Exception as e:
            logger.error(f"Error al inicializar la estructura de BigQuery: {e}")
            return False

    def insert_rows(self, table_name: str, rows: List[Dict[str, Any]]) -> bool:
        """
        Inserta de forma masiva (Stream/Load) un conjunto de registros en una tabla de BigQuery.
        """
        if not self.client or not rows:
            logger.warning("BigQuery Client no disponible o conjunto de datos vacío. Saltando inserción.")
            return False

        try:
            table_ref = bigquery.TableReference(
                bigquery.DatasetReference(self.project_id, self.dataset_id),
                table_name
            )
            table = self.client.get_table(table_ref)
            
            # Insertar filas usando el Stream Ingestion API de BigQuery
            errors = self.client.insert_rows_json(table, rows)
            if errors:
                logger.error(f"Errores al insertar filas en BigQuery: {errors}")
                return False
                
            logger.info(f"✅ {len(rows)} filas insertadas con éxito en BigQuery ({table_name}).")
            return True
        except Exception as e:
            logger.error(f"Excepción al insertar filas en BigQuery ({table_name}): {e}")
            return False

    def delete_existing_records(self, table_name: str, tenant_id: str, start_date: str, end_date: str) -> bool:
        """
        Elimina registros preexistentes en el rango de fechas antes de una nueva inserción.
        Garantiza que el proceso de ETL sea IDEMPOTENTE (sin duplicados).
        """
        if not self.client:
            logger.warning("BigQuery Client no disponible. Saltando limpieza de duplicados.")
            return False

        try:
            query = f"""
                DELETE FROM `{self.project_id}.{self.dataset_id}.{table_name}`
                WHERE tenant_id = @tenant_id 
                  AND date BETWEEN @start_date AND @end_date
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("start_date", "STRING", start_date),
                    bigquery.ScalarQueryParameter("end_date", "STRING", end_date),
                ]
            )
            query_job = self.client.query(query, job_config=job_config)
            query_job.result()  # Esperar que termine la eliminación
            logger.info(f"🧹 Limpieza de duplicados exitosa en '{table_name}' para {tenant_id} ({start_date} a {end_date}).")
            return True
        except Exception as e:
            logger.error(f"Error al eliminar registros preexistentes en BigQuery ({table_name}): {e}")
            return False

    def get_data_gaps(self, tenant_id: str) -> Dict[str, Any]:
        """
        Detecta huecos (fechas faltantes) en el historial de datos de BigQuery de un tenant
        desde la primera fecha de registro hasta hoy.
        """
        if not self.client:
            return {"first_date": None, "gaps": []}

        try:
            # 1. Obtener la primera fecha registrada
            query_min = f"""
                SELECT MIN(date) as min_date 
                FROM `{self.project_id}.{self.dataset_id}.fact_traffic_evolution` 
                WHERE tenant_id = @tenant_id
            """
            job_config_min = bigquery.QueryJobConfig(
                query_parameters=[bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)]
            )
            results_min = self.client.query(query_min, job_config=job_config_min).result()
            
            min_date = None
            for row in results_min:
                if row.min_date:
                    min_date = row.min_date.strftime("%Y-%m-%d")
                    
            if not min_date:
                # Si no hay datos, no hay huecos detectables aún
                return {"first_date": None, "gaps": []}

            # 2. Query analítica de huecos de fechas en BigQuery
            query_gaps = f"""
                WITH date_sequence AS (
                  SELECT d
                  FROM UNNEST(GENERATE_DATE_ARRAY(CAST(@min_date AS DATE), CURRENT_DATE())) d
                ),
                active_dates AS (
                  SELECT DISTINCT date 
                  FROM `{self.project_id}.{self.dataset_id}.fact_traffic_evolution` 
                  WHERE tenant_id = @tenant_id
                )
                SELECT d as missing_date
                FROM date_sequence
                LEFT JOIN active_dates ON d = active_dates.date
                WHERE active_dates.date IS NULL
                ORDER BY d ASC
            """
            job_config_gaps = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("min_date", "STRING", min_date),
                ]
            )
            results_gaps = self.client.query(query_gaps, job_config=job_config_gaps).result()
            
            missing_dates = []
            for row in results_gaps:
                missing_dates.append(row.missing_date.strftime("%Y-%m-%d"))

            # 3. Consolidar fechas individuales consecutivas en rangos elegantes para la UI
            gaps_ranges = []
            if missing_dates:
                start_gap = missing_dates[0]
                prev_gap = missing_dates[0]
                
                for d_str in missing_dates[1:]:
                    d_curr = datetime.strptime(d_str, "%Y-%m-%d")
                    d_prev = datetime.strptime(prev_gap, "%Y-%m-%d")
                    
                    if d_curr - d_prev == timedelta(days=1):
                        prev_gap = d_str
                    else:
                        if start_gap == prev_gap:
                            gaps_ranges.append({"start": start_gap, "end": start_gap, "display": start_gap})
                        else:
                            gaps_ranges.append({"start": start_gap, "end": prev_gap, "display": f"{start_gap} a {prev_gap}"})
                        start_gap = d_str
                        prev_gap = d_str
                
                # Añadir el último rango
                if start_gap == prev_gap:
                    gaps_ranges.append({"start": start_gap, "end": start_gap, "display": start_gap})
                else:
                    gaps_ranges.append({"start": start_gap, "end": prev_gap, "display": f"{start_gap} a {prev_gap}"})

            return {
                "first_date": min_date,
                "gaps": gaps_ranges,
                "individual_missing_dates": missing_dates,
                "gap_count": len(missing_dates)
            }
        except Exception as e:
            logger.error(f"Error al detectar huecos de datos para {tenant_id} en BigQuery: {e}")
            return {"first_date": None, "gaps": []}

    def query_dashboard_metrics(self, tenant_id: str, start_date: str, end_date: str) -> Dict[str, Any]:
        """
        Realiza consultas estructuradas en BigQuery para consolidar las métricas clave
        y evolución de tráfico de un inquilino para pintar el Dashboard de forma ultrarrápida.
        """
        if not self.client:
            logger.warning("BigQuery Client no disponible. Retornando consulta vacía.")
            return {}

        try:
            # Query parametrizada para evitar inyección SQL y optimizar el caché de BQ
            query = f"""
                SELECT 
                    SUM(total_sessions) as total_sessions,
                    SUM(ai_referred_sessions) as ai_referred,
                    SUM(ai_inferred_sessions) as ai_inferred,
                    AVG(engagement_score) as engagement_score
                FROM `{self.project_id}.{self.dataset_id}.fact_traffic_evolution`
                WHERE tenant_id = @tenant_id 
                  AND date BETWEEN @start_date AND @end_date
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("start_date", "STRING", start_date),
                    bigquery.ScalarQueryParameter("end_date", "STRING", end_date),
                ]
            )
            
            query_job = self.client.query(query, job_config=job_config)
            results = query_job.result() # Esperar a que la consulta termine
            
            metrics = {}
            for row in results:
                metrics = {
                    "total_sessions": row.total_sessions or 0,
                    "ai_referred": row.ai_referred or 0,
                    "ai_inferred": row.ai_inferred or 0,
                    "engagement_score": round(row.engagement_score or 0, 1)
                }
                
            logger.info(f"Métricas consolidadas de BigQuery para '{tenant_id}' recuperadas con éxito.")
            return metrics
            
        except Exception as e:
            logger.error(f"Error al realizar consulta analítica en BigQuery para {tenant_id}: {e}")
            return {}
