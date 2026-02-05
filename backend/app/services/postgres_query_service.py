"""
PostgreSQL query service for dashboard statistics
Queries the materialized review_detail table
"""
import logging
from typing import List, Dict, Any, Optional, Set
from collections import defaultdict
from sqlalchemy import func
from google.cloud import bigquery

from app.config import get_settings
from app.services.db_service import get_db_service
from app.models.db_models import ReviewDetail, Contributor, Task, WorkItem

logger = logging.getLogger(__name__)


class PostgresQueryService:
    """Service class for PostgreSQL query operations"""
    
    def __init__(self):
        """Initialize PostgreSQL query service"""
        self.settings = get_settings()
        self.db_service = get_db_service()
        self._allowed_quality_dimensions_cache: Optional[Set[str]] = None
    
    def _get_allowed_quality_dimensions(self, force_refresh: bool = False) -> Set[str]:
        """
        Fetch allowed quality dimensions for project_id 254 from BigQuery.
        Results are cached to avoid repeated queries.
        
        Args:
            force_refresh: If True, bypass cache and fetch fresh data
        
        Returns:
            Set of quality dimension names that are enabled for the project
        """
        if not force_refresh and self._allowed_quality_dimensions_cache is not None:
            return self._allowed_quality_dimensions_cache
        
        try:
            # Initialize BigQuery client
            client = bigquery.Client(project=self.settings.gcp_project_id)
            
            query = f"""
            SELECT DISTINCT name 
            FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.project_quality_dimension` 
            WHERE project_id = {self.settings.project_id_filter} AND is_enabled = 1
            """
            
            results = client.query(query).result()
            
            # Store in cache
            self._allowed_quality_dimensions_cache = {row.name for row in results if row.name}
            
            logger.info(f"Loaded {len(self._allowed_quality_dimensions_cache)} enabled quality dimensions for project {self.settings.project_id_filter}")
            
            return self._allowed_quality_dimensions_cache
            
        except Exception as e:
            logger.error(f"Error fetching allowed quality dimensions: {e}")
            # Return empty set on error to avoid breaking the application
            return set()
    
    def refresh_quality_dimensions_cache(self) -> None:
        """Force refresh the quality dimensions cache from BigQuery"""
        self._allowed_quality_dimensions_cache = None
        self._get_allowed_quality_dimensions(force_refresh=True)
    
    def _get_contributor_map(self) -> Dict[int, Dict[str, str]]:
        """Get contributor ID to name, email, and status mapping"""
        try:
            with self.db_service.get_session() as session:
                contributors = session.query(
                    Contributor.id, 
                    Contributor.name, 
                    Contributor.turing_email,
                    Contributor.status
                ).all()
                return {
                    c.id: {
                        'name': c.name,
                        'email': c.turing_email,
                        'status': c.status
                    } 
                    for c in contributors
                }
        except Exception as e:
            logger.error(f"Error getting contributor map: {e}")
            return {}
    
    def _format_name_with_status(self, name: str, status: str) -> str:
        """
        Format contributor name with status indicator if not active
        Args:
            name: Contributor name
            status: Contributor status
        Returns:
            Formatted name (e.g., "John Doe" or "John Doe (inactive)")
        """
        if not name:
            return 'Unknown'
        if not status or status.lower() == 'active':
            return name
        return f"{name} ({status.lower()})"
    
    def _process_aggregation_results(self, results: List[Any], group_key: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Process query results into structured aggregation format
        Matches the logic from bigquery_service._process_aggregation_results
        
        Args:
            results: Raw results from PostgreSQL
            group_key: The key to group by (domain, reviewer_id, human_role_id) or None for overall
            
        Returns:
            List of aggregated data
        """
        # Group results by the group_key
        grouped_data = defaultdict(lambda: defaultdict(lambda: {
            'name': None,
            'conversation_ids': set(),
            'scores': [],
            'task_scores': {},  # conversation_id -> task_score mapping
            'rework_counts': {}  # conversation_id -> rework_count mapping
        }))
        
        for row in results:
            # Determine group value
            if group_key:
                group_value = getattr(row, group_key, None)
                if group_value is None:
                    group_value = 'Unknown'
            else:
                group_value = 'overall'
            
            name = row.name
            # Filter for Pre-Delivery: Only process allowed quality dimensions for project 254
            allowed_dimensions = self._get_allowed_quality_dimensions()
            if name and name in allowed_dimensions:
                conversation_id = row.conversation_id
                score = row.score
                task_score = getattr(row, 'task_score', None)
                rework_count = getattr(row, 'rework_count', None)
                
                grouped_data[group_value][name]['name'] = name
                
                if conversation_id is not None:
                    grouped_data[group_value][name]['conversation_ids'].add(conversation_id)
                    # Store task_score per conversation_id
                    if task_score is not None:
                        grouped_data[group_value][name]['task_scores'][conversation_id] = task_score
                    # Store rework_count per conversation_id
                    if rework_count is not None:
                        grouped_data[group_value][name]['rework_counts'][conversation_id] = rework_count
                
                if score is not None:
                    grouped_data[group_value][name]['scores'].append(score)
        
        # Convert to final format
        result = []
        for group_value, dimensions in grouped_data.items():
            quality_dimensions = []
            all_conversation_ids = set()
            all_task_scores = {}  # conversation_id -> task_score mapping
            all_rework_counts = {}  # conversation_id -> rework_count mapping (deduplicated)
            
            for name, data in dimensions.items():
                avg_score = None
                if data['scores']:
                    avg_score = sum(data['scores']) / len(data['scores'])
                
                all_conversation_ids.update(data['conversation_ids'])
                # Collect all task scores for this group (deduplicated by conversation_id)
                all_task_scores.update(data['task_scores'])
                # Collect all rework counts for this group (deduplicated by conversation_id)
                all_rework_counts.update(data['rework_counts'])
                
                quality_dimensions.append({
                    'name': data['name'],
                    'average_score': round(avg_score, 2) if avg_score is not None else None,
                    'task_count': len(data['conversation_ids'])
                })
            
            # Sort by name for consistency
            quality_dimensions.sort(key=lambda x: x['name'])
            
            # Calculate average task score for this group (using deduplicated values)
            average_task_score = None
            if all_task_scores:
                task_score_values = list(all_task_scores.values())
                average_task_score = round(sum(task_score_values) / len(task_score_values), 2)
            
            # Calculate rework statistics (using deduplicated values)
            rework_count_values = list(all_rework_counts.values())
            total_rework_count = sum(rework_count_values) if rework_count_values else 0
            average_rework_count = round(sum(rework_count_values) / len(rework_count_values), 2) if rework_count_values else 0
            
            item = {
                'task_count': len(all_conversation_ids),
                'average_task_score': average_task_score,
                'total_rework_count': total_rework_count,
                'average_rework_count': average_rework_count,
                'quality_dimensions': quality_dimensions
            }
            
            if group_key:
                item[group_key] = group_value
            
            result.append(item)
        
        return result
    
    def _process_client_delivery_aggregation(self, results, group_key=None):
        """
        Process aggregation results for client delivery (counts based on work_item.task_id)
        
        Args:
            results: Query results with domain/name/score/task_score/task_id/rework_count fields
            group_key: Key to group by (e.g., 'domain', 'human_role_id', 'reviewer_id')
            
        Returns:
            List of aggregated data
        """
        # Group results by the group_key
        grouped_data = defaultdict(lambda: defaultdict(lambda: {
            'name': None,
            'task_ids': set(),  # Changed from conversation_ids to task_ids
            'scores': [],
            'task_scores': {},  # task_id -> task_score mapping
            'rework_counts': {}  # task_id -> rework_count mapping
        }))
        
        for row in results:
            # Determine group value
            if group_key:
                group_value = getattr(row, group_key, None)
                if group_value is None:
                    group_value = 'Unknown'
            else:
                group_value = 'overall'
            
            name = row.name
            # Filter for Post-Delivery: Only process allowed quality dimensions for project 254
            allowed_dimensions = self._get_allowed_quality_dimensions()
            if name and name in allowed_dimensions:
                task_id = row.task_id  # Use work_item.task_id
                score = row.score
                task_score = getattr(row, 'task_score', None)
                rework_count = getattr(row, 'rework_count', None)
                
                grouped_data[group_value][name]['name'] = name
                
                if task_id is not None:
                    grouped_data[group_value][name]['task_ids'].add(task_id)
                    # Store task_score per task_id
                    if task_score is not None:
                        grouped_data[group_value][name]['task_scores'][task_id] = task_score
                    # Store rework_count per task_id (deduplicated by task_id)
                    if rework_count is not None:
                        grouped_data[group_value][name]['rework_counts'][task_id] = rework_count
                
                if score is not None:
                    grouped_data[group_value][name]['scores'].append(score)
        
        # Convert to final format
        result = []
        for group_value, dimensions in grouped_data.items():
            quality_dimensions = []
            all_task_ids = set()
            all_task_scores = {}  # Deduplicated by task_id
            all_rework_counts = {}  # Deduplicated by task_id
            
            for name, data in dimensions.items():
                avg_score = None
                if data['scores']:
                    avg_score = sum(data['scores']) / len(data['scores'])
                
                all_task_ids.update(data['task_ids'])
                # Collect all task scores for this group (deduplicated)
                all_task_scores.update(data['task_scores'])
                # Collect all rework counts for this group (deduplicated)
                all_rework_counts.update(data['rework_counts'])
                
                quality_dimensions.append({
                    'name': data['name'],
                    'average_score': round(avg_score, 2) if avg_score is not None else None,
                    'task_count': len(data['task_ids'])  # Count distinct task_ids
                })
            
            # Sort by name for consistency
            quality_dimensions.sort(key=lambda x: x['name'])
            
            # Calculate average task score for this group (using deduplicated values)
            average_task_score = None
            if all_task_scores:
                task_score_values = list(all_task_scores.values())
                average_task_score = round(sum(task_score_values) / len(task_score_values), 2)
            
            # Calculate rework statistics (using deduplicated values)
            rework_count_values = list(all_rework_counts.values())
            total_rework_count = sum(rework_count_values) if rework_count_values else 0
            average_rework_count = round(sum(rework_count_values) / len(rework_count_values), 2) if rework_count_values else 0
            
            item = {
                'task_count': len(all_task_ids),  # Count distinct task_ids
                'average_task_score': average_task_score,
                'total_rework_count': total_rework_count,
                'average_rework_count': average_rework_count,
                'quality_dimensions': quality_dimensions
            }
            
            if group_key:
                item[group_key] = group_value
            
            result.append(item)
        
        return result
    
    def get_overall_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Get overall aggregation statistics"""
        try:
            with self.db_service.get_session() as session:
                # Get all review_detail records where is_delivered = 'False' (Pre-Delivery only)
                # Join with Task to get rework_count
                query = session.query(ReviewDetail, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                # Apply filters if provided
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                    if filters.get('quality_dimension'):
                        query = query.filter(ReviewDetail.name == filters['quality_dimension'])
                    if filters.get('min_score') is not None:
                        query = query.filter(ReviewDetail.score >= filters['min_score'])
                    if filters.get('max_score') is not None:
                        query = query.filter(ReviewDetail.score <= filters['max_score'])
                
                results = query.all()
                
                # Convert results to include rework_count as attribute
                processed_results = []
                for review_detail, rework_count in results:
                    review_detail.rework_count = rework_count
                    processed_results.append(review_detail)
                
                # Process aggregation
                aggregated = self._process_aggregation_results(processed_results, group_key=None)
                
                if not aggregated:
                    return {
                        'task_count': 0,
                        'reviewer_count': 0,
                        'trainer_count': 0,
                        'domain_count': 0,
                        'delivered_tasks': 0,
                        'delivered_files': 0,
                        'work_items_count': 0,
                        'quality_dimensions': []
                    }
                
                # Calculate unique counts
                unique_reviewers = set()
                unique_trainers = set()
                unique_domains = set()
                
                for review_detail, rework_count in results:
                    if review_detail.reviewer_id:
                        unique_reviewers.add(review_detail.reviewer_id)
                    if review_detail.human_role_id:
                        unique_trainers.add(review_detail.human_role_id)
                    if review_detail.domain:
                        unique_domains.add(review_detail.domain)
                
                # Import func and distinct for counting queries
                from app.models.db_models import WorkItem
                
                # Get the actual task count from Task table (not ReviewDetail) for pre-delivery
                # This gives us the correct count of unique tasks that haven't been delivered yet
                task_count_query = session.query(func.count(func.distinct(Task.id))).filter(
                    Task.is_delivered == 'False'
                )
                # Apply filters if provided
                if filters:
                    if filters.get('domain'):
                        task_count_query = task_count_query.filter(Task.domain == filters['domain'])
                    if filters.get('trainer'):
                        task_count_query = task_count_query.filter(Task.current_user_id == int(filters['trainer']))
                
                actual_task_count = task_count_query.scalar() or 0
                
                # Get work_item stats (delivered tasks and files)
                
                delivered_tasks = session.query(func.count(func.distinct(WorkItem.task_id))).filter(
                    WorkItem.task_id.isnot(None)
                ).scalar() or 0
                delivered_files = session.query(func.count(func.distinct(WorkItem.json_filename))).filter(
                    WorkItem.json_filename.isnot(None)
                ).scalar() or 0
                work_items_count = session.query(func.count(func.distinct(WorkItem.work_item_id))).scalar() or 0
                
                overall_data = aggregated[0]
                # Use the actual task count from Task table instead of from ReviewDetail
                overall_data['task_count'] = actual_task_count
                overall_data['reviewer_count'] = len(unique_reviewers)
                overall_data['trainer_count'] = len(unique_trainers)
                overall_data['domain_count'] = len(unique_domains)
                overall_data['delivered_tasks'] = delivered_tasks
                overall_data['delivered_files'] = delivered_files
                overall_data['work_items_count'] = work_items_count
                
                return overall_data
        except Exception as e:
            logger.error(f"Error getting overall aggregation: {e}")
            raise
    
    def get_domain_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get domain-wise aggregation statistics"""
        try:
            with self.db_service.get_session() as session:
                # Get all review_detail records where is_delivered = 'False' (Pre-Delivery only)
                # Join with Task to get rework_count
                query = session.query(ReviewDetail, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                # Apply filters if provided
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                    if filters.get('quality_dimension'):
                        query = query.filter(ReviewDetail.name == filters['quality_dimension'])
                    if filters.get('min_score') is not None:
                        query = query.filter(ReviewDetail.score >= filters['min_score'])
                    if filters.get('max_score') is not None:
                        query = query.filter(ReviewDetail.score <= filters['max_score'])
                
                results = query.all()
                
                # Convert results to include rework_count as attribute
                processed_results = []
                for review_detail, rework_count in results:
                    review_detail.rework_count = rework_count
                    processed_results.append(review_detail)
                
                # Process aggregation by domain
                aggregated = self._process_aggregation_results(processed_results, group_key='domain')
                
                # Format for API response
                for item in aggregated:
                    domain_val = item.pop('domain', 'Unknown')
                    item['domain'] = domain_val if domain_val is not None else 'Unknown'
                
                # Sort by domain name (handle None values)
                aggregated.sort(key=lambda x: x.get('domain') or '')
                
                return aggregated
        except Exception as e:
            logger.error(f"Error getting domain aggregation: {e}")
            raise
    
    def get_trainer_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get trainer-wise aggregation statistics"""
        try:
            # Get contributor map for names
            contributor_map = self._get_contributor_map()
            
            with self.db_service.get_session() as session:
                # Get all review_detail records where is_delivered = 'False' (Pre-Delivery only)
                # Join with Task to get rework_count
                query = session.query(ReviewDetail, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                # Apply filters if provided
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                    if filters.get('quality_dimension'):
                        query = query.filter(ReviewDetail.name == filters['quality_dimension'])
                    if filters.get('min_score') is not None:
                        query = query.filter(ReviewDetail.score >= filters['min_score'])
                    if filters.get('max_score') is not None:
                        query = query.filter(ReviewDetail.score <= filters['max_score'])
                
                results = query.all()
                
                # Convert results to include rework_count as attribute
                processed_results = []
                for review_detail, rework_count in results:
                    review_detail.rework_count = rework_count
                    processed_results.append(review_detail)
                
                # Process aggregation by trainer
                aggregated = self._process_aggregation_results(processed_results, group_key='human_role_id')
                
                # Format for API response
                for item in aggregated:
                    trainer_id = item.pop('human_role_id', None)
                    item['trainer_id'] = trainer_id
                    contributor_info = contributor_map.get(trainer_id, {})
                    name = contributor_info.get('name', 'Unknown') if trainer_id else 'Unknown'
                    status = contributor_info.get('status', None)
                    item['trainer_name'] = self._format_name_with_status(name, status) if trainer_id else 'Unknown'
                    item['trainer_email'] = contributor_info.get('email', None) if trainer_id else None
                
                # Sort by trainer name
                aggregated.sort(key=lambda x: x.get('trainer_name', ''))
                
                return aggregated
        except Exception as e:
            logger.error(f"Error getting trainer aggregation: {e}")
            raise
    
    def get_reviewer_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get reviewer-wise aggregation statistics"""
        try:
            # Get contributor map for names
            contributor_map = self._get_contributor_map()
            
            with self.db_service.get_session() as session:
                # Get all review_detail records where is_delivered = 'False' (Pre-Delivery only)
                # Join with Task to get rework_count
                query = session.query(ReviewDetail, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                # Apply filters if provided
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                    if filters.get('quality_dimension'):
                        query = query.filter(ReviewDetail.name == filters['quality_dimension'])
                    if filters.get('min_score') is not None:
                        query = query.filter(ReviewDetail.score >= filters['min_score'])
                    if filters.get('max_score') is not None:
                        query = query.filter(ReviewDetail.score <= filters['max_score'])
                
                results = query.all()
                
                # Convert results to include rework_count as attribute
                processed_results = []
                for review_detail, rework_count in results:
                    review_detail.rework_count = rework_count
                    processed_results.append(review_detail)
                
                # Process aggregation by reviewer
                aggregated = self._process_aggregation_results(processed_results, group_key='reviewer_id')
                
                # Format for API response
                for item in aggregated:
                    reviewer_id = item.pop('reviewer_id', None)
                    item['reviewer_id'] = reviewer_id
                    contributor_info = contributor_map.get(reviewer_id, {})
                    name = contributor_info.get('name', 'Unknown') if reviewer_id else 'Unknown'
                    status = contributor_info.get('status', None)
                    item['reviewer_name'] = self._format_name_with_status(name, status) if reviewer_id else 'Unknown'
                    item['reviewer_email'] = contributor_info.get('email', None) if reviewer_id else None
                
                # Sort by reviewer name
                aggregated.sort(key=lambda x: x.get('reviewer_name', ''))
                
                return aggregated
        except Exception as e:
            logger.error(f"Error getting reviewer aggregation: {e}")
            raise
    
    def get_reviewers_with_trainers(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get reviewers with their trainers nested"""
        try:
            # Get contributor map for names
            contributor_map = self._get_contributor_map()
            
            with self.db_service.get_session() as session:
                # Get all review_detail records where is_delivered = 'False' (Pre-Delivery only)
                # Join with Task to get rework_count
                query = session.query(ReviewDetail, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                # Apply filters if provided
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                
                results = query.all()
                
                # Group by reviewer_id first, then by trainer (human_role_id) within each reviewer
                from collections import defaultdict
                
                reviewer_data = defaultdict(lambda: {
                    'trainers': defaultdict(lambda: {
                        'conversation_ids': set(),
                        'scores': [],
                        'task_scores': {},
                        'rework_counts': {},
                        'quality_dimensions': defaultdict(list)
                    }),
                    'conversation_ids': set(),
                    'scores': [],
                    'task_scores': {},
                    'rework_counts': {},
                    'quality_dimensions': defaultdict(list)
                })
                
                allowed_dimensions = self._get_allowed_quality_dimensions()
                
                for review_detail, rework_count in results:
                    reviewer_id = review_detail.reviewer_id
                    trainer_id = review_detail.human_role_id
                    name = review_detail.name
                    conversation_id = review_detail.conversation_id
                    score = review_detail.score
                    task_score = review_detail.task_score
                    
                    if name and name in allowed_dimensions:
                        # Aggregate at reviewer level
                        reviewer_data[reviewer_id]['conversation_ids'].add(conversation_id)
                        if score is not None:
                            reviewer_data[reviewer_id]['scores'].append(score)
                            reviewer_data[reviewer_id]['quality_dimensions'][name].append(score)
                        if task_score is not None:
                            reviewer_data[reviewer_id]['task_scores'][conversation_id] = task_score
                        if rework_count is not None:
                            reviewer_data[reviewer_id]['rework_counts'][conversation_id] = rework_count
                        
                        # Aggregate at trainer level within reviewer
                        trainer_data = reviewer_data[reviewer_id]['trainers'][trainer_id]
                        trainer_data['conversation_ids'].add(conversation_id)
                        if score is not None:
                            trainer_data['scores'].append(score)
                            trainer_data['quality_dimensions'][name].append(score)
                        if task_score is not None:
                            trainer_data['task_scores'][conversation_id] = task_score
                        if rework_count is not None:
                            trainer_data['rework_counts'][conversation_id] = rework_count
                
                # Build the result
                result = []
                for reviewer_id, data in reviewer_data.items():
                    contributor_info = contributor_map.get(reviewer_id, {})
                    name = contributor_info.get('name', 'Unknown')
                    status = contributor_info.get('status', None)
                    
                    # Calculate reviewer stats
                    task_scores = list(data['task_scores'].values())
                    avg_task_score = round(sum(task_scores) / len(task_scores), 2) if task_scores else None
                    rework_counts = list(data['rework_counts'].values())
                    total_rework = sum(rework_counts)
                    avg_rework = round(total_rework / len(rework_counts), 2) if rework_counts else 0
                    
                    # Build quality dimensions for reviewer
                    quality_dimensions = []
                    for dim_name, scores in data['quality_dimensions'].items():
                        if scores:
                            quality_dimensions.append({
                                'name': dim_name,
                                'average_score': round(sum(scores) / len(scores), 2),
                                'task_count': len(set([cid for cid in data['conversation_ids']]))
                            })
                    quality_dimensions.sort(key=lambda x: x['name'])
                    
                    # Build trainers list
                    trainers = []
                    for trainer_id, trainer_data in data['trainers'].items():
                        trainer_info = contributor_map.get(trainer_id, {})
                        trainer_name = trainer_info.get('name', 'Unknown')
                        trainer_status = trainer_info.get('status', None)
                        
                        trainer_task_scores = list(trainer_data['task_scores'].values())
                        trainer_avg_task_score = round(sum(trainer_task_scores) / len(trainer_task_scores), 2) if trainer_task_scores else None
                        trainer_rework_counts = list(trainer_data['rework_counts'].values())
                        trainer_total_rework = sum(trainer_rework_counts)
                        trainer_avg_rework = round(trainer_total_rework / len(trainer_rework_counts), 2) if trainer_rework_counts else 0
                        
                        # Build quality dimensions for trainer
                        trainer_quality_dimensions = []
                        for dim_name, scores in trainer_data['quality_dimensions'].items():
                            if scores:
                                trainer_quality_dimensions.append({
                                    'name': dim_name,
                                    'average_score': round(sum(scores) / len(scores), 2),
                                    'task_count': len(trainer_data['conversation_ids'])
                                })
                        trainer_quality_dimensions.sort(key=lambda x: x['name'])
                        
                        trainers.append({
                            'trainer_id': trainer_id,
                            'trainer_name': self._format_name_with_status(trainer_name, trainer_status),
                            'trainer_email': trainer_info.get('email'),
                            'task_count': len(trainer_data['conversation_ids']),
                            'average_task_score': trainer_avg_task_score,
                            'total_rework_count': trainer_total_rework,
                            'average_rework_count': trainer_avg_rework,
                            'quality_dimensions': trainer_quality_dimensions
                        })
                    
                    # Sort trainers by name
                    trainers.sort(key=lambda x: x.get('trainer_name') or '')
                    
                    result.append({
                        'reviewer_id': reviewer_id,
                        'reviewer_name': self._format_name_with_status(name, status),
                        'reviewer_email': contributor_info.get('email'),
                        'task_count': len(data['conversation_ids']),
                        'average_task_score': avg_task_score,
                        'total_rework_count': total_rework,
                        'average_rework_count': avg_rework,
                        'quality_dimensions': quality_dimensions,
                        'trainers': trainers
                    })
                
                # Sort by reviewer name
                result.sort(key=lambda x: x.get('reviewer_name') or '')
                
                return result
        except Exception as e:
            logger.error(f"Error getting reviewers with trainers: {e}")
            raise
    
    def get_task_level_data(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get task-level data with all quality dimensions"""
        try:
            # Get contributor map for names
            contributor_map = self._get_contributor_map()
            
            with self.db_service.get_session() as session:
                # Get all review_detail records where is_delivered = 'False' (Pre-Delivery only)
                # with colab_link, week_number, and rework_count from task table
                query = session.query(ReviewDetail, Task.colab_link, Task.week_number, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                # Apply filters if provided
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                    if filters.get('quality_dimension'):
                        query = query.filter(ReviewDetail.name == filters['quality_dimension'])
                    if filters.get('min_score') is not None:
                        query = query.filter(ReviewDetail.score >= filters['min_score'])
                    if filters.get('max_score') is not None:
                        query = query.filter(ReviewDetail.score <= filters['max_score'])
                    # Date range filtering
                    if filters.get('date_from'):
                        from datetime import datetime
                        date_from = filters['date_from']
                        if isinstance(date_from, str):
                            date_from = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
                        query = query.filter(ReviewDetail.updated_at >= date_from)
                    if filters.get('date_to'):
                        from datetime import datetime, timedelta
                        date_to = filters['date_to']
                        if isinstance(date_to, str):
                            date_to = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
                        # Include the entire end date
                        date_to = date_to + timedelta(days=1)
                        query = query.filter(ReviewDetail.updated_at < date_to)
                
                results = query.all()
                
                # Group by task (conversation_id)
                task_data = defaultdict(lambda: {
                    'task_id': None,
                    'task_score': None,
                    'annotator_id': None,
                    'annotator_name': None,
                    'annotator_email': None,
                    'reviewer_id': None,
                    'reviewer_name': None,
                    'reviewer_email': None,
                    'colab_link': None,
                    'updated_at': None,
                    'week_number': None,
                    'rework_count': None,
                    'quality_dimensions': {}
                })
                
                for row, colab_link, week_number, rework_count in results:
                    task_id = row.conversation_id
                    if not task_id:
                        continue
                    
                    if task_data[task_id]['task_id'] is None:
                        task_data[task_id]['task_id'] = task_id
                        task_data[task_id]['task_score'] = round(float(row.task_score), 2) if row.task_score is not None else None
                        task_data[task_id]['annotator_id'] = row.human_role_id
                        
                        # Get annotator info from contributor map
                        annotator_info = contributor_map.get(row.human_role_id, {})
                        annotator_name = annotator_info.get('name', 'Unknown') if row.human_role_id else 'Unknown'
                        annotator_status = annotator_info.get('status', None)
                        task_data[task_id]['annotator_name'] = self._format_name_with_status(annotator_name, annotator_status) if row.human_role_id else 'Unknown'
                        task_data[task_id]['annotator_email'] = annotator_info.get('email', None) if row.human_role_id else None
                        
                        task_data[task_id]['reviewer_id'] = row.reviewer_id
                        
                        # Get reviewer info from contributor map
                        reviewer_info = contributor_map.get(row.reviewer_id, {})
                        reviewer_name = reviewer_info.get('name', 'Unknown') if row.reviewer_id else None
                        reviewer_status = reviewer_info.get('status', None)
                        task_data[task_id]['reviewer_name'] = self._format_name_with_status(reviewer_name, reviewer_status) if row.reviewer_id else None
                        task_data[task_id]['reviewer_email'] = reviewer_info.get('email', None) if row.reviewer_id else None
                        
                        task_data[task_id]['colab_link'] = colab_link
                        task_data[task_id]['updated_at'] = row.updated_at.isoformat() if row.updated_at else None
                        task_data[task_id]['week_number'] = week_number
                        task_data[task_id]['rework_count'] = rework_count
                    
                    # Add quality dimension scores
                    if row.name and row.score is not None:
                        task_data[task_id]['quality_dimensions'][row.name] = round(float(row.score), 2)
                
                # Convert to list
                result = list(task_data.values())
                
                # Sort by task_id
                result.sort(key=lambda x: x['task_id'])
                
                return result
        except Exception as e:
            logger.error(f"Error getting task level data: {e}")
            raise
    
    def get_client_delivery_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Get overall aggregation statistics for client delivery (delivered tasks only)
        Count directly from WorkItem table to include ALL delivered work items"""
        try:
            with self.db_service.get_session() as session:
                from app.models.db_models import TaskReviewedInfo
                
                # Count distinct task_ids directly from WorkItem (no JOIN with Task)
                # This ensures we count ALL delivered work items
                task_count = session.query(
                    func.count(func.distinct(WorkItem.task_id))
                ).filter(
                    WorkItem.task_id.isnot(None)
                ).scalar() or 0
                
                # Count distinct work_item_ids
                work_items_count = session.query(
                    func.count(func.distinct(WorkItem.work_item_id))
                ).scalar() or 0
                
                # For other stats, we need to join with Task table
                # Get distinct work_item task_ids with domain, trainer info, and rework_count
                task_query = session.query(
                    WorkItem.task_id,
                    Task.domain,
                    Task.current_user_id,
                    TaskReviewedInfo.task_score,
                    Task.rework_count
                ).select_from(WorkItem).join(
                    Task, WorkItem.colab_link == Task.colab_link
                ).outerjoin(
                    TaskReviewedInfo, Task.id == TaskReviewedInfo.r_id
                ).filter(
                    Task.is_delivered == 'True'
                ).distinct(WorkItem.task_id)
                
                # Apply filters if provided
                if filters:
                    if filters.get('domain'):
                        task_query = task_query.filter(Task.domain == filters['domain'])
                
                task_results = task_query.all()
                
                if not task_results:
                    return {
                        'task_count': task_count,
                        'work_items_count': work_items_count,
                        'reviewer_count': 0,
                        'trainer_count': 0,
                        'domain_count': 0,
                        'quality_dimensions_count': 0
                    }
                
                # Get unique reviewer count from review_detail
                reviewer_query = session.query(
                    func.count(func.distinct(ReviewDetail.reviewer_id))
                ).select_from(WorkItem).join(
                    Task, WorkItem.colab_link == Task.colab_link
                ).join(
                    ReviewDetail, Task.id == ReviewDetail.conversation_id
                ).filter(
                    Task.is_delivered == 'True'
                )
                
                if filters and filters.get('domain'):
                    reviewer_query = reviewer_query.filter(Task.domain == filters['domain'])
                
                reviewer_count = reviewer_query.scalar() or 0
                
                # Calculate statistics based on distinct work_item task_ids
                unique_domains = set()
                unique_trainers = set()
                task_scores = []
                rework_counts = []
                
                for row in task_results:
                    if row.domain:
                        unique_domains.add(row.domain)
                    if row.current_user_id:
                        unique_trainers.add(row.current_user_id)
                    if row.task_score is not None:
                        task_scores.append(float(row.task_score))
                    if row.rework_count is not None:
                        rework_counts.append(int(row.rework_count))
                
                avg_score = sum(task_scores) / len(task_scores) if task_scores else 0
                total_rework_count = sum(rework_counts) if rework_counts else 0
                average_rework_count = round(sum(rework_counts) / len(rework_counts), 2) if rework_counts else 0
                
                # Get quality dimensions count from review_detail
                # Join with work_item to ensure we only count QDs for delivered work items
                qd_query = session.query(
                    ReviewDetail.name
                ).select_from(ReviewDetail).join(
                    Task, ReviewDetail.conversation_id == Task.id
                ).join(
                    WorkItem, Task.colab_link == WorkItem.colab_link
                ).filter(
                    ReviewDetail.is_delivered == 'True'
                ).distinct()
                
                if filters and filters.get('domain'):
                    qd_query = qd_query.filter(ReviewDetail.domain == filters['domain'])
                
                # Get distinct names and count them (filtered by allowed dimensions)
                distinct_qd_names = qd_query.all()
                allowed_dimensions = self._get_allowed_quality_dimensions()
                # Filter to only count allowed quality dimensions
                filtered_qd_names = [row.name for row in distinct_qd_names if row.name in allowed_dimensions]
                quality_dimensions_count = len(filtered_qd_names)
                
                return {
                    'task_count': task_count,  # Count of distinct work_item.task_id (from WorkItem table directly)
                    'work_items_count': work_items_count,  # Count of distinct work_item_id
                    'reviewer_count': reviewer_count,
                    'trainer_count': len(unique_trainers),
                    'domain_count': len(unique_domains),
                    'quality_dimensions_count': quality_dimensions_count,
                    'total_rework_count': total_rework_count,
                    'average_rework_count': average_rework_count
                }
        except Exception as e:
            logger.error(f"Error getting client delivery aggregation: {e}")
            raise
    
    def get_client_delivery_domain_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get domain-wise aggregation for client delivery (delivered tasks only)
        Task count based on distinct work_item.task_id"""
        try:
            with self.db_service.get_session() as session:
                # Get review_detail joined with work_item to get task_id and rework_count
                query = session.query(
                    ReviewDetail.domain,
                    ReviewDetail.name,
                    ReviewDetail.score,
                    ReviewDetail.task_score,
                    WorkItem.task_id,
                    Task.rework_count
                ).select_from(ReviewDetail).join(
                    Task, ReviewDetail.conversation_id == Task.id
                ).join(
                    WorkItem, Task.colab_link == WorkItem.colab_link
                ).filter(
                    ReviewDetail.is_delivered == 'True'
                )
                
                # Apply filters if provided
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                    if filters.get('quality_dimension'):
                        query = query.filter(ReviewDetail.name == filters['quality_dimension'])
                    if filters.get('min_score') is not None:
                        query = query.filter(ReviewDetail.score >= filters['min_score'])
                    if filters.get('max_score') is not None:
                        query = query.filter(ReviewDetail.score <= filters['max_score'])
                
                results = query.all()
                
                # Process aggregation by domain with work_item task_id
                aggregated = self._process_client_delivery_aggregation(results, group_key='domain')
                
                # Add domain key to each item
                for item in aggregated:
                    domain = item.get('domain', 'Unknown')
                    item['domain'] = domain if domain else 'Unknown'
                
                return aggregated
        except Exception as e:
            logger.error(f"Error getting client delivery domain aggregation: {e}")
            raise
    
    def get_client_delivery_trainer_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get trainer-wise aggregation for client delivery (delivered tasks only)
        Task count based on distinct work_item.task_id"""
        try:
            contributor_map = self._get_contributor_map()
            
            with self.db_service.get_session() as session:
                # Get review_detail joined with work_item to get task_id and rework_count
                query = session.query(
                    ReviewDetail.human_role_id,
                    ReviewDetail.name,
                    ReviewDetail.score,
                    ReviewDetail.task_score,
                    WorkItem.task_id,
                    Task.rework_count
                ).select_from(ReviewDetail).join(
                    Task, ReviewDetail.conversation_id == Task.id
                ).join(
                    WorkItem, Task.colab_link == WorkItem.colab_link
                ).filter(
                    ReviewDetail.is_delivered == 'True'
                )
                
                # Apply filters if provided
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                    if filters.get('quality_dimension'):
                        query = query.filter(ReviewDetail.name == filters['quality_dimension'])
                    if filters.get('min_score') is not None:
                        query = query.filter(ReviewDetail.score >= filters['min_score'])
                    if filters.get('max_score') is not None:
                        query = query.filter(ReviewDetail.score <= filters['max_score'])
                
                results = query.all()
                
                # Process aggregation by trainer with work_item task_id
                aggregated = self._process_client_delivery_aggregation(results, group_key='human_role_id')
                
                # Format for API response
                for item in aggregated:
                    trainer_id = item.get('human_role_id')
                    contributor_info = contributor_map.get(trainer_id, {})
                    name = contributor_info.get('name', 'Unknown') if trainer_id else 'Unknown'
                    status = contributor_info.get('status', None)
                    email = contributor_info.get('email', None) if trainer_id else None
                    
                    item['trainer_id'] = trainer_id
                    item['trainer_name'] = self._format_name_with_status(name, status) if trainer_id else 'Unknown'
                    item['trainer_email'] = email
                    del item['human_role_id']
                
                return aggregated
        except Exception as e:
            logger.error(f"Error getting client delivery trainer aggregation: {e}")
            raise
    
    def get_client_delivery_reviewer_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get reviewer-wise aggregation for client delivery (delivered tasks only)
        Task count based on distinct work_item.task_id"""
        try:
            contributor_map = self._get_contributor_map()
            
            with self.db_service.get_session() as session:
                # Get review_detail joined with work_item to get task_id and rework_count
                query = session.query(
                    ReviewDetail.reviewer_id,
                    ReviewDetail.name,
                    ReviewDetail.score,
                    ReviewDetail.task_score,
                    WorkItem.task_id,
                    Task.rework_count
                ).select_from(ReviewDetail).join(
                    Task, ReviewDetail.conversation_id == Task.id
                ).join(
                    WorkItem, Task.colab_link == WorkItem.colab_link
                ).filter(
                    ReviewDetail.is_delivered == 'True'
                )
                
                # Apply filters if provided
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                    if filters.get('quality_dimension'):
                        query = query.filter(ReviewDetail.name == filters['quality_dimension'])
                    if filters.get('min_score') is not None:
                        query = query.filter(ReviewDetail.score >= filters['min_score'])
                    if filters.get('max_score') is not None:
                        query = query.filter(ReviewDetail.score <= filters['max_score'])
                
                results = query.all()
                
                # Process aggregation by reviewer with work_item task_id
                aggregated = self._process_client_delivery_aggregation(results, group_key='reviewer_id')
                
                # Format for API response
                for item in aggregated:
                    reviewer_id = item.get('reviewer_id')
                    contributor_info = contributor_map.get(reviewer_id, {})
                    name = contributor_info.get('name', 'Unknown') if reviewer_id else 'Unknown'
                    status = contributor_info.get('status', None)
                    email = contributor_info.get('email', None) if reviewer_id else None
                    
                    item['reviewer_name'] = self._format_name_with_status(name, status) if reviewer_id else 'Unknown'
                    item['reviewer_email'] = email
                
                return aggregated
        except Exception as e:
            logger.error(f"Error getting client delivery reviewer aggregation: {e}")
            raise
    
    def get_delivery_tracker(self) -> List[Dict[str, Any]]:
        """
        Get delivery tracker information grouped by delivery date
        Returns list of deliveries with date, task count, and file names
        """
        try:
            with self.db_service.get_session() as session:
                # Query work_item table grouped by delivery_date
                results = session.query(
                    func.date(WorkItem.delivery_date).label('delivery_date'),
                    func.count(WorkItem.task_id).label('total_tasks'),
                    func.array_agg(func.distinct(WorkItem.json_filename)).label('file_names')
                ).filter(
                    WorkItem.delivery_date.isnot(None)
                ).group_by(
                    func.date(WorkItem.delivery_date)
                ).order_by(
                    func.date(WorkItem.delivery_date).desc()
                ).all()
                
                # Format results
                tracker_data = []
                for row in results:
                    # Filter out None values from file_names array
                    file_names = [f for f in (row.file_names or []) if f is not None]
                    
                    tracker_data.append({
                        'delivery_date': row.delivery_date.strftime('%Y-%m-%d') if row.delivery_date else None,
                        'total_tasks': row.total_tasks or 0,
                        'file_names': file_names,
                        'file_count': len(file_names)
                    })
                
                return tracker_data
        except Exception as e:
            logger.error(f"Error getting delivery tracker: {e}")
            raise

    def get_client_delivery_task_wise(self) -> List[Dict[str, Any]]:
        """
        Get task-wise client delivery information
        Returns list grouped by task_id with all work_items for each task
        """
        try:
            with self.db_service.get_session() as session:
                from sqlalchemy import func
                
                # Get all work items with their task details
                # Note: Shows ALL work items regardless of task delivery status
                results = session.query(
                    WorkItem.work_item_id,
                    WorkItem.task_id.label('workitem_task_id'),  # Original task_id from work_item
                    WorkItem.delivery_date,
                    Task.id.label('labelling_task_id'),  # Task.id is the conversation/task ID
                    WorkItem.json_filename,
                    ReviewDetail.task_score,
                    Task.rework_count,
                    WorkItem.turing_status,
                    WorkItem.client_status,
                    WorkItem.task_level_feedback,
                    WorkItem.error_categories
                ).outerjoin(
                    Task,
                    WorkItem.colab_link == Task.colab_link
                ).outerjoin(
                    ReviewDetail,
                    Task.id == ReviewDetail.conversation_id
                ).distinct().all()

                # Group by labelling_task_id (use work_item_id as fallback if no task match)
                task_groups = {}
                for row in results:
                    # Use labelling_task_id if available, otherwise use work_item_id as unique identifier
                    labelling_task_id = row.labelling_task_id if row.labelling_task_id else f"wi_{row.work_item_id}"
                    
                    if labelling_task_id not in task_groups:
                        task_groups[labelling_task_id] = {
                            'task_id': row.labelling_task_id if row.labelling_task_id else row.workitem_task_id or row.work_item_id,  # Use best available ID
                            'task_score': float(row.task_score) if row.task_score is not None else None,
                            'rework_count': int(row.rework_count) if row.rework_count is not None else 0,
                            'work_items': []
                        }
                    
                    # Add work item to this task's list
                    task_groups[labelling_task_id]['work_items'].append({
                        'work_item_id': row.work_item_id,
                        'task_id': row.workitem_task_id,  # Original task_id from work_item table
                        'delivery_date': row.delivery_date.strftime('%Y-%m-%d') if row.delivery_date else None,
                        'json_filename': row.json_filename,
                        'turing_status': row.turing_status,
                        'client_status': row.client_status or 'Pending',
                        'task_level_feedback': row.task_level_feedback,
                        'error_categories': row.error_categories
                    })
                
                # Calculate aggregated status for each task
                task_data = []
                for task_id, task_info in task_groups.items():
                    work_items = task_info['work_items']
                    
                    # Determine overall turing_status (if any is Rework, show Rework)
                    turing_statuses = [wi['turing_status'] for wi in work_items]
                    overall_turing_status = 'Rework' if 'Rework' in turing_statuses else 'Delivered'
                    
                    # Get most recent delivery date and its client_status
                    work_items_with_dates = [wi for wi in work_items if wi['delivery_date']]
                    if work_items_with_dates:
                        # Sort by delivery_date to get the latest
                        latest_work_item = max(work_items_with_dates, key=lambda x: x['delivery_date'])
                        latest_delivery_date = latest_work_item['delivery_date']
                        overall_client_status = latest_work_item['client_status']
                    else:
                        latest_delivery_date = None
                        overall_client_status = 'Pending'
                    
                    task_data.append({
                        'task_id': task_info['task_id'],  # Use the actual task_id from task_info
                        'task_score': task_info['task_score'],
                        'rework_count': task_info['rework_count'],
                        'delivery_date': latest_delivery_date,
                        'work_item_count': len(work_items),
                        'turing_status': overall_turing_status,
                        'client_status': overall_client_status,
                        'work_items': work_items  # All work items for this task
                    })

                return task_data
        except Exception as e:
            logger.error(f"Error getting client delivery task-wise data: {e}")
            raise


# Global PostgreSQL query service instance
_postgres_query_service = None


def get_postgres_query_service() -> PostgresQueryService:
    """Get or create the global PostgreSQL query service instance"""
    global _postgres_query_service
    if _postgres_query_service is None:
        _postgres_query_service = PostgresQueryService()
    return _postgres_query_service
