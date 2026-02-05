"""
Data synchronization service to sync CTE results from BigQuery to PostgreSQL
For nvidia: prod_labeling_tool_n
"""
import os
import logging
from datetime import datetime
from typing import Dict, Optional
from sqlalchemy import delete, text
from google.cloud import bigquery

from app.config import get_settings
from app.services.db_service import get_db_service
from app.models.db_models import ReviewDetail, Task, Contributor, DataSyncLog, TaskReviewedInfo, TaskAHT, ContributorTaskStats, ContributorDailyStats, ReviewerDailyStats, TaskRaw, TaskHistoryRaw, PodLeadMapping, ReviewerTrainerDailyStats, TrainerReviewStats
from app.constants import get_constants

logger = logging.getLogger(__name__)


def calculate_week_number(task_date: datetime, project_start_date: str) -> Optional[int]:
    """Calculate week number from project start date"""
    if not task_date or not project_start_date:
        return None
    
    try:
        start_date = datetime.strptime(project_start_date, "%Y-%m-%d")
        
        if hasattr(task_date, 'date'):
            task_dt = task_date
        else:
            task_dt = datetime.combine(task_date, datetime.min.time())
        
        days_diff = (task_dt - start_date).days
        week_num = (days_diff // 7) + 1
        
        return max(1, week_num)
    except Exception as e:
        logger.warning(f"Error calculating week number: {e}")
        return None


class DataSyncService:
    """Service for syncing CTE results from BigQuery to PostgreSQL"""
    
    def __init__(self):
        self.settings = get_settings()
        self.db_service = get_db_service()
        self.bq_client = None
        self._constants = get_constants()
    
    @property
    def _batch_exclusion_sql(self) -> str:
        """Get SQL clause for excluded batch names."""
        excluded = self._constants.batches.EXCLUDED_BATCH_NAMES
        names = ", ".join(f"'{name}'" for name in excluded)
        return f"b.name NOT IN ({names})"
    
    @property
    def _project_ids_sql(self) -> str:
        """Get SQL clause for project IDs."""
        ids = self._constants.projects.PRIMARY_PROJECT_IDS
        return ", ".join(str(id) for id in ids)
    
    def initialize_bigquery_client(self):
        """Initialize BigQuery client"""
        try:
            import os
            from google.oauth2 import service_account
            
            credentials_path = self.settings.google_application_credentials
            
            if credentials_path and os.path.exists(credentials_path):
                credentials = service_account.Credentials.from_service_account_file(
                    credentials_path
                )
                self.bq_client = bigquery.Client(
                    credentials=credentials,
                    project=self.settings.gcp_project_id
                )
            else:
                self.bq_client = bigquery.Client(
                    project=self.settings.gcp_project_id
                )
            
            logger.info("BigQuery client initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing BigQuery client: {e}")
            raise
    
    def log_sync_start(self, table_name: str, sync_type: str = 'scheduled') -> int:
        """Log the start of a sync operation"""
        try:
            with self.db_service.get_session() as session:
                log_entry = DataSyncLog(
                    table_name=table_name,
                    sync_started_at=datetime.utcnow(),
                    sync_status='started',
                    sync_type=sync_type
                )
                session.add(log_entry)
                session.commit()
                return log_entry.id
        except Exception as e:
            logger.error(f"Error logging sync start: {e}")
            return 0
    
    def log_sync_complete(self, log_id: int, records_synced: int, success: bool = True, error_message: str = None):
        """Log the completion of a sync operation"""
        try:
            with self.db_service.get_session() as session:
                log_entry = session.query(DataSyncLog).filter(
                    DataSyncLog.id == log_id
                ).first()
                
                if log_entry:
                    log_entry.sync_completed_at = datetime.utcnow()
                    log_entry.records_synced = records_synced
                    log_entry.sync_status = 'completed' if success else 'failed'
                    log_entry.error_message = error_message
                    session.commit()
        except Exception as e:
            logger.error(f"Error logging sync complete: {e}")
    
    def _build_review_detail_query(self) -> str:
        """Build the complete review_detail CTE query"""
        return f"""
            WITH task_reviewed_info AS ( 
                SELECT DISTINCT 
                    r.conversation_id AS r_id,
                    bt.task_id AS delivered_id,
                    c.colab_link AS RLHF_Link,
                    "False" AS is_delivered,
                    r.status,
                    r.score AS task_score,
                    DATE(r.updated_at) AS updated_at,
                    cb.name,
                    (
                        SELECT MIN(csh_inner.updated_at)
                        FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history` csh_inner
                        WHERE csh_inner.conversation_id = c.id
                            AND csh_inner.old_status = 'labeling'
                            AND csh_inner.new_status = 'completed'
                    ) AS annotation_date
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` c
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review` r
                    ON c.id = r.conversation_id
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b
                    ON c.project_id = b.project_id
                LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.delivery_batch_task` bt
                    ON bt.task_id = c.id
                LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` cb
                    ON cb.id = c.current_user_id
                WHERE c.project_id = {self.settings.project_id_filter}
                    AND c.status IN ('completed', 'validated')
                    AND r.review_type NOT IN ('auto')
                    AND r.followup_required = 0
                    AND r.id = (
                        SELECT MAX(rn.id)
                        FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review` rn
                        WHERE rn.conversation_id = r.conversation_id
                            AND rn.review_type = 'manual'
                            AND rn.status = 'published'
                    )
            ),
            task AS (
                SELECT 
                    *,
                    TRIM(REGEXP_EXTRACT(statement, r'\\*\\*Domain:\\*\\*\\s*-\\s*([^\\n]+)')) AS domain
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation`
                WHERE project_id = {self.settings.project_id_filter} 
                    AND id IN (SELECT r_id FROM task_reviewed_info)
                    AND status IN ('completed', 'validated')
            ),
            review AS (
                SELECT 
                    *,
                    ROW_NUMBER() OVER(PARTITION BY conversation_id ORDER BY id DESC) AS row_num
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review`
                WHERE review_type = 'manual' 
                    AND status = 'published'
                    AND conversation_id IN (SELECT distinct id from task)
            ),
            review_detail AS (
                SELECT 
                    b.quality_dimension_id, 
                    task_.domain,
                    task_.human_role_id,
                    b.review_id, 
                    a.reviewer_id, 
                    a.conversation_id, 
                    tdi.is_delivered,
                    rqd.name, 
                    b.score_text, 
                    b.score,
                    a.score AS task_score,
                    tdi.updated_at
                FROM (SELECT * FROM review WHERE row_num = 1) a
                RIGHT JOIN task AS task_ 
                    ON task_.id = a.conversation_id
                LEFT JOIN task_reviewed_info AS tdi
                    ON tdi.r_id = task_.id
                LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review_quality_dimension_value` AS b 
                    ON b.review_id = a.id
                LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.quality_dimension` AS rqd
                    ON rqd.id = b.quality_dimension_id
                WHERE 1=1
            )
            SELECT * FROM review_detail
        """
    
    def sync_review_detail(self, sync_type: str = 'scheduled') -> bool:
        """Sync review_detail CTE result from BigQuery"""
        log_id = self.log_sync_start('review_detail', sync_type)
        try:
            logger.info("Fetching review_detail data from BigQuery...")
            query = self._build_review_detail_query()
            
            query_job = self.bq_client.query(query)
            results = query_job.result()
            
            data = [dict(row) for row in results]
            
            logger.info(f"Fetched {len(data)} records from BigQuery")
            
            with self.db_service.get_session() as session:
                logger.info("Clearing existing review_detail data...")
                session.execute(delete(ReviewDetail))
                session.commit()
                
                batch_size = 5000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i + batch_size]
                    objects = [ReviewDetail(**record) for record in batch]
                    session.bulk_save_objects(objects)
                    session.commit()
                    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} review_detail records")
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} review_detail records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing review_detail: {e}")
            return False
    
    def _build_task_query(self) -> str:
        """Build the task CTE query"""
        return f"""
            WITH task_reviewed_info AS ( 
                SELECT DISTINCT 
                    r.conversation_id AS r_id,
                    bt.task_id AS delivered_id,
                    c.colab_link AS RLHF_Link,
                    "False" AS is_delivered,
                    r.status,
                    r.score AS task_score,
                    DATE(r.updated_at) AS updated_at,
                    cb.name,
                    (
                        SELECT MIN(csh_inner.updated_at)
                        FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history` csh_inner
                        WHERE csh_inner.conversation_id = c.id
                            AND csh_inner.old_status = 'labeling'
                            AND csh_inner.new_status = 'completed'
                    ) AS annotation_date
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` c
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review` r
                    ON c.id = r.conversation_id
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b
                    ON c.project_id = b.project_id
                LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.delivery_batch_task` bt
                    ON bt.task_id = c.id
                LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` cb
                    ON cb.id = c.current_user_id
                WHERE c.project_id = {self.settings.project_id_filter}
                    AND c.status IN ('completed', 'validated')
                    AND r.review_type NOT IN ('auto')
                    AND r.followup_required = 0
                    AND r.id = (
                        SELECT MAX(rn.id)
                        FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review` rn
                        WHERE rn.conversation_id = r.conversation_id
                            AND rn.review_type = 'manual'
                            AND rn.status = 'published'
                    )
            ),
            rework_counts AS (
                SELECT 
                    conversation_id,
                    -- Count only transitions INTO rework status (times task was sent to rework)
                    COUNTIF(new_status = 'rework') AS rework_count
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history`
                WHERE conversation_id IN (SELECT r_id FROM task_reviewed_info)
                GROUP BY conversation_id
            ),
            task AS (
                SELECT 
                    c.id,
                    c.created_at,
                    c.updated_at,
                    c.statement,
                    c.status,
                    c.project_id,
                    c.batch_id,
                    c.current_user_id,
                    c.colab_link,
                    tdi.is_delivered,
                    COALESCE(rc.rework_count, 0) AS rework_count,
                    TRIM(REGEXP_EXTRACT(c.statement, r'\\*\\*Domain:\\*\\*\\s*-\\s*([^\\n]+)')) AS domain,
                    c.number_of_turns,
                    DATE(c.completed_at) AS last_completed_date
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` c
                INNER JOIN task_reviewed_info AS tdi
                    ON tdi.r_id = c.id
                LEFT JOIN rework_counts AS rc
                    ON rc.conversation_id = c.id
                WHERE c.project_id = {self.settings.project_id_filter} 
                    AND c.status IN ('completed', 'validated')
            )
            SELECT * FROM task
        """
    
    def sync_task(self, sync_type: str = 'scheduled') -> bool:
        """Sync task CTE result from BigQuery"""
        log_id = self.log_sync_start('task', sync_type)
        try:
            logger.info("Fetching task data from BigQuery...")
            query = self._build_task_query()
            
            query_job = self.bq_client.query(query)
            results = query_job.result()
            
            data = []
            for row in results:
                row_dict = dict(row)
                task_date = row_dict.get('updated_at') or row_dict.get('created_at')
                if task_date:
                    row_dict['week_number'] = calculate_week_number(
                        task_date, 
                        self.settings.project_start_date
                    )
                else:
                    row_dict['week_number'] = None
                data.append(row_dict)
            
            logger.info(f"Fetched {len(data)} task records from BigQuery")
            
            with self.db_service.get_session() as session:
                logger.info("Clearing existing task data...")
                session.execute(delete(Task))
                session.commit()
                
                batch_size = 5000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i + batch_size]
                    objects = [Task(**record) for record in batch]
                    session.bulk_save_objects(objects)
                    session.commit()
                    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} task records")
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} task records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing task: {e}")
            return False
    
    def sync_contributor(self, sync_type: str = 'scheduled') -> bool:
        """Sync contributor names from BigQuery.
        
        Uses a two-pass approach to handle self-referential team_lead_id FK:
        1. Insert all contributors with team_lead_id = NULL
        2. Update team_lead_id for all contributors
        """
        log_id = self.log_sync_start('contributor', sync_type)
        try:
            logger.info("Fetching contributor data from BigQuery...")
            
            query = f"""
                SELECT 
                    id,
                    name,
                    turing_email,
                    type,
                    status,
                    team_lead_id
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor`
            """
            
            query_job = self.bq_client.query(query)
            results = query_job.result()
            
            data = [dict(row) for row in results]
            
            logger.info(f"Fetched {len(data)} contributor records from BigQuery")
            
            with self.db_service.get_session() as session:
                logger.info("Clearing existing contributor data...")
                session.execute(delete(Contributor))
                session.commit()
                
                # Two-pass approach for self-referential FK
                # Pass 1: Insert all contributors without team_lead_id
                team_lead_mapping = {}  # id -> team_lead_id
                for record in data:
                    if record.get('team_lead_id'):
                        team_lead_mapping[record['id']] = record['team_lead_id']
                    record_copy = record.copy()
                    record_copy['team_lead_id'] = None  # Clear for initial insert
                    session.add(Contributor(**record_copy))
                session.commit()
                
                # Pass 2: Update team_lead_id for all contributors
                if team_lead_mapping:
                    logger.info(f"Updating team_lead_id for {len(team_lead_mapping)} contributors...")
                    for contributor_id, team_lead_id in team_lead_mapping.items():
                        session.execute(
                            text("UPDATE contributor SET team_lead_id = :team_lead_id WHERE id = :id"),
                            {"team_lead_id": team_lead_id, "id": contributor_id}
                        )
                    session.commit()
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} contributor records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing contributor: {e}")
            return False
    
    def sync_task_reviewed_info(self, sync_type: str = 'scheduled') -> bool:
        """Sync task_reviewed_info CTE result from BigQuery"""
        log_id = self.log_sync_start('task_reviewed_info', sync_type)
        try:
            logger.info("Fetching task_reviewed_info data from BigQuery...")
            query = f"""
                WITH task_reviewed_info AS ( 
                    SELECT DISTINCT 
                        r.conversation_id AS r_id,
                        bt.task_id AS delivered_id,
                        c.colab_link AS RLHF_Link,
                        "False" AS is_delivered,
                        r.status,
                        r.score AS task_score,
                        DATE(r.updated_at) AS updated_at,
                        cb.name,
                        (
                            SELECT DATE(MIN(csh_inner.updated_at))
                            FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history` csh_inner
                            WHERE csh_inner.conversation_id = c.id
                                AND csh_inner.old_status = 'labeling'
                                AND csh_inner.new_status = 'completed'
                        ) AS annotation_date
                    FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` c
                    INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review` r
                        ON c.id = r.conversation_id
                    INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b
                        ON c.project_id = b.project_id
                    LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.delivery_batch_task` bt
                        ON bt.task_id = c.id
                    LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` cb
                        ON cb.id = c.current_user_id
                    WHERE c.project_id = {self.settings.project_id_filter}
                        AND c.status IN ('completed', 'validated')
                        AND r.review_type NOT IN ('auto')
                        AND r.followup_required = 0
                        AND r.id = (
                            SELECT MAX(rn.id)
                            FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review` rn
                            WHERE rn.conversation_id = r.conversation_id
                                AND rn.review_type = 'manual'
                                AND rn.status = 'published'
                        )
                )
                SELECT * FROM task_reviewed_info
            """
            
            query_job = self.bq_client.query(query)
            results = query_job.result()
            
            data = []
            for row in results:
                row_dict = dict(row)
                mapped_row = {
                    'r_id': row_dict.get('r_id'),
                    'delivered_id': row_dict.get('delivered_id'),
                    'rlhf_link': row_dict.get('RLHF_Link'),
                    'is_delivered': row_dict.get('is_delivered'),
                    'status': row_dict.get('status'),
                    'task_score': row_dict.get('task_score'),
                    'updated_at': row_dict.get('updated_at'),
                    'name': row_dict.get('name'),
                    'annotation_date': row_dict.get('annotation_date')
                }
                data.append(mapped_row)
            
            logger.info(f"Fetched {len(data)} task_reviewed_info records from BigQuery")
            
            with self.db_service.get_session() as session:
                logger.info("Clearing existing task_reviewed_info data...")
                session.execute(delete(TaskReviewedInfo))
                session.commit()
                
                batch_size = 5000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i + batch_size]
                    objects = [TaskReviewedInfo(**record) for record in batch]
                    session.bulk_save_objects(objects)
                    session.commit()
                    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} task_reviewed_info records")
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} task_reviewed_info records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing task_reviewed_info: {e}")
            return False
    
    def sync_task_aht(self, sync_type: str = 'scheduled') -> bool:
        """
        Sync task AHT (Average Handle Time) from BigQuery.
        AHT = time from pending→labeling to labeling→completed
        """
        log_id = self.log_sync_start('task_aht', sync_type)
        
        try:
            self.initialize_bigquery_client()
            
            project_id = self.settings.project_id_filter
            query = f"""
            WITH task_transitions AS (
                SELECT DISTINCT
                    csh.conversation_id AS task_id,
                    csh.author_id,
                    c.name AS contributor_name,
                    cs.project_id,
                    cs.batch_id AS batch_id,
                    csh.old_status,
                    csh.new_status,
                    csh.created_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY csh.conversation_id, csh.author_id, csh.old_status, csh.new_status
                        ORDER BY csh.created_at
                    ) AS transition_order
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history` csh
                JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` cs
                    ON csh.conversation_id = cs.id
                JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c
                    ON c.id = csh.author_id
                WHERE cs.project_id = {project_id}
                    AND cs.batch_id NOT IN (177)
            ),
            annotator_aht AS (
                SELECT DISTINCT
                    t1.task_id,
                    t1.author_id,
                    t1.contributor_name,
                    t1.batch_id,
                    t1.created_at AS starting_timestamp,
                    t2.created_at AS completed_timestamp,
                    t1.old_status AS starting_status,
                    t1.new_status AS labeling_status,
                    t2.old_status AS labeling_completed_status,
                    t2.new_status AS completed_status,
                    TIMESTAMP_DIFF(t2.created_at, t1.created_at, SECOND) AS duration_seconds
                FROM task_transitions t1
                JOIN task_transitions t2
                    ON t1.task_id = t2.task_id
                    AND t1.transition_order = t2.transition_order
                    AND t1.old_status = 'pending'
                    AND t1.new_status = 'labeling'
                    AND t2.old_status = 'labeling'
                    AND t2.new_status = 'completed'
                    AND TIMESTAMP_DIFF(t2.created_at, t1.created_at, SECOND) <= 10800
                WHERE t2.created_at >= t1.created_at
            ),
            annotator_filtered AS (
                SELECT *,
                    ROW_NUMBER() OVER (
                        PARTITION BY task_id
                        ORDER BY duration_seconds ASC
                    ) AS rank_by_duration
                FROM annotator_aht
                WHERE duration_seconds <= 10800
            )
            SELECT DISTINCT
                a.task_id,
                a.author_id,
                a.contributor_name,
                a.batch_id,
                a.starting_timestamp,
                a.completed_timestamp,
                a.duration_seconds,
                CAST(a.duration_seconds AS FLOAT64) / 60.0 AS duration_minutes
            FROM annotator_filtered a
            WHERE rank_by_duration = 1
            """
            
            logger.info(f"Executing AHT query for project_id={project_id}")
            results = self.bq_client.query(query).result()
            
            data = []
            for row in results:
                row_dict = dict(row)
                mapped_row = {
                    'task_id': row_dict.get('task_id'),
                    'contributor_id': row_dict.get('author_id'),
                    'contributor_name': row_dict.get('contributor_name'),
                    'batch_id': row_dict.get('batch_id'),
                    'start_time': row_dict.get('starting_timestamp'),
                    'end_time': row_dict.get('completed_timestamp'),
                    'duration_seconds': row_dict.get('duration_seconds'),
                    'duration_minutes': row_dict.get('duration_minutes')
                }
                data.append(mapped_row)
            
            logger.info(f"Fetched {len(data)} task_aht records from BigQuery")
            
            with self.db_service.get_session() as session:
                # Get existing task IDs to filter AHT data (avoid FK violations)
                result = session.execute(text("SELECT id FROM task"))
                existing_task_ids = {row[0] for row in result.fetchall()}
                logger.info(f"Found {len(existing_task_ids)} existing tasks in database")
                
                # Filter data to only include tasks that exist locally
                original_count = len(data)
                data = [r for r in data if r['task_id'] in existing_task_ids]
                filtered_count = original_count - len(data)
                if filtered_count > 0:
                    logger.info(f"Filtered out {filtered_count} AHT records for non-existent tasks")
                
                logger.info("Clearing existing task_aht data...")
                session.execute(delete(TaskAHT))
                session.commit()
                
                batch_size = 5000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i + batch_size]
                    objects = [TaskAHT(**record) for record in batch]
                    session.bulk_save_objects(objects)
                    session.commit()
                    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} task_aht records")
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} task_aht records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing task_aht: {e}")
            return False
    
    def sync_contributor_task_stats(self, sync_type: str = 'scheduled') -> bool:
        """
        Sync contributor task stats - new tasks vs rework submitted.
        New task = first time a task goes to 'completed' for an author
        Rework = subsequent times a task goes to 'completed' for same author
        Also includes sum_number_of_turns for overall avg_rework calculation.
        """
        log_id = self.log_sync_start('contributor_task_stats', sync_type)
        
        try:
            self.initialize_bigquery_client()
            
            project_id = self.settings.project_id_filter
            query = f"""
            WITH task_completions AS (
                SELECT 
                    csh.conversation_id as task_id,
                    csh.author_id,
                    csh.created_at,
                    csh.old_status,
                    csh.new_status,
                    -- Running count of completed status per task (matches spreadsheet COUNTIF logic)
                    COUNTIF(csh.new_status = 'completed') OVER (
                        PARTITION BY csh.conversation_id
                        ORDER BY csh.created_at
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ) AS completed_status_count
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history` csh
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` cs 
                    ON csh.conversation_id = cs.id
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND {self._batch_exclusion_sql}
            ),
            -- Filter to only completed transitions (matching spreadsheet filter)
            completed_events AS (
                SELECT *
                FROM task_completions
                WHERE new_status = 'completed'
                  AND old_status != 'completed-approval'
            ),
            -- Calculate sum of number_of_turns using the exact same query as task_raw
            -- This matches spreadsheet: SUM(number_of_turns) WHERE trainer=email AND status IN (...)
            trainer_task_turns AS (
                SELECT 
                    c.id as trainer_id,
                    SUM(cs.number_of_turns) as sum_turns
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` cs
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c 
                    ON cs.current_user_id = c.id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND {self._batch_exclusion_sql}
                  AND LOWER(cs.status) IN ('completed', 'reviewed', 'rework', 'validated')
                  AND cs.completed_at IS NOT NULL
                GROUP BY c.id
            )
            SELECT 
                ce.author_id as contributor_id,
                -- New Tasks = completions where completed_status_count = 1 (first time task was completed)
                SUM(CASE WHEN completed_status_count = 1 THEN 1 ELSE 0 END) as new_tasks_submitted,
                -- Rework = completions where completed_status_count > 1 (task was completed before)
                SUM(CASE WHEN completed_status_count > 1 THEN 1 ELSE 0 END) as rework_submitted,
                -- Unique tasks = distinct task_ids this trainer completed
                COUNT(DISTINCT ce.task_id) as total_unique_tasks,
                MIN(ce.created_at) as first_submission_date,
                MAX(ce.created_at) as last_submission_date,
                -- Sum of number_of_turns for tasks owned by this contributor (for avg_rework)
                COALESCE((SELECT ttt.sum_turns FROM trainer_task_turns ttt WHERE ttt.trainer_id = ce.author_id), 0) as sum_number_of_turns
            FROM completed_events ce
            GROUP BY ce.author_id
            """
            
            logger.info(f"Executing contributor task stats query for project_id={project_id}")
            results = self.bq_client.query(query).result()
            
            data = []
            for row in results:
                row_dict = dict(row)
                mapped_row = {
                    'contributor_id': row_dict.get('contributor_id'),
                    'new_tasks_submitted': row_dict.get('new_tasks_submitted', 0),
                    'rework_submitted': row_dict.get('rework_submitted', 0),
                    'total_unique_tasks': row_dict.get('total_unique_tasks', 0),
                    'first_submission_date': row_dict.get('first_submission_date'),
                    'last_submission_date': row_dict.get('last_submission_date'),
                    'sum_number_of_turns': row_dict.get('sum_number_of_turns', 0)
                }
                data.append(mapped_row)
            
            logger.info(f"Fetched {len(data)} contributor_task_stats records from BigQuery")
            
            with self.db_service.get_session() as session:
                logger.info("Clearing existing contributor_task_stats data...")
                session.execute(delete(ContributorTaskStats))
                session.commit()
                
                batch_size = 5000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i + batch_size]
                    objects = [ContributorTaskStats(**record) for record in batch]
                    session.bulk_save_objects(objects)
                    session.commit()
                    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} contributor_task_stats records")
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} contributor_task_stats records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing contributor_task_stats: {e}")
            return False
    
    def sync_contributor_daily_stats(self, sync_type: str = 'scheduled') -> bool:
        """
        Sync contributor daily stats - new tasks vs rework at date level.
        This provides trainer x date level granularity.
        Also calculates tasks_ready_for_delivery (Reviewed status with number_of_turns = 0)
        """
        log_id = self.log_sync_start('contributor_daily_stats', sync_type)
        
        try:
            self.initialize_bigquery_client()
            
            project_id = self.settings.project_id_filter
            query = f"""
            WITH task_completions AS (
                SELECT 
                    csh.conversation_id as task_id,
                    csh.author_id,
                    DATE(csh.created_at) as submission_date,
                    csh.created_at,
                    csh.new_status,
                    csh.old_status,
                    -- Running count of completed status per task (matches spreadsheet COUNTIF logic)
                    COUNTIF(csh.new_status = 'completed') OVER (
                        PARTITION BY csh.conversation_id
                        ORDER BY csh.created_at
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ) AS completed_status_count
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history` csh
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` cs 
                    ON csh.conversation_id = cs.id
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND {self._batch_exclusion_sql}
            ),
            -- Filter to only completed transitions (matching spreadsheet filter)
            completed_events AS (
                SELECT *
                FROM task_completions
                WHERE new_status = 'completed'
                  AND old_status != 'completed-approval'
            ),
            -- For avg_rework: count unique tasks and sum number_of_turns for tasks owned by this author
            -- This matches spreadsheet: tasks where current_user = trainer, status IN (...), date IN range
            trainer_tasks AS (
                SELECT 
                    cs.current_user_id as trainer_id,
                    DATE(cs.completed_at) as last_completed_date,
                    cs.id as task_id,
                    cs.number_of_turns
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` cs
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND {self._batch_exclusion_sql}
                  AND LOWER(cs.status) IN ('completed', 'reviewed', 'rework', 'validated')
                  AND cs.completed_at IS NOT NULL
            ),
            -- Aggregate by trainer and date (for display in UI daily view)
            trainer_date_stats AS (
                SELECT 
                    trainer_id,
                    last_completed_date,
                    COUNT(DISTINCT task_id) as owned_tasks,
                    SUM(number_of_turns) as sum_turns
                FROM trainer_tasks
                GROUP BY trainer_id, last_completed_date
            )
            SELECT 
                ce.author_id as contributor_id,
                ce.submission_date,
                -- New Tasks = completions where completed_status_count = 1 (first time task was completed)
                SUM(CASE WHEN ce.completed_status_count = 1 THEN 1 ELSE 0 END) as new_tasks_submitted,
                -- Rework = completions where completed_status_count > 1 (task was completed before)
                SUM(CASE WHEN ce.completed_status_count > 1 THEN 1 ELSE 0 END) as rework_submitted,
                COUNT(*) as total_submissions,
                -- Unique tasks = distinct task_ids this trainer completed (based on submission)
                COUNT(DISTINCT ce.task_id) as unique_tasks,
                -- Tasks owned by this trainer on this date (for avg_rework)
                COALESCE((SELECT tds.owned_tasks FROM trainer_date_stats tds WHERE tds.trainer_id = ce.author_id AND tds.last_completed_date = ce.submission_date), 0) as owned_tasks,
                -- Sum of number_of_turns for tasks owned by this author on this date
                COALESCE((SELECT tds.sum_turns FROM trainer_date_stats tds WHERE tds.trainer_id = ce.author_id AND tds.last_completed_date = ce.submission_date), 0) as sum_number_of_turns
            FROM completed_events ce
            GROUP BY ce.author_id, ce.submission_date
            ORDER BY ce.author_id, ce.submission_date
            """
            
            logger.info(f"Executing contributor daily stats query for project_id={project_id}")
            results = self.bq_client.query(query).result()
            
            data = []
            for row in results:
                row_dict = dict(row)
                mapped_row = {
                    'contributor_id': row_dict.get('contributor_id'),
                    'submission_date': row_dict.get('submission_date'),
                    'new_tasks_submitted': row_dict.get('new_tasks_submitted', 0),
                    'rework_submitted': row_dict.get('rework_submitted', 0),
                    'total_submissions': row_dict.get('total_submissions', 0),
                    'unique_tasks': row_dict.get('unique_tasks', 0),
                    'tasks_ready_for_delivery': 0,  # Will be calculated from postgres after sync
                    'sum_number_of_turns': row_dict.get('sum_number_of_turns', 0),
                }
                data.append(mapped_row)
            
            logger.info(f"Fetched {len(data)} contributor_daily_stats records from BigQuery")
            
            with self.db_service.get_session() as session:
                logger.info("Clearing existing contributor_daily_stats data...")
                session.execute(delete(ContributorDailyStats))
                session.commit()
                
                batch_size = 5000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i + batch_size]
                    objects = [ContributorDailyStats(**record) for record in batch]
                    session.bulk_save_objects(objects)
                    session.commit()
                    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} contributor_daily_stats records")
            
            # Now calculate tasks_ready_for_delivery from postgres
            # Tasks ready for delivery = tasks with reviews AND rework_count = 0
            logger.info("Calculating tasks_ready_for_delivery from postgres...")
            with self.db_service.get_session() as session:
                # Use a single UPDATE with subquery for better performance
                update_query = text("""
                    WITH ready_tasks AS (
                        SELECT DISTINCT
                            tri.r_id as task_id,
                            c.id as contributor_id,
                            tri.annotation_date::date as submission_date
                        FROM task_reviewed_info tri
                        JOIN task t ON tri.r_id = t.id
                        JOIN contributor c ON c.turing_email = tri.name
                        WHERE t.rework_count = 0
                    ),
                    ready_counts AS (
                        SELECT 
                            contributor_id,
                            submission_date,
                            COUNT(DISTINCT task_id) as tasks_ready
                        FROM ready_tasks
                        WHERE contributor_id IS NOT NULL AND submission_date IS NOT NULL
                        GROUP BY contributor_id, submission_date
                    )
                    UPDATE contributor_daily_stats cd
                    SET tasks_ready_for_delivery = rc.tasks_ready
                    FROM ready_counts rc
                    WHERE cd.contributor_id = rc.contributor_id
                      AND cd.submission_date = rc.submission_date
                """)
                result = session.execute(update_query)
                session.commit()
                logger.info(f"Updated {result.rowcount} records with tasks_ready_for_delivery")
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} contributor_daily_stats records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing contributor_daily_stats: {e}")
            return False
    
    def sync_reviewer_daily_stats(self, sync_type: str = 'scheduled') -> bool:
        """
        Sync reviewer daily stats - tasks reviewed at date level.
        For each reviewer and date, tracks:
        - Unique tasks reviewed
        - New tasks reviewed (first-time completions)
        - Rework reviewed (subsequent completions)
        - Tasks ready for delivery
        """
        log_id = self.log_sync_start('reviewer_daily_stats', sync_type)
        
        try:
            self.initialize_bigquery_client()
            
            project_id = self.settings.project_id_filter
            query = f"""
            WITH task_completion_counts AS (
                -- Calculate global completion count for each task
                SELECT 
                    csh.conversation_id as task_id,
                    csh.created_at,
                    COUNTIF(csh.new_status = 'completed') OVER (
                        PARTITION BY csh.conversation_id
                        ORDER BY csh.created_at
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ) AS completed_status_count
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history` csh
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` cs 
                    ON csh.conversation_id = cs.id
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND {self._batch_exclusion_sql}
                  AND csh.new_status = 'completed'
            ),
            -- Get the latest completion count for each task
            task_latest_count AS (
                SELECT 
                    task_id,
                    MAX(completed_status_count) as total_completions
                FROM task_completion_counts
                GROUP BY task_id
            ),
            -- Reviews with task completion info
            reviews_with_task_info AS (
                SELECT 
                    r.reviewer_id,
                    DATE(r.submitted_at) as review_date,
                    r.conversation_id as task_id,
                    COALESCE(tlc.total_completions, 0) as task_completions,
                    cs.status as task_status,
                    CASE 
                        WHEN COALESCE(tlc.total_completions, 0) <= 1 THEN 1 
                        ELSE 0 
                    END as is_new_task,
                    CASE 
                        WHEN COALESCE(tlc.total_completions, 0) > 1 THEN 1 
                        ELSE 0 
                    END as is_rework
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review` r
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` cs 
                    ON r.conversation_id = cs.id
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                LEFT JOIN task_latest_count tlc ON r.conversation_id = tlc.task_id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND {self._batch_exclusion_sql}
                  AND r.review_type = 'manual'
                  AND r.status = 'published'
                  AND r.submitted_at IS NOT NULL
            )
            SELECT 
                rwti.reviewer_id,
                rwti.review_date,
                COUNT(DISTINCT rwti.task_id) as unique_tasks_reviewed,
                SUM(rwti.is_new_task) as new_tasks_reviewed,
                SUM(rwti.is_rework) as rework_reviewed,
                COUNT(*) as total_reviews,
                SUM(COALESCE(tr.number_of_turns, 0)) as sum_number_of_turns
            FROM reviews_with_task_info rwti
            LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` tr ON rwti.task_id = tr.id
            WHERE rwti.reviewer_id IS NOT NULL AND rwti.review_date IS NOT NULL
            GROUP BY rwti.reviewer_id, rwti.review_date
            ORDER BY rwti.reviewer_id, rwti.review_date
            """
            
            logger.info(f"Executing reviewer daily stats query for project_id={project_id}")
            results = self.bq_client.query(query).result()
            
            data = []
            for row in results:
                row_dict = dict(row)
                mapped_row = {
                    'reviewer_id': row_dict.get('reviewer_id'),
                    'review_date': row_dict.get('review_date'),
                    'unique_tasks_reviewed': row_dict.get('unique_tasks_reviewed', 0),
                    'new_tasks_reviewed': row_dict.get('new_tasks_reviewed', 0),
                    'rework_reviewed': row_dict.get('rework_reviewed', 0),
                    'total_reviews': row_dict.get('total_reviews', 0),
                    'tasks_ready_for_delivery': 0,  # Will be calculated from postgres
                    'sum_number_of_turns': row_dict.get('sum_number_of_turns', 0),
                }
                data.append(mapped_row)
            
            logger.info(f"Fetched {len(data)} reviewer_daily_stats records from BigQuery")
            
            with self.db_service.get_session() as session:
                logger.info("Clearing existing reviewer_daily_stats data...")
                session.execute(delete(ReviewerDailyStats))
                session.commit()
                
                batch_size = 5000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i + batch_size]
                    objects = [ReviewerDailyStats(**record) for record in batch]
                    session.bulk_save_objects(objects)
                    session.commit()
                    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} reviewer_daily_stats records")
            
            # Calculate tasks_ready_for_delivery from postgres
            logger.info("Calculating tasks_ready_for_delivery for reviewers from postgres...")
            with self.db_service.get_session() as session:
                update_query = text("""
                    WITH ready_reviews AS (
                        SELECT 
                            rd.reviewer_id,
                            rd.updated_at::date as review_date,
                            COUNT(DISTINCT rd.conversation_id) as tasks_ready
                        FROM review_detail rd
                        JOIN task t ON rd.conversation_id = t.id
                        WHERE t.rework_count = 0
                        GROUP BY rd.reviewer_id, rd.updated_at::date
                    )
                    UPDATE reviewer_daily_stats rds
                    SET tasks_ready_for_delivery = rr.tasks_ready
                    FROM ready_reviews rr
                    WHERE rds.reviewer_id = rr.reviewer_id
                      AND rds.review_date = rr.review_date
                """)
                result = session.execute(update_query)
                session.commit()
                logger.info(f"Updated {result.rowcount} records with tasks_ready_for_delivery")
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} reviewer_daily_stats records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing reviewer_daily_stats: {e}")
            return False
    
    def sync_reviewer_trainer_daily_stats(self, sync_type: str = 'scheduled') -> bool:
        """
        Sync reviewer x trainer x date level stats.
        For each reviewer, trainer, and date, tracks what the reviewer reviewed for that trainer.
        """
        log_id = self.log_sync_start('reviewer_trainer_daily_stats', sync_type)
        
        try:
            self.initialize_bigquery_client()
            
            project_id = self.settings.project_id_filter
            query = f"""
            WITH task_completion_counts AS (
                -- Calculate global completion count for each task
                SELECT 
                    csh.conversation_id as task_id,
                    csh.created_at,
                    COUNTIF(csh.new_status = 'completed') OVER (
                        PARTITION BY csh.conversation_id
                        ORDER BY csh.created_at
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ) AS completed_status_count
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history` csh
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` cs 
                    ON csh.conversation_id = cs.id
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND {self._batch_exclusion_sql}
                  AND csh.new_status = 'completed'
            ),
            -- Get the latest completion count for each task
            task_latest_count AS (
                SELECT 
                    task_id,
                    MAX(completed_status_count) as total_completions
                FROM task_completion_counts
                GROUP BY task_id
            ),
            -- Reviews with task and trainer info
            reviews_with_task_info AS (
                SELECT 
                    r.reviewer_id,
                    cs.current_user_id as trainer_id,
                    DATE(r.submitted_at) as review_date,
                    r.conversation_id as task_id,
                    COALESCE(tlc.total_completions, 0) as task_completions,
                    cs.status as task_status,
                    cs.number_of_turns,
                    CASE 
                        WHEN COALESCE(tlc.total_completions, 0) <= 1 THEN 1 
                        ELSE 0 
                    END as is_new_task,
                    CASE 
                        WHEN COALESCE(tlc.total_completions, 0) > 1 THEN 1 
                        ELSE 0 
                    END as is_rework,
                    CASE
                        WHEN cs.status = 'reviewed' AND COALESCE(tlc.total_completions, 0) <= 1 THEN 1
                        ELSE 0
                    END as is_ready_for_delivery
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review` r
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` cs 
                    ON r.conversation_id = cs.id
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                LEFT JOIN task_latest_count tlc ON r.conversation_id = tlc.task_id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND {self._batch_exclusion_sql}
                  AND r.review_type = 'manual'
                  AND r.status = 'published'
                  AND r.submitted_at IS NOT NULL
            )
            SELECT 
                rwti.reviewer_id,
                rwti.trainer_id,
                rwti.review_date,
                COUNT(DISTINCT rwti.task_id) as tasks_reviewed,
                SUM(rwti.is_new_task) as new_tasks_reviewed,
                SUM(rwti.is_rework) as rework_reviewed,
                COUNT(*) as total_reviews,
                SUM(rwti.is_ready_for_delivery) as ready_for_delivery,
                SUM(COALESCE(rwti.number_of_turns, 0)) as sum_number_of_turns
            FROM reviews_with_task_info rwti
            WHERE rwti.reviewer_id IS NOT NULL 
              AND rwti.trainer_id IS NOT NULL 
              AND rwti.review_date IS NOT NULL
            GROUP BY rwti.reviewer_id, rwti.trainer_id, rwti.review_date
            ORDER BY rwti.reviewer_id, rwti.trainer_id, rwti.review_date
            """
            
            logger.info(f"Executing reviewer-trainer daily stats query for project_id={project_id}")
            results = self.bq_client.query(query).result()
            
            data = []
            for row in results:
                row_dict = dict(row)
                mapped_row = {
                    'reviewer_id': row_dict.get('reviewer_id'),
                    'trainer_id': row_dict.get('trainer_id'),
                    'review_date': row_dict.get('review_date'),
                    'tasks_reviewed': row_dict.get('tasks_reviewed', 0),
                    'new_tasks_reviewed': row_dict.get('new_tasks_reviewed', 0),
                    'rework_reviewed': row_dict.get('rework_reviewed', 0),
                    'total_reviews': row_dict.get('total_reviews', 0),
                    'ready_for_delivery': row_dict.get('ready_for_delivery', 0),
                    'sum_number_of_turns': row_dict.get('sum_number_of_turns', 0),
                }
                data.append(mapped_row)
            
            logger.info(f"Fetched {len(data)} reviewer_trainer_daily_stats records from BigQuery")
            
            from app.models.db_models import ReviewerTrainerDailyStats
            
            with self.db_service.get_session() as session:
                logger.info("Clearing existing reviewer_trainer_daily_stats data...")
                session.execute(delete(ReviewerTrainerDailyStats))
                session.commit()
                
                batch_size = 5000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i + batch_size]
                    objects = [ReviewerTrainerDailyStats(**record) for record in batch]
                    session.bulk_save_objects(objects)
                    session.commit()
                    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} reviewer_trainer_daily_stats records")
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} reviewer_trainer_daily_stats records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing reviewer_trainer_daily_stats: {e}")
            return False
    
    def sync_task_history_raw(self, sync_type: str = 'scheduled') -> bool:
        """
        Sync task_history_raw table - mirrors the spreadsheet's task_history_raw sheet.
        This is the source of truth for unique tasks, new tasks submitted, and rework submitted.
        """
        log_id = self.log_sync_start('task_history_raw', sync_type)
        
        try:
            self.initialize_bigquery_client()
            
            # This query exactly matches the user's task_history_raw spreadsheet query
            query = f"""
            SELECT 
                th.conversation_id AS task_id, 
                th.created_at AS time_stamp, 
                DATE(TIMESTAMP(th.created_at)) AS date,
                th.old_status, 
                th.new_status, 
                th.notes, 
                c.turing_email AS author,
                COUNTIF(th.new_status = 'completed') OVER (
                    PARTITION BY th.conversation_id
                    ORDER BY th.created_at
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS completed_status_count,
                MAX(CASE WHEN th.new_status = 'completed' THEN DATE(TIMESTAMP(th.created_at)) END)
                    OVER (
                        PARTITION BY th.conversation_id
                        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
                    ) AS last_completed_date,
                pr.project_id, 
                pr.batch_name
            FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history` th
            LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c ON th.author_id = c.id
            INNER JOIN (
                SELECT t.id, t.project_id, b.name AS batch_name
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` t
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b ON t.batch_id = b.id
                WHERE t.project_id IN ({self._project_ids_sql})
                  AND b.status != 'draft'
                  AND {self._batch_exclusion_sql}
            ) pr ON pr.id = th.conversation_id
            ORDER BY th.conversation_id, th.created_at
            """
            
            logger.info("Executing task_history_raw query...")
            results = self.bq_client.query(query).result()
            
            data = []
            for row in results:
                row_dict = dict(row)
                mapped_row = {
                    'task_id': row_dict.get('task_id'),
                    'time_stamp': row_dict.get('time_stamp'),
                    'date': row_dict.get('date'),
                    'old_status': row_dict.get('old_status'),
                    'new_status': row_dict.get('new_status'),
                    'notes': row_dict.get('notes'),
                    'author': row_dict.get('author'),
                    'completed_status_count': row_dict.get('completed_status_count', 0),
                    'last_completed_date': row_dict.get('last_completed_date'),
                    'project_id': row_dict.get('project_id'),
                    'batch_name': row_dict.get('batch_name'),
                }
                data.append(mapped_row)
            
            logger.info(f"Fetched {len(data)} task_history_raw records from BigQuery")
            
            with self.db_service.get_session() as session:
                logger.info("Clearing existing task_history_raw data...")
                session.execute(delete(TaskHistoryRaw))
                session.commit()
                
                batch_size = 10000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i + batch_size]
                    objects = [TaskHistoryRaw(**record) for record in batch]
                    session.bulk_save_objects(objects)
                    session.commit()
                    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} task_history_raw records")
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} task_history_raw records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing task_history_raw: {e}")
            return False
    
    def sync_task_raw(self, sync_type: str = 'scheduled') -> bool:
        """
        Sync task_raw table - mirrors the spreadsheet's tasks_raw sheet exactly.
        This is the source of truth for avg_rework and other metric calculations.
        """
        log_id = self.log_sync_start('task_raw', sync_type)
        
        try:
            self.initialize_bigquery_client()
            
            # This query exactly matches the user's tasks_raw spreadsheet query
            query = f"""
            WITH review_stats AS (
                SELECT 
                    conversation_id AS conversation_id_rs, 
                    COUNT(id) AS count_reviews, 
                    SUM(score) AS sum_score, 
                    SUM(reflected_score) AS sum_ref_score,
                    SUM(duration_minutes) AS sum_duration, 
                    SUM(followup_required) AS sum_followup_required
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review`
                WHERE review_type IN ('manual') AND status = 'published'
                GROUP BY 1
            ),
            latest_reviews AS (
                SELECT 
                    r.conversation_id AS task_id_r, 
                    r.created_at AS r_created_at,
                    r.updated_at AS r_updated_at, 
                    r.id AS review_id,
                    c.turing_email AS reviewer, 
                    r.score AS score,
                    r.reflected_score,
                    r.review_action,
                    JSON_EXTRACT_SCALAR(r.review_action, '$.type') AS review_action_type,
                    r.feedback AS r_feedback, 
                    r.followup_required,
                    r.duration_minutes AS r_duration, 
                    r.submitted_at AS r_submitted_at,
                    DATE(TIMESTAMP(r.submitted_at)) AS r_submitted_date,
                    ROW_NUMBER() OVER (PARTITION BY r.conversation_id ORDER BY r.created_at DESC) AS rn
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review` r
                LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c ON r.reviewer_id = c.id
                WHERE r.review_type IN ('manual') AND r.status = 'published'
                QUALIFY rn = 1
            ),
            first_completion AS (
                SELECT 
                    t.conversation_id,
                    DATE(TIMESTAMP(t.created_at)) AS first_completion_date, 
                    c.turing_email AS first_completer,
                    ROW_NUMBER() OVER (PARTITION BY t.conversation_id ORDER BY t.created_at ASC) AS rn
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history` t
                LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c ON t.author_id = c.id
                WHERE new_status = 'completed'
                QUALIFY rn = 1
            ),
            task_delivery AS (
                SELECT 
                    dbt.task_id, 
                    db.name AS delivery_batch_name,  
                    db.status AS delivery_status, 
                    c.turing_email AS delivery_batch_created_by, 
                    db.open_date, 
                    db.close_date,
                    ROW_NUMBER() OVER (PARTITION BY dbt.task_id ORDER BY dbt.updated_at DESC) AS rn
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.delivery_batch_task` dbt 
                LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.delivery_batch` db ON db.id = dbt.delivery_batch_id
                LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c ON db.author_id = c.id
                QUALIFY rn = 1
            )
            SELECT 
                t.id AS task_id, 
                DATE(TIMESTAMP(t.created_at)) AS created_date, 
                t.updated_at,
                t.completed_at AS last_completed_at,
                DATE(TIMESTAMP(t.completed_at)) AS last_completed_date,
                c.turing_email AS trainer,
                fc.first_completion_date, 
                fc.first_completer, 
                t.colab_link, 
                t.number_of_turns,
                t.status AS task_status, 
                b.name AS batch_name,
                t.duration_minutes AS task_duration,
                td.delivery_batch_name, 
                td.delivery_status, 
                td.delivery_batch_created_by,
                DATE(TIMESTAMP(td.open_date)) AS db_open_date, 
                DATE(TIMESTAMP(td.close_date)) AS db_close_date,
                rs.conversation_id_rs,
                rs.count_reviews,
                rs.sum_score,
                rs.sum_ref_score,
                rs.sum_duration,
                rs.sum_followup_required,
                lr.task_id_r,
                lr.r_created_at,
                lr.r_updated_at,
                lr.review_id,
                lr.reviewer,
                lr.score,
                lr.reflected_score,
                lr.review_action,
                lr.review_action_type,
                lr.r_feedback,
                lr.followup_required,
                lr.r_duration,
                lr.r_submitted_at,
                lr.r_submitted_date,
                t.project_id
            FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` t
            INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b ON t.batch_id = b.id
            LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c ON t.current_user_id = c.id
            LEFT JOIN first_completion fc ON fc.conversation_id = t.id
            LEFT JOIN task_delivery td ON td.task_id = t.id
            LEFT JOIN (
                SELECT rs.*, lr.*
                FROM latest_reviews lr
                LEFT JOIN review_stats rs ON rs.conversation_id_rs = lr.task_id_r
            ) r ON r.task_id_r = t.id
            LEFT JOIN review_stats rs ON rs.conversation_id_rs = t.id
            LEFT JOIN latest_reviews lr ON lr.task_id_r = t.id
            WHERE t.project_id IN ({self._project_ids_sql})
              AND b.status != 'draft'
              AND {self._batch_exclusion_sql}
            """
            
            logger.info("Executing task_raw query...")
            results = self.bq_client.query(query).result()
            
            data = []
            for row in results:
                row_dict = dict(row)
                mapped_row = {
                    'task_id': row_dict.get('task_id'),
                    'created_date': row_dict.get('created_date'),
                    'updated_at': row_dict.get('updated_at'),
                    'last_completed_at': row_dict.get('last_completed_at'),
                    'last_completed_date': row_dict.get('last_completed_date'),
                    'trainer': row_dict.get('trainer'),
                    'first_completion_date': row_dict.get('first_completion_date'),
                    'first_completer': row_dict.get('first_completer'),
                    'colab_link': row_dict.get('colab_link'),
                    'number_of_turns': row_dict.get('number_of_turns', 0),
                    'task_status': row_dict.get('task_status'),
                    'batch_name': row_dict.get('batch_name'),
                    'task_duration': row_dict.get('task_duration'),
                    'project_id': row_dict.get('project_id'),
                    'delivery_batch_name': row_dict.get('delivery_batch_name'),
                    'delivery_status': row_dict.get('delivery_status'),
                    'delivery_batch_created_by': row_dict.get('delivery_batch_created_by'),
                    'db_open_date': row_dict.get('db_open_date'),
                    'db_close_date': row_dict.get('db_close_date'),
                    'conversation_id_rs': row_dict.get('conversation_id_rs'),
                    'count_reviews': row_dict.get('count_reviews', 0),
                    'sum_score': row_dict.get('sum_score'),
                    'sum_ref_score': row_dict.get('sum_ref_score'),
                    'sum_duration': row_dict.get('sum_duration'),
                    'sum_followup_required': row_dict.get('sum_followup_required', 0),
                    'task_id_r': row_dict.get('task_id_r'),
                    'r_created_at': row_dict.get('r_created_at'),
                    'r_updated_at': row_dict.get('r_updated_at'),
                    'review_id': row_dict.get('review_id'),
                    'reviewer': row_dict.get('reviewer'),
                    'score': row_dict.get('score'),
                    'reflected_score': row_dict.get('reflected_score'),
                    'review_action': str(row_dict.get('review_action')) if row_dict.get('review_action') else None,
                    'review_action_type': row_dict.get('review_action_type'),
                    'r_feedback': row_dict.get('r_feedback'),
                    'followup_required': row_dict.get('followup_required', 0),
                    'r_duration': row_dict.get('r_duration'),
                    'r_submitted_at': row_dict.get('r_submitted_at'),
                    'r_submitted_date': row_dict.get('r_submitted_date'),
                }
                
                # Calculate derived_status (Column AP in spreadsheet)
                # Based on the formula shared by user
                task_id = row_dict.get('task_id')
                task_status = (row_dict.get('task_status') or '').lower()
                count_reviews = row_dict.get('count_reviews') or 0
                r_submitted_date = row_dict.get('r_submitted_date')
                created_date = row_dict.get('created_date')
                review_action_type = (row_dict.get('review_action_type') or '').lower()
                
                if not task_id:
                    derived_status = None
                elif task_status == 'completed':
                    if count_reviews > 0:
                        # Check if r_submitted_date > created_date
                        if r_submitted_date and created_date and r_submitted_date > created_date:
                            derived_status = 'Rework' if review_action_type == 'rework' else 'Reviewed'
                        else:
                            derived_status = 'Completed' if review_action_type == 'rework' else 'Reviewed'
                    else:
                        derived_status = 'Completed'
                elif task_status == 'pending':
                    derived_status = 'Unclaimed'
                elif task_status == 'labeling':
                    derived_status = 'In Progress'
                elif task_status == 'rework':
                    derived_status = 'Rework'
                elif task_status == 'validated':
                    derived_status = 'Validated'
                elif task_status == 'improper':
                    derived_status = 'Improper'
                elif task_status == 'obsolete':
                    derived_status = 'Obsolete'
                elif task_status == 'completed-approval':
                    derived_status = 'Approval'
                else:
                    derived_status = '-'
                
                mapped_row['derived_status'] = derived_status
                data.append(mapped_row)
            
            logger.info(f"Fetched {len(data)} task_raw records from BigQuery")
            
            with self.db_service.get_session() as session:
                logger.info("Clearing existing task_raw data...")
                session.execute(delete(TaskRaw))
                session.commit()
                
                batch_size = 5000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i + batch_size]
                    objects = [TaskRaw(**record) for record in batch]
                    session.bulk_save_objects(objects)
                    session.commit()
                    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} task_raw records")
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} task_raw records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing task_raw: {e}")
            return False
    
    def sync_task_history_raw(self, sync_type: str = 'scheduled') -> bool:
        """
        Sync task_history_raw table - mirrors the spreadsheet's task_history_raw sheet.
        This is used to calculate:
        - Unique tasks completed
        - New Tasks Submitted (completed_status_count = 1)
        - Rework Submitted (completed_status_count > 1)
        """
        log_id = self.log_sync_start('task_history_raw', sync_type)
        
        try:
            self.initialize_bigquery_client()
            
            # This query exactly matches the user's task_history_raw spreadsheet query
            query = f"""
            SELECT 
                th.conversation_id AS task_id,
                th.created_at AS time_stamp,
                DATE(TIMESTAMP(th.created_at)) AS date,
                th.old_status,
                th.new_status,
                th.notes,
                c.turing_email AS author,
                COUNTIF(th.new_status = 'completed') OVER (
                    PARTITION BY th.conversation_id
                    ORDER BY th.created_at
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS completed_status_count,
                MAX(CASE WHEN th.new_status = 'completed' THEN DATE(TIMESTAMP(th.created_at)) END) OVER (
                    PARTITION BY th.conversation_id
                    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
                ) AS last_completed_date,
                pr.project_id,
                pr.batch_name
            FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history` th
            LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c ON th.author_id = c.id
            INNER JOIN (
                SELECT t.id, t.project_id, b.name AS batch_name
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` t
                INNER JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.batch` b ON t.batch_id = b.id
                WHERE t.project_id IN ({self._project_ids_sql})
                  AND b.status != 'draft'
                  AND {self._batch_exclusion_sql}
            ) pr ON pr.id = th.conversation_id
            ORDER BY task_id, time_stamp
            """
            
            logger.info("Executing task_history_raw query...")
            results = self.bq_client.query(query).result()
            
            data = []
            for row in results:
                row_dict = dict(row)
                mapped_row = {
                    'task_id': row_dict.get('task_id'),
                    'time_stamp': row_dict.get('time_stamp'),
                    'date': row_dict.get('date'),
                    'old_status': row_dict.get('old_status'),
                    'new_status': row_dict.get('new_status'),
                    'notes': row_dict.get('notes'),
                    'author': row_dict.get('author'),
                    'completed_status_count': row_dict.get('completed_status_count', 0),
                    'last_completed_date': row_dict.get('last_completed_date'),
                    'project_id': row_dict.get('project_id'),
                    'batch_name': row_dict.get('batch_name'),
                }
                data.append(mapped_row)
            
            logger.info(f"Fetched {len(data)} task_history_raw records from BigQuery")
            
            with self.db_service.get_session() as session:
                logger.info("Clearing existing task_history_raw data...")
                session.execute(delete(TaskHistoryRaw))
                session.commit()
                
                batch_size = 10000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i + batch_size]
                    objects = [TaskHistoryRaw(**record) for record in batch]
                    session.bulk_save_objects(objects)
                    session.commit()
                    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} task_history_raw records")
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} task_history_raw records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing task_history_raw: {e}")
            return False
    
    def _get_google_sheets_credentials(self):
        """Build Google service account credentials from environment variables."""
        import json
        from dotenv import load_dotenv
        from google.oauth2.service_account import Credentials
        
        # Ensure .env is loaded (for multiline GOOGLE_PRIVATE_KEY)
        load_dotenv()
        
        # Build credentials dict from environment variables
        credentials_dict = {
            "type": os.environ.get('GOOGLE_SERVICE_ACCOUNT_TYPE', 'service_account'),
            "project_id": os.environ.get('GOOGLE_PROJECT_ID'),
            "private_key_id": os.environ.get('GOOGLE_PRIVATE_KEY_ID'),
            "private_key": os.environ.get('GOOGLE_PRIVATE_KEY', '').replace('\\n', '\n'),
            "client_email": os.environ.get('GOOGLE_CLIENT_EMAIL'),
            "client_id": os.environ.get('GOOGLE_CLIENT_ID'),
            "auth_uri": os.environ.get('GOOGLE_AUTH_URI', 'https://accounts.google.com/o/oauth2/auth'),
            "token_uri": os.environ.get('GOOGLE_TOKEN_URI', 'https://oauth2.googleapis.com/token'),
            "auth_provider_x509_cert_url": os.environ.get('GOOGLE_AUTH_PROVIDER_CERT_URL', 'https://www.googleapis.com/oauth2/v1/certs'),
            "client_x509_cert_url": os.environ.get('GOOGLE_CLIENT_CERT_URL'),
            "universe_domain": os.environ.get('GOOGLE_UNIVERSE_DOMAIN', 'googleapis.com')
        }
        
        # Define scopes for Google Sheets and Drive access
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets.readonly',
            'https://www.googleapis.com/auth/drive.readonly'
        ]
        
        credentials = Credentials.from_service_account_info(credentials_dict, scopes=scopes)
        return credentials
    
    def sync_pod_lead_mapping(self, sync_type: str = 'initial') -> bool:
        """Sync POD Lead mapping from Google Sheets.
        
        Falls back to local Excel file if Google Sheets is unavailable.
        Uses raw SQL inserts to avoid SQLAlchemy type caching issues.
        """
        import os
        import pandas as pd
        
        log_id = self.log_sync_start('pod_lead_mapping', sync_type)
        
        try:
            df = None
            source = None
            
            # Try Google Sheets first
            sheet_id = os.environ.get('POD_LEAD_MAPPING_SHEET_ID')
            if sheet_id:
                try:
                    import gspread
                    
                    logger.info(f"Attempting to load POD Lead mapping from Google Sheets: {sheet_id}")
                    
                    # Get credentials and authorize
                    credentials = self._get_google_sheets_credentials()
                    gc = gspread.authorize(credentials)
                    
                    # Open the spreadsheet by ID
                    spreadsheet = gc.open_by_key(sheet_id)
                    
                    # Get the first worksheet (mapping sheet)
                    worksheet = spreadsheet.sheet1
                    
                    # Get all values (handles duplicate headers)
                    all_values = worksheet.get_all_values()
                    
                    if len(all_values) < 2:
                        raise ValueError("Google Sheet has no data rows")
                    
                    # First row is header - make headers unique
                    headers = all_values[0]
                    seen = {}
                    unique_headers = []
                    for h in headers:
                        if h in seen:
                            seen[h] += 1
                            unique_headers.append(f"{h}.{seen[h]}")
                        else:
                            seen[h] = 0
                            unique_headers.append(h)
                    
                    # Convert to DataFrame with unique headers
                    df = pd.DataFrame(all_values[1:], columns=unique_headers)
                    source = 'Google Sheets'
                    
                    logger.info(f"Successfully loaded {len(df)} rows from Google Sheets")
                    
                except ImportError:
                    logger.warning("gspread not installed, falling back to Excel file")
                except Exception as e:
                    logger.warning(f"Failed to load from Google Sheets: {e}, falling back to Excel file")
            
            # Fallback to local Excel file
            if df is None:
                excel_path = os.path.join(
                    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                    'static_data',
                    'pod_Jibble_mapping.xlsx'
                )
                
                if not os.path.exists(excel_path):
                    logger.error(f"POD Lead mapping file not found: {excel_path}")
                    return False
                
                logger.info(f"Loading POD Lead mapping from Excel: {excel_path}")
                df = pd.read_excel(excel_path)
                source = 'Excel file'
            
            logger.info(f"Loaded POD Lead mapping from {source}")
            
            # Include all Nvidia projects using constants
            nvidia_projects = list(self._constants.projects.PROJECT_ID_TO_NAME.values())
            df = df[df['Jibble Project'].isin(nvidia_projects)]
            
            # Only include records with POD Lead assigned
            # POD Lead is in column K (index 10), which becomes 'Pod Lead.1' after deduplicating headers
            # (Column I contains a different "Pod Lead" column which is NOT the authoritative one)
            # Filter out both NaN and empty strings
            df = df[df['Pod Lead.1'].notna() & (df['Pod Lead.1'].str.strip() != '')]
            
            # Remove duplicate trainers (keep first occurrence)
            df['trainer_email_lower'] = df['Turing Email'].str.lower().str.strip()
            df = df.drop_duplicates(subset=['trainer_email_lower'], keep='first')
            
            logger.info(f"Found {len(df)} unique trainer-pod lead mappings for all Nvidia projects")
            
            with self.db_service.get_session() as session:
                # Clear existing mappings using raw SQL
                # Preserve POD Lead self-entries (where trainer_email = pod_lead_email and role = 'POD Lead')
                # These contain POD Lead jibble_id mappings that were manually added
                session.execute(text("DELETE FROM pod_lead_mapping WHERE role != 'POD Lead' OR role IS NULL"))
                
                # Prepare data for raw SQL insert
                records_inserted = 0
                for _, row in df.iterrows():
                    trainer_email = row.get('Turing Email', '')
                    trainer_email = trainer_email.lower().strip() if pd.notna(trainer_email) else None
                    # Use 'Pod Lead.1' (Column K) - the authoritative POD Lead column
                    pod_lead_email = row.get('Pod Lead.1', '')
                    pod_lead_email = pod_lead_email.lower().strip() if pd.notna(pod_lead_email) else None
                    
                    if not trainer_email or not pod_lead_email:
                        continue
                    
                    # Get Jibble ID (convert to string to handle both int and string)
                    jibble_id = row.get('Jibble ID')
                    jibble_id_str = str(int(jibble_id)) if pd.notna(jibble_id) else None
                    
                    # Use raw SQL insert to bypass SQLAlchemy type caching
                    session.execute(text("""
                        INSERT INTO pod_lead_mapping 
                        (trainer_email, trainer_name, pod_lead_email, role, current_status, 
                         jibble_project, jibble_id, jibble_name)
                        VALUES 
                        (:trainer_email, :trainer_name, :pod_lead_email, :role, :current_status,
                         :jibble_project, :jibble_id, :jibble_name)
                    """), {
                        "trainer_email": trainer_email,
                        "trainer_name": row.get('Jibble Name', '') if pd.notna(row.get('Jibble Name')) else '',
                        "pod_lead_email": pod_lead_email,
                        "role": row.get('Role', '') if pd.notna(row.get('Role')) else '',
                        "current_status": row.get('Current Status', '') if pd.notna(row.get('Current Status')) else '',
                        "jibble_project": row.get('Jibble Project', '') if pd.notna(row.get('Jibble Project')) else '',
                        "jibble_id": jibble_id_str,
                        "jibble_name": row.get('Jibble Name', '') if pd.notna(row.get('Jibble Name')) else None
                    })
                    records_inserted += 1
                
                session.commit()
            
            self.log_sync_complete(log_id, records_inserted, True)
            logger.info(f"[OK] Successfully synced {records_inserted} pod_lead_mapping records from {source}")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing pod_lead_mapping: {e}")
            return False
    
    def sync_jibble_hours(self, sync_type: str = 'initial') -> bool:
        """Sync Jibble hours from BigQuery turing-230020.test.Jibblelogs"""
        from app.models.db_models import JibbleHours
        from sqlalchemy import delete
        
        log_id = self.log_sync_start('jibble_hours', sync_type)
        
        try:
            # Query BigQuery for Jibble hours
            # Get project names from centralized constants
            jibble_project_names = list(self._constants.jibble.JIBBLE_UUID_TO_NAME.values())
            project_names_sql = ", ".join(f'"{name}"' for name in jibble_project_names)
            
            query = f"""
            SELECT 
                MEMBER_CODE as member_code, 
                Jibble_DATE as entry_date,
                Jibble_PROJECT as project, 
                FULL_NAME as full_name,
                SUM(TRACKED_HRS) as logged_hours
            FROM `turing-230020.test.Jibblelogs`
            WHERE Jibble_PROJECT IN ({project_names_sql})
            GROUP BY 1, 2, 3, 4
            ORDER BY entry_date DESC
            """
            
            logger.info("Fetching Jibble hours from BigQuery...")
            results = self.bq_client.query(query).result()
            
            data = []
            for row in results:
                data.append({
                    'member_code': str(row.member_code) if row.member_code else None,
                    'entry_date': row.entry_date,
                    'project': row.project,
                    'full_name': row.full_name,
                    'logged_hours': float(row.logged_hours) if row.logged_hours else 0.0
                })
            
            logger.info(f"Fetched {len(data)} Jibble hours records from BigQuery")
            
            with self.db_service.get_session() as session:
                # Clear existing data
                session.execute(delete(JibbleHours))
                
                # Insert new data
                for record in data:
                    if record['member_code']:
                        jh = JibbleHours(
                            member_code=record['member_code'],
                            entry_date=record['entry_date'],
                            project=record['project'],
                            full_name=record['full_name'],
                            logged_hours=record['logged_hours']
                        )
                        session.add(jh)
                
                session.commit()
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} jibble_hours records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing jibble_hours: {e}")
            return False
    
    def sync_jibble_email_mapping(self, sync_type: str = 'initial') -> bool:
        """Sync Jibble ID to Turing Email mapping from Google Sheets.
        
        Sheet: https://docs.google.com/spreadsheets/d/1nR15UwSHx2WwQYFePAQIyIORf2aSCNp4ny33jetETZ8/
        Columns: Jibble ID | Jibble Email | Jibble Name | Turing Email
        
        This mapping links jibble_hours.member_code to trainer turing emails.
        """
        from app.models.db_models import JibbleEmailMapping
        import pandas as pd
        
        log_id = self.log_sync_start('jibble_email_mapping', sync_type)
        
        try:
            # Sheet ID from environment or use default
            sheet_id = os.environ.get(
                'JIBBLE_EMAIL_MAPPING_SHEET_ID', 
                '1nR15UwSHx2WwQYFePAQIyIORf2aSCNp4ny33jetETZ8'
            )
            # Specific worksheet gid for "Brittney's Mapping" tab
            worksheet_gid = os.environ.get('JIBBLE_EMAIL_MAPPING_SHEET_GID', '1375209319')
            
            try:
                import gspread
                
                logger.info(f"Loading Jibble email mapping from Google Sheet: {sheet_id}")
                
                # Get credentials and authorize
                credentials = self._get_google_sheets_credentials()
                gc = gspread.authorize(credentials)
                
                # Open the spreadsheet by ID
                spreadsheet = gc.open_by_key(sheet_id)
                
                # Get specific worksheet by gid
                worksheet = None
                for ws in spreadsheet.worksheets():
                    if str(ws.id) == worksheet_gid:
                        worksheet = ws
                        break
                
                if worksheet is None:
                    # Fallback to first sheet
                    worksheet = spreadsheet.sheet1
                    logger.warning(f"Worksheet gid {worksheet_gid} not found, using first sheet")
                
                # Get all values
                all_values = worksheet.get_all_values()
                
                if len(all_values) < 2:
                    raise ValueError("Google Sheet has no data rows")
                
                # First row is header
                headers = all_values[0]
                logger.info(f"Sheet headers: {headers}")
                
                # Convert to DataFrame
                df = pd.DataFrame(all_values[1:], columns=headers)
                logger.info(f"Loaded {len(df)} rows from Google Sheet")
                
            except ImportError:
                logger.error("gspread not installed - cannot sync jibble_email_mapping")
                self.log_sync_complete(log_id, 0, False, "gspread not installed")
                return False
            except Exception as e:
                logger.error(f"Failed to load from Google Sheet: {e}")
                self.log_sync_complete(log_id, 0, False, str(e))
                return False
            
            # Process the data
            # Expected columns: Jibble ID, Jibble Email, Jibble Name, Turing Email
            records_inserted = 0
            
            with self.db_service.get_session() as session:
                # Clear existing mappings
                session.execute(text("DELETE FROM jibble_email_mapping"))
                
                for _, row in df.iterrows():
                    jibble_id = str(row.get('Jibble ID', '')).strip()
                    jibble_email = str(row.get('Jibble Email', '')).strip().lower()
                    jibble_name = str(row.get('Jibble Name', '')).strip()
                    turing_email = str(row.get('Turing Email', '')).strip().lower()
                    
                    # Skip rows without jibble_id or turing_email
                    if not jibble_id or not turing_email or jibble_id == 'nan' or turing_email == 'nan':
                        continue
                    
                    # Insert using raw SQL to avoid caching issues
                    session.execute(text("""
                        INSERT INTO jibble_email_mapping 
                        (jibble_id, jibble_email, jibble_name, turing_email, last_synced)
                        VALUES (:jibble_id, :jibble_email, :jibble_name, :turing_email, NOW())
                        ON CONFLICT (jibble_id) DO UPDATE SET
                            jibble_email = EXCLUDED.jibble_email,
                            jibble_name = EXCLUDED.jibble_name,
                            turing_email = EXCLUDED.turing_email,
                            last_synced = NOW()
                    """), {
                        "jibble_id": jibble_id,
                        "jibble_email": jibble_email if jibble_email != 'nan' else None,
                        "jibble_name": jibble_name if jibble_name != 'nan' else None,
                        "turing_email": turing_email
                    })
                    records_inserted += 1
                
                session.commit()
            
            self.log_sync_complete(log_id, records_inserted, True)
            logger.info(f"[OK] Successfully synced {records_inserted} jibble_email_mapping records")
            return True
            
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing jibble_email_mapping: {e}")
            return False
    
    def sync_jibble_hours_from_api(self, sync_type: str = 'auto', days_back: int = None) -> bool:
        """
        Sync ALL Jibble hours from API to local database.
        
        Strategy:
        1. Fetch ALL timesheets from Jibble API (for all people)
        2. Store everything in jibble_hours table with source='jibble_api'
        3. Filtering for Nvidia team happens at QUERY time using jibble_email_mapping
        
        Args:
            sync_type: 'auto' (detect), 'initial' (90 days), 'scheduled' (7 days)
            days_back: Override days to fetch (default: auto-detected)
        
        Auto-detection:
        - If no API records exist in jibble_hours, treat as initial (90 days)
        - If API records exist, treat as scheduled (7 days)
        
        Benefits:
        - Doesn't rely on flaky People endpoint
        - Simple sync - just fetch and store
        - Local filtering is fast and flexible
        - Hourly sync keeps data fresh
        """
        from app.models.db_models import JibbleHours
        from app.services.jibble_service import JibbleService
        from datetime import timedelta
        
        log_id = self.log_sync_start('jibble_hours_api', sync_type)
        
        try:
            # Auto-detect sync type by checking if API data exists
            if sync_type == 'auto' or days_back is None:
                with self.db_service.get_session() as session:
                    api_count = session.execute(text(
                        "SELECT COUNT(*) FROM jibble_hours WHERE source = 'jibble_api'"
                    )).scalar()
                
                is_first_sync = api_count == 0
                
                if days_back is None:
                    if is_first_sync:
                        days_back = 90  # 3 months for first sync
                        sync_type = 'initial'
                    else:
                        days_back = 7   # 1 week for subsequent syncs
                        sync_type = 'scheduled'
                
                logger.info(f"Auto-detected: {'First sync' if is_first_sync else 'Subsequent sync'} (API records: {api_count})")
            
            logger.info(f"Starting Jibble API sync (last {days_back} days, type={sync_type})...")
            
            # Initialize Jibble service
            jibble_service = JibbleService()
            
            # Test connection (just verifies token)
            conn_test = jibble_service.test_connection()
            if not conn_test.get("success"):
                raise Exception(f"Jibble API connection failed: {conn_test.get('message')}")
            
            # Date range
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days_back)
            
            logger.info(f"Fetching data from {start_date.date()} to {end_date.date()}")
            
            # Step 1: Fetch timesheets in chunks (API has date range limits)
            logger.info("Step 1: Fetching ALL timesheets from Jibble API...")
            
            timesheets = {}
            chunk_days = 14  # Smaller chunks for reliability
            current_start = start_date
            
            while current_start < end_date:
                chunk_end = min(current_start + timedelta(days=chunk_days), end_date)
                logger.info(f"  Fetching: {current_start.date()} to {chunk_end.date()}")
                
                try:
                    chunk_data = jibble_service.get_timesheets_summary(current_start, chunk_end)
                    
                    # Merge chunk data
                    for person_id, data in chunk_data.items():
                        if person_id not in timesheets:
                            timesheets[person_id] = {"_name": data.get("_name", ""), "_total": 0}
                        
                        for key, value in data.items():
                            if key == "_total":
                                timesheets[person_id]["_total"] = timesheets[person_id].get("_total", 0) + value
                            elif key == "_name":
                                if not timesheets[person_id].get("_name"):
                                    timesheets[person_id]["_name"] = value
                            else:
                                # Daily entry
                                if key not in timesheets[person_id]:
                                    timesheets[person_id][key] = value
                    
                    logger.info(f"    Got {len(chunk_data)} people")
                except Exception as chunk_err:
                    logger.warning(f"    Chunk failed: {chunk_err}")
                
                current_start = chunk_end + timedelta(days=1)
            
            logger.info(f"Total: {len(timesheets)} people with timesheet data")
            
            # Step 2: Load email mapping for turing_email matching (optional enhancement)
            logger.info("Step 2: Loading email mappings for turing_email enrichment...")
            
            name_to_turing = {}
            with self.db_service.get_session() as session:
                mappings = session.execute(text("""
                    SELECT jibble_name, turing_email
                    FROM jibble_email_mapping
                    WHERE turing_email IS NOT NULL AND jibble_name IS NOT NULL
                """)).fetchall()
                
                for m in mappings:
                    if m.jibble_name:
                        name_to_turing[m.jibble_name.lower().strip()] = m.turing_email.lower()
            
            logger.info(f"Loaded {len(name_to_turing)} name->turing_email mappings")
            
            # Step 3: Store ALL data in database
            logger.info("Step 3: Storing data in database...")
            
            records = []
            for person_id, data in timesheets.items():
                full_name = data.get("_name", "")
                
                # Try to match turing_email by name (for convenience, not filtering)
                turing_email = name_to_turing.get(full_name.lower().strip()) if full_name else None
                
                # Process daily breakdown
                for date_str, hours in data.items():
                    if date_str.startswith("_"):
                        continue
                    if hours == 0:
                        continue
                    
                    try:
                        entry_date = datetime.fromisoformat(date_str).date()
                    except:
                        continue
                    
                    records.append({
                        'member_code': person_id,  # Use UUID as member_code
                        'entry_date': entry_date,
                        'project': 'Jibble API',  # Mark as coming from API
                        'full_name': full_name,
                        'logged_hours': float(hours),
                        'turing_email': turing_email,  # May be None - filtered at query time
                    })
            
            logger.info(f"Prepared {len(records)} records to insert")
            
            # Safety check: Only proceed if we have data to insert
            if not records:
                logger.warning("No records fetched from API - skipping delete to preserve existing data")
                self.log_sync_complete(log_id, 0, True, "No new records fetched")
                return True
            
            # Step 4: Store ALL data in database (atomic transaction)
            logger.info("Step 4: Storing in database...")
            
            with self.db_service.get_session() as session:
                # Clear existing API-sourced data for the date range
                # This is safe because we verified we have records to insert above
                deleted = session.execute(text("""
                    DELETE FROM jibble_hours 
                    WHERE source = 'jibble_api'
                    AND entry_date >= :start_date 
                    AND entry_date <= :end_date
                """), {
                    "start_date": start_date.date(),
                    "end_date": end_date.date()
                })
                logger.info(f"Cleared {deleted.rowcount} old API records for date range")
                
                # Batch insert for performance
                if records:
                    # Insert in batches of 1000
                    batch_size = 1000
                    inserted = 0
                    
                    for i in range(0, len(records), batch_size):
                        batch = records[i:i + batch_size]
                        
                        for record in batch:
                            session.execute(text("""
                                INSERT INTO jibble_hours 
                                (member_code, entry_date, project, full_name, logged_hours, 
                                 turing_email, source, last_synced)
                                VALUES 
                                (:member_code, :entry_date, :project, :full_name, :logged_hours,
                                 :turing_email, 'jibble_api', NOW())
                            """), record)
                            inserted += 1
                        
                        logger.info(f"  Inserted batch {i//batch_size + 1}: {len(batch)} records")
                    
                    session.commit()
                else:
                    inserted = 0
            
            # Count how many have turing_email for stats
            with self.db_service.get_session() as session:
                matched = session.execute(text("""
                    SELECT COUNT(*) FROM jibble_hours 
                    WHERE source = 'jibble_api' AND turing_email IS NOT NULL
                """)).scalar()
                total = session.execute(text("""
                    SELECT COUNT(*) FROM jibble_hours WHERE source = 'jibble_api'
                """)).scalar()
            
            self.log_sync_complete(log_id, inserted, True)
            logger.info(f"Successfully synced {inserted} jibble_hours records from API")
            logger.info(f"  With turing_email (Nvidia team): {matched}")
            logger.info(f"  Without turing_email (all others): {total - matched}")
            return True
            
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing jibble_hours from API: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def sync_jibble_hours_by_project(self, sync_type: str = 'scheduled') -> bool:
        """
        Sync Jibble hours using TimeEntries API with project filtering.
        
        This provides accurate per-project hours by:
        1. Fetching TimeEntries filtered by Nvidia project IDs
        2. Calculating hours from In/Out entry pairs
        3. Storing with actual project names for filtering
        
        Slower than TimesheetsSummary but gives project breakdown.
        """
        from app.models.db_models import JibbleHours
        from app.services.jibble_timeentries_sync import JibbleTimeEntriesSync, NVIDIA_PROJECTS
        
        log_id = self.log_sync_start('jibble_hours_by_project', sync_type)
        
        try:
            logger.info("Starting Jibble TimeEntries sync for Nvidia projects...")
            
            sync = JibbleTimeEntriesSync()
            all_records = []
            
            # Load email mappings for turing_email enrichment
            name_to_turing = {}
            with self.db_service.get_session() as session:
                mappings = session.execute(text("""
                    SELECT jibble_name, turing_email
                    FROM jibble_email_mapping
                    WHERE turing_email IS NOT NULL AND jibble_name IS NOT NULL
                """)).fetchall()
                
                for m in mappings:
                    if m.jibble_name:
                        name_to_turing[m.jibble_name.lower().strip()] = m.turing_email.lower()
            
            logger.info(f"Loaded {len(name_to_turing)} name->turing_email mappings")
            
            # Sync each Nvidia project
            for project_id, project_name in NVIDIA_PROJECTS.items():
                logger.info(f"Syncing {project_name}...")
                
                try:
                    results = sync.sync_nvidia_project_hours(project_id, project_name)
                    
                    # Enrich with turing_email
                    for r in results:
                        full_name = r.get("full_name", "")
                        turing_email = name_to_turing.get(full_name.lower().strip()) if full_name else None
                        r["turing_email"] = turing_email
                    
                    all_records.extend(results)
                    logger.info(f"  Got {len(results)} records for {project_name}")
                except Exception as proj_err:
                    logger.warning(f"  Error syncing {project_name}: {proj_err}")
            
            logger.info(f"Total records from all Nvidia projects: {len(all_records)}")
            
            if not all_records:
                logger.warning("No records fetched - keeping existing data")
                self.log_sync_complete(log_id, 0, True, "No new records")
                return True
            
            # Store in database
            with self.db_service.get_session() as session:
                # Delete existing project-specific entries (source='jibble_api_timeentries')
                session.execute(text("""
                    DELETE FROM jibble_hours 
                    WHERE source = 'jibble_api_timeentries'
                """))
                
                # Insert new records
                inserted = 0
                batch_size = 500
                
                for i in range(0, len(all_records), batch_size):
                    batch = all_records[i:i+batch_size]
                    
                    for record in batch:
                        session.execute(text("""
                            INSERT INTO jibble_hours 
                            (member_code, entry_date, project, full_name, logged_hours, 
                             turing_email, source, last_synced)
                            VALUES 
                            (:person_id, :entry_date, :project, :full_name, :logged_hours,
                             :turing_email, 'jibble_api_timeentries', NOW())
                        """), record)
                        inserted += 1
                    
                    logger.info(f"  Inserted batch {i//batch_size + 1}")
                
                session.commit()
            
            self.log_sync_complete(log_id, inserted, True)
            logger.info(f"[OK] Successfully synced {inserted} jibble_hours records with project breakdown")
            return True
            
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing jibble_hours by project: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return False
    
    def sync_trainer_review_stats(self, sync_type: str = 'scheduled') -> bool:
        """
        Sync trainer review attribution - attributes each review to the trainer
        who did the specific work that was reviewed.
        
        For each review:
        1. Find the most recent completion event BEFORE the review was submitted
        2. The trainer who made that completion gets the review attributed to them
        
        This enables accurate per-trainer metrics:
        - Trainer A completes -> rejected (3.3) -> reworks -> approved (4.8)
          = Trainer A gets 2 reviews with scores [3.3, 4.8]
        - Trainer A completes -> rejected (2.3) -> Trainer B reworks -> approved (5.0)
          = Trainer A gets 1 review [2.3], Trainer B gets 1 review [5.0]
        """
        log_id = self.log_sync_start('trainer_review_stats', sync_type)
        
        try:
            self.initialize_bigquery_client()
            
            # Get project IDs from settings
            project_ids = self.settings.project_id_filter
            if isinstance(project_ids, int):
                project_ids = [project_ids]
            elif isinstance(project_ids, str):
                project_ids = [int(p.strip()) for p in project_ids.split(',')]
            
            # Add all Nvidia project IDs from constants
            all_project_ids = list(set(project_ids + self._constants.projects.PRIMARY_PROJECT_IDS))
            project_filter = ','.join(map(str, all_project_ids))
            
            logger.info(f"Syncing trainer_review_stats for projects: {all_project_ids}")
            
            # Query to attribute each review to the trainer who did the work
            query = f"""
            WITH completions AS (
                -- All completion events with trainer info
                SELECT 
                    csh.conversation_id,
                    csh.created_at as completion_time,
                    c.turing_email as trainer_email,
                    ROW_NUMBER() OVER (
                        PARTITION BY csh.conversation_id 
                        ORDER BY csh.created_at
                    ) as completion_number
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation_status_history` csh
                JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c 
                    ON csh.author_id = c.id
                JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` conv 
                    ON conv.id = csh.conversation_id
                WHERE csh.new_status = 'completed'
                AND csh.old_status != 'completed-approval'
                AND conv.project_id IN ({project_filter})
            ),
            reviews AS (
                -- All published reviews (manual and auto/agentic)
                SELECT 
                    r.id as review_id,
                    r.conversation_id,
                    r.score,
                    r.followup_required,
                    r.created_at as review_time,
                    r.review_type,
                    conv.project_id
                FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review` r
                JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` conv 
                    ON conv.id = r.conversation_id
                WHERE r.review_type IN ('manual', 'auto')
                AND r.status = 'published'
                AND conv.project_id IN ({project_filter})
            ),
            review_completion_match AS (
                -- Match each review to the completion that triggered it
                SELECT 
                    r.review_id,
                    r.conversation_id as task_id,
                    r.score,
                    r.followup_required,
                    r.review_time,
                    r.review_type,
                    r.project_id,
                    c.trainer_email,
                    c.completion_time,
                    c.completion_number,
                    ROW_NUMBER() OVER (
                        PARTITION BY r.review_id 
                        ORDER BY c.completion_time DESC
                    ) as rn
                FROM reviews r
                JOIN completions c ON c.conversation_id = r.conversation_id
                    AND c.completion_time <= r.review_time
            )
            SELECT 
                review_id,
                task_id,
                trainer_email,
                completion_time,
                completion_number,
                review_time,
                DATE(review_time) as review_date,
                score,
                followup_required,
                review_type,
                project_id
            FROM review_completion_match
            WHERE rn = 1 
            AND trainer_email IS NOT NULL
            ORDER BY review_time DESC
            """
            
            logger.info("Fetching trainer review attribution from BigQuery...")
            query_job = self.bq_client.query(query)
            results = query_job.result()
            
            data = []
            for row in results:
                row_dict = dict(row)
                data.append({
                    'review_id': row_dict.get('review_id'),
                    'task_id': row_dict.get('task_id'),
                    'trainer_email': row_dict.get('trainer_email', '').lower().strip() if row_dict.get('trainer_email') else None,
                    'completion_time': row_dict.get('completion_time'),
                    'completion_number': row_dict.get('completion_number'),
                    'review_time': row_dict.get('review_time'),
                    'review_date': row_dict.get('review_date'),
                    'score': float(row_dict.get('score')) if row_dict.get('score') is not None else None,
                    'followup_required': int(row_dict.get('followup_required', 0)),
                    'review_type': row_dict.get('review_type', 'manual'),  # 'manual' or 'auto' (agentic)
                    'project_id': row_dict.get('project_id')
                })
            
            logger.info(f"Fetched {len(data)} trainer review attribution records")
            
            with self.db_service.get_session() as session:
                # Clear existing data
                logger.info("Clearing existing trainer_review_stats data...")
                session.execute(delete(TrainerReviewStats))
                session.commit()
                
                # Batch insert
                batch_size = 5000
                for i in range(0, len(data), batch_size):
                    batch = data[i:i + batch_size]
                    objects = [TrainerReviewStats(**record) for record in batch if record.get('trainer_email')]
                    session.bulk_save_objects(objects)
                    session.commit()
                    logger.info(f"Synced {min(i + batch_size, len(data))}/{len(data)} trainer_review_stats records")
            
            self.log_sync_complete(log_id, len(data), True)
            logger.info(f"[OK] Successfully synced {len(data)} trainer_review_stats records")
            return True
            
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"[ERROR] Error syncing trainer_review_stats: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def sync_all_tables(self, sync_type: str = 'scheduled') -> Dict[str, bool]:
        """Sync all required data from BigQuery to PostgreSQL"""
        logger.info(f"Starting data sync ({sync_type})...")
        logger.info("=" * 80)
        
        results = {}
        
        sync_order = [
            ('contributor', self.sync_contributor),
            ('task_reviewed_info', self.sync_task_reviewed_info),
            ('task', self.sync_task),
            ('review_detail', self.sync_review_detail),
            ('task_aht', self.sync_task_aht),
            ('contributor_task_stats', self.sync_contributor_task_stats),
            ('contributor_daily_stats', self.sync_contributor_daily_stats),
            ('reviewer_daily_stats', self.sync_reviewer_daily_stats),
            ('reviewer_trainer_daily_stats', self.sync_reviewer_trainer_daily_stats),
            ('task_raw', self.sync_task_raw),
            ('task_history_raw', self.sync_task_history_raw),
            ('pod_lead_mapping', self.sync_pod_lead_mapping),
            ('jibble_email_mapping', self.sync_jibble_email_mapping),  # Jibble ID to Turing email mapping
            ('jibble_hours', self.sync_jibble_hours),  # Jibble hours from BigQuery
            ('trainer_review_stats', self.sync_trainer_review_stats),  # Per-trainer review attribution
        ]
        
        for table_name, sync_func in sync_order:
            try:
                logger.info(f"Syncing: {table_name}")
                results[table_name] = sync_func(sync_type)
            except Exception as e:
                logger.error(f"Error syncing {table_name}: {e}")
                results[table_name] = False
        
        success_count = sum(1 for v in results.values() if v)
        logger.info("=" * 80)
        logger.info(f"Data sync completed: {success_count}/{len(results)} tables synced successfully")
        
        return results


_data_sync_service = None


def get_data_sync_service() -> DataSyncService:
    """Get or create the global data sync service instance"""
    global _data_sync_service
    if _data_sync_service is None:
        _data_sync_service = DataSyncService()
    return _data_sync_service
