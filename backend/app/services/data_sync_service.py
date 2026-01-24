"""
Data synchronization service to sync CTE results from BigQuery to PostgreSQL
For nvidia: prod_labeling_tool_n, project_id 39
"""
import logging
from datetime import datetime
from typing import Dict, Optional
from sqlalchemy import delete, text
from google.cloud import bigquery

from app.config import get_settings
from app.services.db_service import get_db_service
from app.models.db_models import ReviewDetail, Task, Contributor, DataSyncLog, TaskReviewedInfo, TaskAHT, ContributorTaskStats, ContributorDailyStats, ReviewerDailyStats, TaskRaw, TaskHistoryRaw, PodLeadMapping, ReviewerTrainerDailyStats

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
                        FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history` csh_inner
                        WHERE csh_inner.conversation_id = c.id
                            AND csh_inner.old_status = 'labeling'
                            AND csh_inner.new_status = 'completed'
                    ) AS annotation_date
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation` c
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.review` r
                    ON c.id = r.conversation_id
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b
                    ON c.project_id = b.project_id
                LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.delivery_batch_task` bt
                    ON bt.task_id = c.id
                LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.contributor` cb
                    ON cb.id = c.current_user_id
                WHERE c.project_id = {self.settings.project_id_filter}
                    AND c.status IN ('completed', 'validated')
                    AND r.review_type NOT IN ('auto')
                    AND r.followup_required = 0
                    AND r.id = (
                        SELECT MAX(rn.id)
                        FROM `turing-gpt.{self.settings.bigquery_dataset}.review` rn
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
            logger.info(f"✓ Successfully synced {len(data)} review_detail records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing review_detail: {e}")
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
                        FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history` csh_inner
                        WHERE csh_inner.conversation_id = c.id
                            AND csh_inner.old_status = 'labeling'
                            AND csh_inner.new_status = 'completed'
                    ) AS annotation_date
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation` c
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.review` r
                    ON c.id = r.conversation_id
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b
                    ON c.project_id = b.project_id
                LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.delivery_batch_task` bt
                    ON bt.task_id = c.id
                LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.contributor` cb
                    ON cb.id = c.current_user_id
                WHERE c.project_id = {self.settings.project_id_filter}
                    AND c.status IN ('completed', 'validated')
                    AND r.review_type NOT IN ('auto')
                    AND r.followup_required = 0
                    AND r.id = (
                        SELECT MAX(rn.id)
                        FROM `turing-gpt.{self.settings.bigquery_dataset}.review` rn
                        WHERE rn.conversation_id = r.conversation_id
                            AND rn.review_type = 'manual'
                            AND rn.status = 'published'
                    )
            ),
            rework_counts AS (
                SELECT 
                    conversation_id,
                    COUNTIF(old_status = 'rework' OR new_status = 'rework') AS rework_count
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history`
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
            logger.info(f"✓ Successfully synced {len(data)} task records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing task: {e}")
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
            logger.info(f"✓ Successfully synced {len(data)} contributor records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing contributor: {e}")
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
                            FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history` csh_inner
                            WHERE csh_inner.conversation_id = c.id
                                AND csh_inner.old_status = 'labeling'
                                AND csh_inner.new_status = 'completed'
                        ) AS annotation_date
                    FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation` c
                    INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.review` r
                        ON c.id = r.conversation_id
                    INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b
                        ON c.project_id = b.project_id
                    LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.delivery_batch_task` bt
                        ON bt.task_id = c.id
                    LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.contributor` cb
                        ON cb.id = c.current_user_id
                    WHERE c.project_id = {self.settings.project_id_filter}
                        AND c.status IN ('completed', 'validated')
                        AND r.review_type NOT IN ('auto')
                        AND r.followup_required = 0
                        AND r.id = (
                            SELECT MAX(rn.id)
                            FROM `turing-gpt.{self.settings.bigquery_dataset}.review` rn
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
            logger.info(f"✓ Successfully synced {len(data)} task_reviewed_info records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing task_reviewed_info: {e}")
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
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history` csh
                JOIN `turing-gpt.{self.settings.bigquery_dataset}.conversation` cs
                    ON csh.conversation_id = cs.id
                JOIN `turing-gpt.{self.settings.bigquery_dataset}.contributor` c
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
            logger.info(f"✓ Successfully synced {len(data)} task_aht records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing task_aht: {e}")
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
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history` csh
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.conversation` cs 
                    ON csh.conversation_id = cs.id
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND b.name NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')
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
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation` cs
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.contributor` c 
                    ON cs.current_user_id = c.id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND b.name NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')
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
            logger.info(f"✓ Successfully synced {len(data)} contributor_task_stats records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing contributor_task_stats: {e}")
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
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history` csh
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.conversation` cs 
                    ON csh.conversation_id = cs.id
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND b.name NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')
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
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation` cs
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND b.name NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')
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
            logger.info(f"✓ Successfully synced {len(data)} contributor_daily_stats records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing contributor_daily_stats: {e}")
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
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history` csh
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.conversation` cs 
                    ON csh.conversation_id = cs.id
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND b.name NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')
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
                FROM `turing-gpt.{self.settings.bigquery_dataset}.review` r
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.conversation` cs 
                    ON r.conversation_id = cs.id
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                LEFT JOIN task_latest_count tlc ON r.conversation_id = tlc.task_id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND b.name NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')
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
            LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.conversation` tr ON rwti.task_id = tr.id
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
            logger.info(f"✓ Successfully synced {len(data)} reviewer_daily_stats records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing reviewer_daily_stats: {e}")
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
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history` csh
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.conversation` cs 
                    ON csh.conversation_id = cs.id
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND b.name NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')
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
                FROM `turing-gpt.{self.settings.bigquery_dataset}.review` r
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.conversation` cs 
                    ON r.conversation_id = cs.id
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b
                    ON cs.batch_id = b.id
                LEFT JOIN task_latest_count tlc ON r.conversation_id = tlc.task_id
                WHERE cs.project_id = {project_id}
                  AND b.status != 'draft'
                  AND b.name NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')
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
            logger.info(f"✓ Successfully synced {len(data)} reviewer_trainer_daily_stats records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing reviewer_trainer_daily_stats: {e}")
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
            FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history` th
            LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.contributor` c ON th.author_id = c.id
            INNER JOIN (
                SELECT t.id, t.project_id, b.name AS batch_name
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation` t
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b ON t.batch_id = b.id
                WHERE t.project_id IN (36, 37, 38, 39)
                  AND b.status != 'draft'
                  AND b.name NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')
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
            logger.info(f"✓ Successfully synced {len(data)} task_history_raw records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing task_history_raw: {e}")
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
                FROM `turing-gpt.{self.settings.bigquery_dataset}.review`
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
                FROM `turing-gpt.{self.settings.bigquery_dataset}.review` r
                LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.contributor` c ON r.reviewer_id = c.id
                WHERE r.review_type IN ('manual') AND r.status = 'published'
                QUALIFY rn = 1
            ),
            first_completion AS (
                SELECT 
                    t.conversation_id,
                    DATE(TIMESTAMP(t.created_at)) AS first_completion_date, 
                    c.turing_email AS first_completer,
                    ROW_NUMBER() OVER (PARTITION BY t.conversation_id ORDER BY t.created_at ASC) AS rn
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history` t
                LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.contributor` c ON t.author_id = c.id
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
                FROM `turing-gpt.{self.settings.bigquery_dataset}.delivery_batch_task` dbt 
                LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.delivery_batch` db ON db.id = dbt.delivery_batch_id
                LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.contributor` c ON db.author_id = c.id
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
            FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation` t
            INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b ON t.batch_id = b.id
            LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.contributor` c ON t.current_user_id = c.id
            LEFT JOIN first_completion fc ON fc.conversation_id = t.id
            LEFT JOIN task_delivery td ON td.task_id = t.id
            LEFT JOIN (
                SELECT rs.*, lr.*
                FROM latest_reviews lr
                LEFT JOIN review_stats rs ON rs.conversation_id_rs = lr.task_id_r
            ) r ON r.task_id_r = t.id
            LEFT JOIN review_stats rs ON rs.conversation_id_rs = t.id
            LEFT JOIN latest_reviews lr ON lr.task_id_r = t.id
            WHERE t.project_id IN (36, 37, 38, 39)
              AND b.status != 'draft'
              AND b.name NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')
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
            logger.info(f"✓ Successfully synced {len(data)} task_raw records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing task_raw: {e}")
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
            FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation_status_history` th
            LEFT JOIN `turing-gpt.{self.settings.bigquery_dataset}.contributor` c ON th.author_id = c.id
            INNER JOIN (
                SELECT t.id, t.project_id, b.name AS batch_name
                FROM `turing-gpt.{self.settings.bigquery_dataset}.conversation` t
                INNER JOIN `turing-gpt.{self.settings.bigquery_dataset}.batch` b ON t.batch_id = b.id
                WHERE t.project_id IN (36, 37, 38, 39)
                  AND b.status != 'draft'
                  AND b.name NOT IN ('sft-mcb-vanilla-batch-1', 'sft-mcb-advance-batch-1')
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
            logger.info(f"✓ Successfully synced {len(data)} task_history_raw records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing task_history_raw: {e}")
            return False
    
    def sync_pod_lead_mapping(self, sync_type: str = 'initial') -> bool:
        """Sync POD Lead mapping from static Excel file.
        
        Uses raw SQL inserts to avoid SQLAlchemy type caching issues.
        """
        import os
        import pandas as pd
        
        log_id = self.log_sync_start('pod_lead_mapping', sync_type)
        
        try:
            # Find the Excel file
            excel_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                'static_data',
                'pod_Jibble_mapping.xlsx'
            )
            
            if not os.path.exists(excel_path):
                logger.warning(f"POD Lead mapping file not found: {excel_path}")
                return False
            
            logger.info(f"Loading POD Lead mapping from: {excel_path}")
            
            # Read Excel file
            df = pd.read_excel(excel_path)
            
            # Include all Nvidia projects (36, 37, 38, 39)
            nvidia_projects = [
                'Nvidia - SysBench',           # 36
                'Nvidia - CFBench Multilingual', # 37
                'Nvidia - InverseIFEval',      # 38
                'Nvidia - Multichallenge',     # 39
                'Nvidia - Multichallenge Advanced',  # May also be 39
            ]
            df = df[df['Jibble Project'].isin(nvidia_projects)]
            
            # Only include records with POD Lead assigned
            df = df[df['Pod Lead.1'].notna()]
            
            # Remove duplicate trainers (keep first occurrence)
            df['trainer_email_lower'] = df['Turing Email'].str.lower().str.strip()
            df = df.drop_duplicates(subset=['trainer_email_lower'], keep='first')
            
            logger.info(f"Found {len(df)} unique trainer-pod lead mappings for all Nvidia projects")
            
            with self.db_service.get_session() as session:
                # Clear existing mappings using raw SQL
                session.execute(text("DELETE FROM pod_lead_mapping"))
                
                # Prepare data for raw SQL insert
                records_inserted = 0
                for _, row in df.iterrows():
                    trainer_email = row.get('Turing Email', '')
                    trainer_email = trainer_email.lower().strip() if pd.notna(trainer_email) else None
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
            logger.info(f"✓ Successfully synced {records_inserted} pod_lead_mapping records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing pod_lead_mapping: {e}")
            return False
    
    def sync_jibble_hours(self, sync_type: str = 'initial') -> bool:
        """Sync Jibble hours from BigQuery turing-230020.test.Jibblelogs"""
        from app.models.db_models import JibbleHours
        from sqlalchemy import delete
        
        log_id = self.log_sync_start('jibble_hours', sync_type)
        
        try:
            # Query BigQuery for Jibble hours
            query = """
            SELECT 
                MEMBER_CODE as member_code, 
                Jibble_DATE as entry_date,
                Jibble_PROJECT as project, 
                FULL_NAME as full_name,
                SUM(TRACKED_HRS) as logged_hours
            FROM `turing-230020.test.Jibblelogs`
            WHERE Jibble_PROJECT IN (
                "Nvidia - ICPC", 
                "Nvidia - CFBench Multilingual", 
                "Nvidia - InverseIFEval", 
                "Nvidia - Multichallenge", 
                "Nvidia - Multichallenge Advanced", 
                "Nvidia - SysBench", 
                "NVIDIA_STEM Math_Eval"
            )
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
            logger.info(f"✓ Successfully synced {len(data)} jibble_hours records")
            return True
        except Exception as e:
            self.log_sync_complete(log_id, 0, False, str(e))
            logger.error(f"✗ Error syncing jibble_hours: {e}")
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
            ('jibble_hours', self.sync_jibble_hours),
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
