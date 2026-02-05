"""
BigQuery service for database operations
"""
from google.cloud import bigquery
from google.oauth2 import service_account
from typing import List, Dict, Any, Optional
import os
from collections import defaultdict
from app.config import get_settings


class BigQueryService:
    """Service class for BigQuery operations"""
    
    def __init__(self):
        """Initialize BigQuery client"""
        self.settings = get_settings()
        self.client = self._create_client()
    
    def _create_client(self) -> bigquery.Client:
        """Create and return BigQuery client with credentials"""
        credentials_path = self.settings.google_application_credentials
        
        if credentials_path and os.path.exists(credentials_path):
            credentials = service_account.Credentials.from_service_account_file(
                credentials_path
            )
            return bigquery.Client(
                credentials=credentials,
                project=self.settings.gcp_project_id
            )
        else:
            # Use default credentials (useful for GCP environments)
            return bigquery.Client(project=self.settings.gcp_project_id)
    
    def _build_filter_clauses(self, filters: Optional[Dict[str, Any]] = None) -> str:
        """
        Build WHERE clause conditions from filters
        
        Args:
            filters: Dictionary of filter key-value pairs
            
        Returns:
            SQL WHERE conditions string
        """
        if not filters:
            return ""
        
        conditions = []
        
        # Filter by domain
        if filters.get('domain'):
            conditions.append(f"domain = '{filters['domain']}'")
        
        # Filter by reviewer
        if filters.get('reviewer'):
            conditions.append(f"reviewer_id = '{filters['reviewer']}'")
        
        # Filter by trainer/annotator
        if filters.get('trainer'):
            conditions.append(f"human_role_id = '{filters['trainer']}'")
        
        # Filter by quality dimension
        if filters.get('quality_dimension'):
            conditions.append(f"name = '{filters['quality_dimension']}'")
        
        # Filter by score range
        if filters.get('min_score') is not None:
            conditions.append(f"score >= {filters['min_score']}")
        
        if filters.get('max_score') is not None:
            conditions.append(f"score <= {filters['max_score']}")
        
        if conditions:
            return " AND " + " AND ".join(conditions)
        return ""
    
    def _build_review_detail_query(self, filters: Optional[Dict[str, Any]] = None) -> str:
        """
        Build the base review_detail CTE query
        
        Args:
            filters: Dictionary of filter key-value pairs
        
        Returns:
            SQL query string for review_detail
        """
        filter_clause = self._build_filter_clauses(filters)
        
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
                        -- AND c.batch_id IN (772, 805)
                        AND c.status IN ('completed', 'validated')
                        AND r.review_type NOT IN ('auto')
                        AND r.followup_required = 0
                        -- AND b.status != 'draft'
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
                        tdi.is_delivered,
                        CASE 
                            WHEN REGEXP_CONTAINS(statement, r'\\*\\*domain\\*\\*') THEN
                                TRIM(REGEXP_EXTRACT(statement, r'\\*\\*domain\\*\\*\\s*-\\s*([^\\n]+)'))
                            WHEN REGEXP_CONTAINS(statement, r'\\*\\*suggested-domain\\*\\*') THEN
                                TRIM(REGEXP_EXTRACT(statement, r'\\*\\*suggested-domain\\*\\*\\s*-\\s*([^\\n]+)'))
                            ELSE NULL
                        END AS domain,
                    FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.conversation` as task_
                    RIGHT JOIN task_reviewed_info AS tdi
                        ON tdi.r_id = task_.id
                    WHERE project_id = {self.settings.project_id_filter} 
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
                        a.score as task_score,
                        a.updated_at,
                        rqd.name, 
                        b.score_text, 
                        b.score
                    FROM (SELECT * FROM review WHERE row_num = 1) a
                    RIGHT JOIN task AS task_ 
                        ON task_.id = a.conversation_id
                    LEFT JOIN task_reviewed_info AS tdi
                        ON tdi.r_id = task_.id
                    LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.review_quality_dimension_value` AS b 
                        ON b.review_id = a.id
                    LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.quality_dimension` AS rqd
                        ON rqd.id = b.quality_dimension_id
                    WHERE 1=1 {filter_clause}
                )
        """
    
    def _process_aggregation_results(self, results: List[Dict[str, Any]], group_key: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Process BigQuery results into structured aggregation format
        
        Args:
            results: Raw results from BigQuery
            group_key: The key to group by (domain, reviewer_id, human_role_id) or None for overall
            
        Returns:
            List of aggregated data
        """
        # Group results by the group_key
        grouped_data = defaultdict(lambda: defaultdict(lambda: {
            'name': None,
            'conversation_ids': set(),
            'scores': []
        }))
        
        for row in results:
            # Determine group value
            if group_key:
                group_value = row.get(group_key)
            else:
                group_value = 'overall'
            
            name = row.get('name')
            if name:  # Only process rows with a quality dimension name
                conversation_id = row.get('conversation_id')
                score = row.get('score')
                
                grouped_data[group_value][name]['name'] = name
                
                if conversation_id is not None:
                    grouped_data[group_value][name]['conversation_ids'].add(conversation_id)
                
                if score is not None:
                    grouped_data[group_value][name]['scores'].append(score)
        
        # Convert to final format
        result = []
        for group_value, dimensions in grouped_data.items():
            quality_dimensions = []
            all_conversation_ids = set()  # Track all unique conversations for this group
            
            for name, data in dimensions.items():
                avg_score = None
                if data['scores']:
                    avg_score = sum(data['scores']) / len(data['scores'])
                
                # Add conversation IDs to the group-level set
                all_conversation_ids.update(data['conversation_ids'])
                
                quality_dimensions.append({
                    'name': data['name'],
                    'average_score': avg_score,
                    'score_count': len(data['scores'])
                })
            
            # Sort by name for consistency
            quality_dimensions.sort(key=lambda x: x['name'])
            
            item = {
                'conversation_count': len(all_conversation_ids),  # Total unique conversations for this group
                'quality_dimensions': quality_dimensions
            }
            
            if group_key:
                item[group_key] = group_value
            
            result.append(item)
        
        return result
    
    def _process_reviewer_aggregation_results(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Process BigQuery results for reviewer aggregation with reviewer names
        
        Args:
            results: Raw results from BigQuery with reviewer_id and reviewer_name
            
        Returns:
            List of aggregated data with reviewer names
        """
        # Group results by reviewer_id
        grouped_data = defaultdict(lambda: {
            'reviewer_id': None,
            'reviewer_name': None,
            'dimensions': defaultdict(lambda: {
                'name': None,
                'conversation_ids': set(),
                'scores': []
            })
        })
        
        for row in results:
            reviewer_id = row.get('reviewer_id')
            reviewer_name = row.get('reviewer_name')
            quality_dim_name = row.get('name')
            
            if quality_dim_name:  # Only process rows with a quality dimension name
                conversation_id = row.get('conversation_id')
                score = row.get('score')
                
                # Set reviewer info
                grouped_data[reviewer_id]['reviewer_id'] = reviewer_id
                grouped_data[reviewer_id]['reviewer_name'] = reviewer_name
                
                # Set dimension data
                grouped_data[reviewer_id]['dimensions'][quality_dim_name]['name'] = quality_dim_name
                
                if conversation_id is not None:
                    grouped_data[reviewer_id]['dimensions'][quality_dim_name]['conversation_ids'].add(conversation_id)
                
                if score is not None:
                    grouped_data[reviewer_id]['dimensions'][quality_dim_name]['scores'].append(score)
        
        # Convert to final format
        result = []
        for reviewer_id, reviewer_data in grouped_data.items():
            quality_dimensions = []
            all_conversation_ids = set()  # Track all unique conversations for this reviewer
            
            for name, data in reviewer_data['dimensions'].items():
                avg_score = None
                if data['scores']:
                    avg_score = sum(data['scores']) / len(data['scores'])
                
                # Add conversation IDs to the reviewer-level set
                all_conversation_ids.update(data['conversation_ids'])
                
                quality_dimensions.append({
                    'name': data['name'],
                    'average_score': avg_score,
                    'score_count': len(data['scores'])
                })
            
            # Sort by name for consistency
            quality_dimensions.sort(key=lambda x: x['name'])
            
            result.append({
                'reviewer_id': reviewer_data['reviewer_id'],
                'reviewer_name': reviewer_data['reviewer_name'],
                'conversation_count': len(all_conversation_ids),  # Total unique conversations for this reviewer
                'quality_dimensions': quality_dimensions
            })
        
        return result
    
    def _process_trainer_level_aggregation_results(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Process BigQuery results for trainer level aggregation with trainer names
        
        Args:
            results: Raw results from BigQuery with trainer_level_id and trainer_name
            
        Returns:
            List of aggregated data with trainer level names
        """
        # Group results by trainer_level_id
        grouped_data = defaultdict(lambda: {
            'trainer_level_id': None,
            'trainer_name': None,
            'dimensions': defaultdict(lambda: {
                'name': None,
                'conversation_ids': set(),
                'scores': []
            })
        })
        
        for row in results:
            trainer_level_id = row.get('trainer_level_id')
            trainer_name = row.get('trainer_name')
            quality_dim_name = row.get('name')
            
            if quality_dim_name:  # Only process rows with a quality dimension name
                conversation_id = row.get('conversation_id')
                score = row.get('score')
                
                # Set trainer level info
                grouped_data[trainer_level_id]['trainer_level_id'] = trainer_level_id
                grouped_data[trainer_level_id]['trainer_name'] = trainer_name
                
                # Set dimension data
                grouped_data[trainer_level_id]['dimensions'][quality_dim_name]['name'] = quality_dim_name
                
                if conversation_id is not None:
                    grouped_data[trainer_level_id]['dimensions'][quality_dim_name]['conversation_ids'].add(conversation_id)
                
                if score is not None:
                    grouped_data[trainer_level_id]['dimensions'][quality_dim_name]['scores'].append(score)
        
        # Convert to final format
        result = []
        for trainer_level_id, trainer_data in grouped_data.items():
            quality_dimensions = []
            all_conversation_ids = set()  # Track all unique conversations for this trainer level
            
            for name, data in trainer_data['dimensions'].items():
                avg_score = None
                if data['scores']:
                    avg_score = sum(data['scores']) / len(data['scores'])
                
                # Add conversation IDs to the trainer-level set
                all_conversation_ids.update(data['conversation_ids'])
                
                quality_dimensions.append({
                    'name': data['name'],
                    'average_score': avg_score,
                    'score_count': len(data['scores'])
                })
            
            # Sort by name for consistency
            quality_dimensions.sort(key=lambda x: x['name'])
            
            result.append({
                'trainer_level_id': trainer_data['trainer_level_id'],
                'trainer_name': trainer_data['trainer_name'],
                'conversation_count': len(all_conversation_ids),  # Total unique conversations for this trainer level
                'quality_dimensions': quality_dimensions
            })
        
        return result
    
    async def get_domain_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Get aggregated statistics by domain
        
        Args:
            filters: Dictionary of filter key-value pairs
        
        Returns:
            List of domain aggregations with quality dimension stats
        """
        base_query = self._build_review_detail_query(filters)
        
        query = base_query + """
        SELECT DISTINCT
            domain,
            name,
            conversation_id,
            score_text,
            score
        FROM review_detail
        WHERE name IS NOT NULL
        """
        
        query_job = self.client.query(query)
        results = [dict(row) for row in query_job.result()]
        
        return self._process_aggregation_results(results, 'domain')
    
    async def get_reviewer_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Get aggregated statistics by reviewer with reviewer names
        
        Args:
            filters: Dictionary of filter key-value pairs
        
        Returns:
            List of reviewer aggregations with quality dimension stats and reviewer names
        """
        base_query = self._build_review_detail_query(filters)
        
        query = base_query + f"""
        SELECT DISTINCT
            rd.reviewer_id,
            c.name AS reviewer_name,
            rd.name,
            rd.conversation_id,
            rd.score_text,
            rd.score
        FROM review_detail rd
        LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c
            ON rd.reviewer_id = c.id
        WHERE rd.name IS NOT NULL
        """
        
        query_job = self.client.query(query)
        results = [dict(row) for row in query_job.result()]
        
        return self._process_reviewer_aggregation_results(results)
    
    async def get_trainer_level_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Get aggregated statistics by trainer level (human role) with trainer names
        
        Args:
            filters: Dictionary of filter key-value pairs
        
        Returns:
            List of trainer level aggregations with quality dimension stats and trainer names
        """
        base_query = self._build_review_detail_query(filters)
        
        query = base_query + f"""
        SELECT DISTINCT
            rd.human_role_id AS trainer_level_id,
            c.name AS trainer_name,
            rd.name,
            rd.conversation_id,
            rd.score_text,
            rd.score
        FROM review_detail rd
        LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c
            ON rd.human_role_id = c.id
        WHERE rd.name IS NOT NULL
        """
        
        query_job = self.client.query(query)
        results = [dict(row) for row in query_job.result()]
        
        return self._process_trainer_level_aggregation_results(results)
    
    async def get_task_level_info(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Get task-level information with annotator details and quality dimensions
        
        Args:
            filters: Dictionary of filter key-value pairs
        
        Returns:
            List of task-level information with annotator names and quality dimensions
        """
        base_query = self._build_review_detail_query(filters)
        
        query = base_query + f"""
        SELECT DISTINCT
            rd.conversation_id AS task_id,
            rd.human_role_id AS annotator_id,
            c.name AS annotator_name,
            rd.reviewer_id,
            cr.name AS reviewer_name,
            rd.name AS dimension_name,
            rd.score_text,
            rd.score
        FROM review_detail rd
        LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` c
            ON rd.human_role_id = c.id
        LEFT JOIN `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.contributor` cr
            ON rd.reviewer_id = cr.id
        WHERE rd.name IS NOT NULL
        ORDER BY rd.conversation_id, rd.name
        """
        
        query_job = self.client.query(query)
        results = [dict(row) for row in query_job.result()]
        
        return self._process_task_level_results(results)
    
    def _process_task_level_results(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Process BigQuery results for task-level information
        
        Args:
            results: Raw results from BigQuery with task and annotator info
            
        Returns:
            List of task-level data with annotator names and quality dimensions
        """
        from collections import defaultdict
        
        # Group results by task_id (conversation_id)
        grouped_data = defaultdict(lambda: {
            'task_id': None,
            'annotator_id': None,
            'annotator_name': None,
            'reviewer_id': None,
            'reviewer_name': None,
            'quality_dimensions': []
        })
        
        for row in results:
            task_id = row.get('task_id')
            annotator_id = row.get('annotator_id')
            annotator_name = row.get('annotator_name')
            reviewer_id = row.get('reviewer_id')
            reviewer_name = row.get('reviewer_name')
            dimension_name = row.get('dimension_name')
            score_text = row.get('score_text')
            score = row.get('score')
            
            if task_id is not None:
                # Set task and annotator info (will be the same for all rows of this task)
                grouped_data[task_id]['task_id'] = task_id
                grouped_data[task_id]['annotator_id'] = annotator_id
                grouped_data[task_id]['annotator_name'] = annotator_name
                grouped_data[task_id]['reviewer_id'] = reviewer_id
                grouped_data[task_id]['reviewer_name'] = reviewer_name
                
                # Add quality dimension
                if dimension_name:
                    grouped_data[task_id]['quality_dimensions'].append({
                        'name': dimension_name,
                        'score_text': score_text,
                        'score': score
                    })
        
        # Convert to list
        result = []
        for task_id, task_data in grouped_data.items():
            result.append({
                'task_id': task_data['task_id'],
                'annotator_id': task_data['annotator_id'],
                'annotator_name': task_data['annotator_name'],
                'reviewer_id': task_data['reviewer_id'],
                'reviewer_name': task_data['reviewer_name'],
                'quality_dimensions': task_data['quality_dimensions']
            })
        
        # Sort by task_id for consistency
        result.sort(key=lambda x: x['task_id'] if x['task_id'] is not None else 0)
        
        return result
    
    async def get_overall_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Get overall aggregated statistics
        
        Args:
            filters: Dictionary of filter key-value pairs
        
        Returns:
            Overall aggregation with quality dimension stats
        """
        base_query = self._build_review_detail_query(filters)
        
        # Combined query to get both quality dimensions and counts in one go
        query = base_query + """
        , quality_data AS (
            SELECT DISTINCT
                name,
                conversation_id,
                score_text,
                score
            FROM review_detail
            WHERE name IS NOT NULL
        ),
        count_data AS (
            SELECT 
                COUNT(DISTINCT reviewer_id) as reviewer_count,
                COUNT(DISTINCT human_role_id) as trainer_count
            FROM review_detail
        )
        SELECT 
            qd.name,
            qd.conversation_id,
            qd.score_text,
            qd.score,
            cd.reviewer_count,
            cd.trainer_count
        FROM quality_data qd
        CROSS JOIN count_data cd
        """
        
        query_job = self.client.query(query)
        results = [dict(row) for row in query_job.result()]
        
        # Extract counts from first row (they'll be the same for all rows)
        reviewer_count = results[0]['reviewer_count'] if results else 0
        trainer_count = results[0]['trainer_count'] if results else 0
        
        # Process quality dimension data (remove count fields for processing)
        clean_results = [
            {
                'name': row['name'],
                'conversation_id': row['conversation_id'],
                'score_text': row['score_text'],
                'score': row['score']
            }
            for row in results
        ]
        
        processed = self._process_aggregation_results(clean_results, None)
        
        # Return the first (and only) item for overall stats
        if processed:
            processed[0]['reviewer_count'] = reviewer_count
            processed[0]['trainer_count'] = trainer_count
            return processed[0]
        
        return {
            'conversation_count': 0,
            'reviewer_count': reviewer_count,
            'trainer_count': trainer_count,
            'quality_dimensions': []
        }


# Create a singleton instance
_bigquery_service: Optional[BigQueryService] = None


def get_bigquery_service() -> BigQueryService:
    """Get or create BigQuery service instance"""
    global _bigquery_service
    
    if _bigquery_service is None:
        _bigquery_service = BigQueryService()
    
    return _bigquery_service
