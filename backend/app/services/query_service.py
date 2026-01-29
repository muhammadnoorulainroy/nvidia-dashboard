"""
PostgreSQL query service for nvidia dashboard statistics
"""
import logging
from typing import List, Dict, Any, Optional, Set
from collections import defaultdict
from sqlalchemy import func, or_, and_
from google.cloud import bigquery

from app.config import get_settings
from app.services.db_service import get_db_service
from app.models.db_models import ReviewDetail, Contributor, Task, WorkItem, TaskReviewedInfo, TaskAHT, ContributorTaskStats, ContributorDailyStats, ReviewerDailyStats, TaskRaw, TaskHistoryRaw, PodLeadMapping, ReviewerTrainerDailyStats, JibbleHours, TrainerReviewStats

logger = logging.getLogger(__name__)


class QueryService:
    """Service class for PostgreSQL query operations"""
    
    def __init__(self):
        self.settings = get_settings()
        self.db_service = get_db_service()
        self._allowed_quality_dimensions_cache: Optional[Set[str]] = None
    
    def _get_allowed_quality_dimensions(self, force_refresh: bool = False) -> Set[str]:
        """Fetch allowed quality dimensions from BigQuery"""
        if not force_refresh and self._allowed_quality_dimensions_cache is not None:
            return self._allowed_quality_dimensions_cache
        
        try:
            client = bigquery.Client(project=self.settings.gcp_project_id)
            
            query = f"""
            SELECT DISTINCT name 
            FROM `turing-gpt.{self.settings.bigquery_dataset}.project_quality_dimension` 
            WHERE project_id = {self.settings.project_id_filter} AND is_enabled = 1
            """
            
            results = client.query(query).result()
            self._allowed_quality_dimensions_cache = {row.name for row in results if row.name}
            
            logger.info(f"Loaded {len(self._allowed_quality_dimensions_cache)} enabled quality dimensions")
            return self._allowed_quality_dimensions_cache
            
        except Exception as e:
            logger.error(f"Error fetching allowed quality dimensions: {e}")
            return set()
    
    def _get_contributor_map(self) -> Dict[int, Dict[str, Any]]:
        """Get contributor ID to name, email, status, and team_lead_id mapping"""
        try:
            with self.db_service.get_session() as session:
                contributors = session.query(
                    Contributor.id, 
                    Contributor.name, 
                    Contributor.turing_email,
                    Contributor.status,
                    Contributor.team_lead_id
                ).all()
                return {
                    c.id: {
                        'name': c.name,
                        'email': c.turing_email,
                        'status': c.status,
                        'team_lead_id': c.team_lead_id
                    } 
                    for c in contributors
                }
        except Exception as e:
            logger.error(f"Error getting contributor map: {e}")
            return {}
    
    def _format_name_with_status(self, name: str, status: str) -> str:
        """Format contributor name with status indicator"""
        if not name:
            return 'Unknown'
        if not status or status.lower() == 'active':
            return name
        return f"{name} ({status.lower()})"
    
    def _process_aggregation_results(self, results: List[Any], group_key: Optional[str] = None) -> List[Dict[str, Any]]:
        """Process query results into structured aggregation format"""
        grouped_data = defaultdict(lambda: defaultdict(lambda: {
            'name': None,
            'conversation_ids': set(),
            'scores': [],
            'task_scores': {},
            'rework_counts': {}
        }))
        
        for row in results:
            if group_key:
                group_value = getattr(row, group_key, None)
            else:
                group_value = 'overall'
            
            name = row.name
            allowed_dimensions = self._get_allowed_quality_dimensions()
            if name and name in allowed_dimensions:
                conversation_id = row.conversation_id
                score = row.score
                task_score = getattr(row, 'task_score', None)
                rework_count = getattr(row, 'rework_count', None)
                
                grouped_data[group_value][name]['name'] = name
                
                if conversation_id is not None:
                    grouped_data[group_value][name]['conversation_ids'].add(conversation_id)
                    if task_score is not None:
                        grouped_data[group_value][name]['task_scores'][conversation_id] = task_score
                    if rework_count is not None:
                        grouped_data[group_value][name]['rework_counts'][conversation_id] = rework_count
                
                if score is not None:
                    grouped_data[group_value][name]['scores'].append(score)
        
        result = []
        for group_value, dimensions in grouped_data.items():
            quality_dimensions = []
            all_conversation_ids = set()
            all_task_scores = {}
            all_rework_counts = {}
            
            for name, data in dimensions.items():
                avg_score = None
                if data['scores']:
                    avg_score = sum(data['scores']) / len(data['scores'])
                
                all_conversation_ids.update(data['conversation_ids'])
                all_task_scores.update(data['task_scores'])
                all_rework_counts.update(data['rework_counts'])
                
                quality_dimensions.append({
                    'name': data['name'],
                    'average_score': round(avg_score, 2) if avg_score is not None else None,
                    'task_count': len(data['conversation_ids'])
                })
            
            quality_dimensions.sort(key=lambda x: x['name'])
            
            average_task_score = None
            if all_task_scores:
                task_score_values = list(all_task_scores.values())
                average_task_score = round(sum(task_score_values) / len(task_score_values), 2)
            
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
    
    def get_overall_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Get overall aggregation statistics"""
        try:
            with self.db_service.get_session() as session:
                query = session.query(ReviewDetail, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                
                results = query.all()
                
                processed_results = []
                for review_detail, rework_count in results:
                    review_detail.rework_count = rework_count
                    processed_results.append(review_detail)
                
                aggregated = self._process_aggregation_results(processed_results, group_key=None)
                
                if not aggregated:
                    return {
                        'task_count': 0,
                        'reviewer_count': 0,
                        'trainer_count': 0,
                        'domain_count': 0,
                        'quality_dimensions': [],
                        'average_completion_time_hours': None
                    }
                
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
                
                task_count_query = session.query(func.count(func.distinct(Task.id))).filter(
                    Task.is_delivered == 'False'
                )
                actual_task_count = task_count_query.scalar() or 0
                
                # Calculate average task completion time
                avg_completion_time = self._get_average_completion_time(session, filters)
                
                overall_data = aggregated[0]
                overall_data['task_count'] = actual_task_count
                overall_data['reviewer_count'] = len(unique_reviewers)
                overall_data['trainer_count'] = len(unique_trainers)
                overall_data['domain_count'] = len(unique_domains)
                overall_data['average_completion_time_hours'] = avg_completion_time
                
                return overall_data
        except Exception as e:
            logger.error(f"Error getting overall aggregation: {e}")
            raise
    
    def _get_average_completion_time(self, session, filters: Optional[Dict[str, Any]] = None) -> Optional[float]:
        """Calculate average task completion time in hours (annotation_date - created_at)"""
        try:
            from sqlalchemy import extract
            from datetime import datetime
            
            # Query tasks with both created_at and annotation_date
            query = session.query(
                Task.id,
                Task.created_at,
                TaskReviewedInfo.annotation_date
            ).join(
                TaskReviewedInfo, Task.id == TaskReviewedInfo.r_id
            ).filter(
                Task.is_delivered == 'False',
                Task.created_at.isnot(None),
                TaskReviewedInfo.annotation_date.isnot(None)
            )
            
            if filters:
                if filters.get('domain'):
                    query = query.filter(Task.domain == filters['domain'])
                if filters.get('trainer'):
                    query = query.filter(Task.current_user_id == int(filters['trainer']))
            
            results = query.all()
            
            if not results:
                return None
            
            total_hours = 0
            valid_count = 0
            
            for task_id, created_at, annotation_date in results:
                if created_at and annotation_date:
                    # Convert annotation_date to datetime if it's a date
                    if hasattr(annotation_date, 'hour'):
                        annotation_dt = annotation_date
                    else:
                        annotation_dt = datetime.combine(annotation_date, datetime.min.time())
                    
                    if hasattr(created_at, 'hour'):
                        created_dt = created_at
                    else:
                        created_dt = datetime.combine(created_at, datetime.min.time())
                    
                    duration = annotation_dt - created_dt
                    hours = duration.total_seconds() / 3600
                    
                    # Only count positive durations (annotation after creation)
                    if hours > 0:
                        total_hours += hours
                        valid_count += 1
            
            if valid_count == 0:
                return None
            
            avg_hours = round(total_hours / valid_count, 2)
            return avg_hours
            
        except Exception as e:
            logger.error(f"Error calculating average completion time: {e}")
            return None
    
    def get_domain_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get domain-wise aggregation statistics"""
        try:
            with self.db_service.get_session() as session:
                query = session.query(ReviewDetail, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                
                results = query.all()
                
                processed_results = []
                for review_detail, rework_count in results:
                    review_detail.rework_count = rework_count
                    processed_results.append(review_detail)
                
                aggregated = self._process_aggregation_results(processed_results, group_key='domain')
                
                for item in aggregated:
                    domain_value = item.pop('domain', None)
                    item['domain'] = domain_value if domain_value else 'Unknown'
                
                aggregated.sort(key=lambda x: x.get('domain', '') or '')
                
                return aggregated
        except Exception as e:
            logger.error(f"Error getting domain aggregation: {e}")
            raise
    
    def get_trainer_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get trainer-wise aggregation statistics"""
        try:
            contributor_map = self._get_contributor_map()
            trainer_aht_map = self._get_trainer_aht_map()
            contributor_task_stats_map = self._get_contributor_task_stats_map()
            
            with self.db_service.get_session() as session:
                query = session.query(ReviewDetail, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                
                results = query.all()
                
                processed_results = []
                for review_detail, rework_count in results:
                    review_detail.rework_count = rework_count
                    processed_results.append(review_detail)
                
                aggregated = self._process_aggregation_results(processed_results, group_key='human_role_id')
                
                # Get completion times by trainer
                completion_times = self._get_completion_times_by_trainer(session, filters)
                
                for item in aggregated:
                    trainer_id = item.pop('human_role_id', None)
                    item['trainer_id'] = trainer_id
                    contributor_info = contributor_map.get(trainer_id, {})
                    name = contributor_info.get('name', 'Unknown') if trainer_id else 'Unknown'
                    status = contributor_info.get('status', None)
                    item['trainer_name'] = self._format_name_with_status(name, status) if trainer_id else 'Unknown'
                    item['trainer_email'] = contributor_info.get('email', None) if trainer_id else None
                    item['average_completion_time_hours'] = completion_times.get(trainer_id)
                    
                    # Add AHT data
                    aht_info = trainer_aht_map.get(trainer_id, {})
                    item['avg_aht_minutes'] = aht_info.get('avg_aht_minutes')
                    item['total_aht_minutes'] = aht_info.get('total_duration_minutes')
                    item['aht_task_count'] = aht_info.get('aht_task_count')
                    
                    # Add new tasks vs rework stats
                    task_stats = contributor_task_stats_map.get(trainer_id, {})
                    item['new_tasks_submitted'] = task_stats.get('new_tasks_submitted')
                    item['rework_submitted'] = task_stats.get('rework_submitted')
                    item['total_unique_tasks'] = task_stats.get('total_unique_tasks')
                    item['first_submission_date'] = task_stats.get('first_submission_date')
                    item['last_submission_date'] = task_stats.get('last_submission_date')
                
                aggregated.sort(key=lambda x: x.get('trainer_name', ''))
                
                return aggregated
        except Exception as e:
            logger.error(f"Error getting trainer aggregation: {e}")
            raise
    
    def _get_completion_times_by_trainer(self, session, filters: Optional[Dict[str, Any]] = None) -> Dict[int, float]:
        """Get average completion time by trainer ID"""
        try:
            from datetime import datetime
            
            query = session.query(
                Task.current_user_id,
                Task.id,
                Task.created_at,
                TaskReviewedInfo.annotation_date
            ).join(
                TaskReviewedInfo, Task.id == TaskReviewedInfo.r_id
            ).filter(
                Task.is_delivered == 'False',
                Task.created_at.isnot(None),
                TaskReviewedInfo.annotation_date.isnot(None),
                Task.current_user_id.isnot(None)
            )
            
            if filters:
                if filters.get('domain'):
                    query = query.filter(Task.domain == filters['domain'])
            
            results = query.all()
            
            # Group by trainer
            trainer_durations = defaultdict(list)
            
            for trainer_id, task_id, created_at, annotation_date in results:
                if created_at and annotation_date and trainer_id:
                    if hasattr(annotation_date, 'hour'):
                        annotation_dt = annotation_date
                    else:
                        annotation_dt = datetime.combine(annotation_date, datetime.min.time())
                    
                    if hasattr(created_at, 'hour'):
                        created_dt = created_at
                    else:
                        created_dt = datetime.combine(created_at, datetime.min.time())
                    
                    duration = annotation_dt - created_dt
                    hours = duration.total_seconds() / 3600
                    
                    if hours > 0:
                        trainer_durations[trainer_id].append(hours)
            
            # Calculate averages
            result = {}
            for trainer_id, durations in trainer_durations.items():
                if durations:
                    result[trainer_id] = round(sum(durations) / len(durations), 2)
            
            return result
            
        except Exception as e:
            logger.error(f"Error getting completion times by trainer: {e}")
            return {}
    
    def get_pod_lead_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get POD Lead aggregation with nested reviewers"""
        try:
            contributor_map = self._get_contributor_map()
            
            # Build a map of trainer_id -> pod_lead_id
            trainer_to_pod_lead = {
                cid: info.get('team_lead_id')
                for cid, info in contributor_map.items()
                if info.get('team_lead_id') is not None
            }
            
            with self.db_service.get_session() as session:
                query = session.query(ReviewDetail, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                
                results = query.all()
                
                # Group by POD Lead -> Reviewer -> Quality Dimension
                pod_lead_data = defaultdict(lambda: {
                    'reviewers': defaultdict(lambda: {
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
                    trainer_id = review_detail.human_role_id
                    reviewer_id = review_detail.reviewer_id
                    pod_lead_id = trainer_to_pod_lead.get(trainer_id)
                    
                    # Skip trainers without a POD Lead
                    if pod_lead_id is None:
                        continue
                    
                    name = review_detail.name
                    conversation_id = review_detail.conversation_id
                    score = review_detail.score
                    task_score = review_detail.task_score
                    
                    if name and name in allowed_dimensions:
                        # Aggregate at POD Lead level
                        pod_lead_data[pod_lead_id]['conversation_ids'].add(conversation_id)
                        if score is not None:
                            pod_lead_data[pod_lead_id]['scores'].append(score)
                            pod_lead_data[pod_lead_id]['quality_dimensions'][name].append(score)
                        if task_score is not None:
                            pod_lead_data[pod_lead_id]['task_scores'][conversation_id] = task_score
                        if rework_count is not None:
                            pod_lead_data[pod_lead_id]['rework_counts'][conversation_id] = rework_count
                        
                        # Aggregate at reviewer level within POD Lead
                        reviewer_data = pod_lead_data[pod_lead_id]['reviewers'][reviewer_id]
                        reviewer_data['conversation_ids'].add(conversation_id)
                        if score is not None:
                            reviewer_data['scores'].append(score)
                            reviewer_data['quality_dimensions'][name].append(score)
                        if task_score is not None:
                            reviewer_data['task_scores'][conversation_id] = task_score
                        if rework_count is not None:
                            reviewer_data['rework_counts'][conversation_id] = rework_count
                
                # Build the result
                result = []
                for pod_lead_id, data in pod_lead_data.items():
                    pod_lead_info = contributor_map.get(pod_lead_id, {})
                    name = pod_lead_info.get('name', 'Unknown')
                    status = pod_lead_info.get('status', None)
                    
                    # Calculate POD Lead stats
                    task_scores = list(data['task_scores'].values())
                    avg_task_score = round(sum(task_scores) / len(task_scores), 2) if task_scores else None
                    rework_counts = list(data['rework_counts'].values())
                    total_rework = sum(rework_counts)
                    avg_rework = round(total_rework / len(rework_counts), 2) if rework_counts else 0
                    
                    # Build quality dimensions for POD Lead
                    quality_dimensions = []
                    for dim_name, scores in data['quality_dimensions'].items():
                        if scores:
                            quality_dimensions.append({
                                'name': dim_name,
                                'average_score': round(sum(scores) / len(scores), 2),
                                'task_count': len(data['conversation_ids'])
                            })
                    quality_dimensions.sort(key=lambda x: x['name'])
                    
                    # Build reviewers list
                    reviewers = []
                    for reviewer_id, reviewer_data in data['reviewers'].items():
                        reviewer_info = contributor_map.get(reviewer_id, {})
                        reviewer_name = reviewer_info.get('name', 'Unknown')
                        reviewer_status = reviewer_info.get('status', None)
                        
                        reviewer_task_scores = list(reviewer_data['task_scores'].values())
                        reviewer_avg_task_score = round(sum(reviewer_task_scores) / len(reviewer_task_scores), 2) if reviewer_task_scores else None
                        reviewer_rework_counts = list(reviewer_data['rework_counts'].values())
                        reviewer_total_rework = sum(reviewer_rework_counts)
                        reviewer_avg_rework = round(reviewer_total_rework / len(reviewer_rework_counts), 2) if reviewer_rework_counts else 0
                        
                        # Build quality dimensions for reviewer
                        reviewer_quality_dimensions = []
                        for dim_name, scores in reviewer_data['quality_dimensions'].items():
                            if scores:
                                reviewer_quality_dimensions.append({
                                    'name': dim_name,
                                    'average_score': round(sum(scores) / len(scores), 2),
                                    'task_count': len(reviewer_data['conversation_ids'])
                                })
                        reviewer_quality_dimensions.sort(key=lambda x: x['name'])
                        
                        reviewers.append({
                            'reviewer_id': reviewer_id,
                            'reviewer_name': self._format_name_with_status(reviewer_name, reviewer_status),
                            'reviewer_email': reviewer_info.get('email'),
                            'task_count': len(reviewer_data['conversation_ids']),
                            'average_task_score': reviewer_avg_task_score,
                            'total_rework_count': reviewer_total_rework,
                            'average_rework_count': reviewer_avg_rework,
                            'quality_dimensions': reviewer_quality_dimensions
                        })
                    
                    # Sort reviewers by name
                    reviewers.sort(key=lambda x: x.get('reviewer_name') or '')
                    
                    result.append({
                        'pod_lead_id': pod_lead_id,
                        'pod_lead_name': self._format_name_with_status(name, status),
                        'pod_lead_email': pod_lead_info.get('email'),
                        'task_count': len(data['conversation_ids']),
                        'reviewer_count': len(reviewers),
                        'average_task_score': avg_task_score,
                        'total_rework_count': total_rework,
                        'average_rework_count': avg_rework,
                        'quality_dimensions': quality_dimensions,
                        'reviewers': reviewers
                    })
                
                # Sort by POD Lead name
                result.sort(key=lambda x: x.get('pod_lead_name') or '')
                
                return result
        except Exception as e:
            logger.error(f"Error getting POD Lead aggregation: {e}")
            raise
    
    def get_reviewer_aggregation(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get reviewer-wise aggregation statistics"""
        try:
            contributor_map = self._get_contributor_map()
            
            with self.db_service.get_session() as session:
                query = session.query(ReviewDetail, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                
                results = query.all()
                
                processed_results = []
                for review_detail, rework_count in results:
                    review_detail.rework_count = rework_count
                    processed_results.append(review_detail)
                
                aggregated = self._process_aggregation_results(processed_results, group_key='reviewer_id')
                
                for item in aggregated:
                    reviewer_id = item.pop('reviewer_id', None)
                    item['reviewer_id'] = reviewer_id
                    contributor_info = contributor_map.get(reviewer_id, {})
                    name = contributor_info.get('name', 'Unknown') if reviewer_id else 'Unknown'
                    status = contributor_info.get('status', None)
                    item['reviewer_name'] = self._format_name_with_status(name, status) if reviewer_id else 'Unknown'
                    item['reviewer_email'] = contributor_info.get('email', None) if reviewer_id else None
                
                aggregated.sort(key=lambda x: x.get('reviewer_name', ''))
                
                return aggregated
        except Exception as e:
            logger.error(f"Error getting reviewer aggregation: {e}")
            raise
    
    def get_reviewers_with_trainers(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get reviewers with their trainers nested"""
        try:
            contributor_map = self._get_contributor_map()
            
            with self.db_service.get_session() as session:
                query = session.query(ReviewDetail, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                
                results = query.all()
                
                # Group by reviewer_id first, then by trainer (human_role_id)
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
                                'task_count': len(data['conversation_ids'])
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
    
    def _get_task_aht_map(self) -> Dict[int, Dict[str, Any]]:
        """Get task ID to AHT mapping"""
        try:
            with self.db_service.get_session() as session:
                aht_records = session.query(
                    TaskAHT.task_id,
                    TaskAHT.duration_seconds,
                    TaskAHT.duration_minutes,
                    TaskAHT.start_time,
                    TaskAHT.end_time
                ).all()
                
                aht_map = {}
                for record in aht_records:
                    aht_map[record.task_id] = {
                        'duration_seconds': record.duration_seconds,
                        'duration_minutes': round(record.duration_minutes, 2) if record.duration_minutes else None,
                        'start_time': record.start_time.isoformat() if record.start_time else None,
                        'end_time': record.end_time.isoformat() if record.end_time else None
                    }
                return aht_map
        except Exception as e:
            logger.error(f"Error getting task AHT map: {e}")
            return {}
    
    def _get_trainer_aht_map(self) -> Dict[int, Dict[str, Any]]:
        """Get trainer ID to average AHT mapping"""
        try:
            with self.db_service.get_session() as session:
                # Get total duration and task count per contributor
                aht_stats = session.query(
                    TaskAHT.contributor_id,
                    func.sum(TaskAHT.duration_minutes).label('total_minutes'),
                    func.count(TaskAHT.task_id).label('task_count')
                ).group_by(TaskAHT.contributor_id).all()
                
                trainer_aht_map = {}
                for stat in aht_stats:
                    if stat.contributor_id and stat.task_count > 0:
                        avg_minutes = stat.total_minutes / stat.task_count
                        trainer_aht_map[stat.contributor_id] = {
                            'total_duration_minutes': round(stat.total_minutes, 2),
                            'aht_task_count': stat.task_count,
                            'avg_aht_minutes': round(avg_minutes, 2)
                        }
                return trainer_aht_map
        except Exception as e:
            logger.error(f"Error getting trainer AHT map: {e}")
            return {}
    
    def _get_contributor_task_stats_map(self) -> Dict[int, Dict[str, Any]]:
        """Get contributor ID to task stats mapping (new tasks vs rework)"""
        try:
            with self.db_service.get_session() as session:
                stats = session.query(
                    ContributorTaskStats.contributor_id,
                    ContributorTaskStats.new_tasks_submitted,
                    ContributorTaskStats.rework_submitted,
                    ContributorTaskStats.total_unique_tasks,
                    ContributorTaskStats.first_submission_date,
                    ContributorTaskStats.last_submission_date
                ).all()
                
                stats_map = {}
                for stat in stats:
                    if stat.contributor_id:
                        stats_map[stat.contributor_id] = {
                            'new_tasks_submitted': stat.new_tasks_submitted or 0,
                            'rework_submitted': stat.rework_submitted or 0,
                            'total_unique_tasks': stat.total_unique_tasks or 0,
                            'first_submission_date': stat.first_submission_date.isoformat() if stat.first_submission_date else None,
                            'last_submission_date': stat.last_submission_date.isoformat() if stat.last_submission_date else None
                        }
                return stats_map
        except Exception as e:
            logger.error(f"Error getting contributor task stats map: {e}")
            return {}
    
    def get_task_level_data(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get task-level data with all quality dimensions and AHT"""
        try:
            contributor_map = self._get_contributor_map()
            task_aht_map = self._get_task_aht_map()
            
            with self.db_service.get_session() as session:
                query = session.query(ReviewDetail, Task.colab_link, Task.week_number, Task.rework_count).outerjoin(
                    Task, ReviewDetail.conversation_id == Task.id
                ).filter(ReviewDetail.is_delivered == 'False')
                
                if filters:
                    if filters.get('domain'):
                        query = query.filter(ReviewDetail.domain == filters['domain'])
                    if filters.get('reviewer'):
                        query = query.filter(ReviewDetail.reviewer_id == int(filters['reviewer']))
                    if filters.get('trainer'):
                        query = query.filter(ReviewDetail.human_role_id == int(filters['trainer']))
                
                results = query.all()
                
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
                    'duration_minutes': None,
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
                        
                        annotator_info = contributor_map.get(row.human_role_id, {})
                        annotator_name = annotator_info.get('name', 'Unknown') if row.human_role_id else 'Unknown'
                        annotator_status = annotator_info.get('status', None)
                        task_data[task_id]['annotator_name'] = self._format_name_with_status(annotator_name, annotator_status) if row.human_role_id else 'Unknown'
                        task_data[task_id]['annotator_email'] = annotator_info.get('email', None) if row.human_role_id else None
                        
                        task_data[task_id]['reviewer_id'] = row.reviewer_id
                        
                        reviewer_info = contributor_map.get(row.reviewer_id, {})
                        reviewer_name = reviewer_info.get('name', 'Unknown') if row.reviewer_id else None
                        reviewer_status = reviewer_info.get('status', None)
                        task_data[task_id]['reviewer_name'] = self._format_name_with_status(reviewer_name, reviewer_status) if row.reviewer_id else None
                        task_data[task_id]['reviewer_email'] = reviewer_info.get('email', None) if row.reviewer_id else None
                        
                        task_data[task_id]['colab_link'] = colab_link
                        task_data[task_id]['updated_at'] = row.updated_at.isoformat() if row.updated_at else None
                        task_data[task_id]['week_number'] = week_number
                        task_data[task_id]['rework_count'] = rework_count
                        
                        # Add AHT data
                        aht_info = task_aht_map.get(task_id, {})
                        task_data[task_id]['duration_minutes'] = aht_info.get('duration_minutes')
                    
                    if row.name and row.score is not None:
                        task_data[task_id]['quality_dimensions'][row.name] = round(float(row.score), 2)
                
                result = list(task_data.values())
                result.sort(key=lambda x: x['task_id'])
                
                return result
        except Exception as e:
            logger.error(f"Error getting task level data: {e}")
            raise
    
    def get_trainer_daily_stats(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Get trainer stats at date level - trainer x date granularity
        Uses task_raw for sum_number_of_turns to match spreadsheet formula
        """
        try:
            contributor_map = self._get_contributor_map()
            
            # Get project_id from filters, fall back to default
            project_id = filters.get('project_id') if filters else None
            effective_project_id = project_id if project_id is not None else self.settings.project_id_filter
            
            with self.db_service.get_session() as session:
                query = session.query(ContributorDailyStats).order_by(
                    ContributorDailyStats.contributor_id,
                    ContributorDailyStats.submission_date
                )
                
                daily_stats = query.all()
                
                # Get sum_turns per trainer per date from task_raw
                # Filter by derived_status (column AP) IN ('Completed', 'Reviewed', 'Rework', 'Validated')
                task_raw_query = session.query(
                    TaskRaw.trainer,
                    TaskRaw.last_completed_date,
                    func.count(TaskRaw.task_id).label('unique_tasks_raw'),
                    func.sum(TaskRaw.number_of_turns).label('sum_turns')
                ).filter(
                    TaskRaw.derived_status.in_(['Completed', 'Reviewed', 'Rework', 'Validated']),
                    TaskRaw.last_completed_date.isnot(None)
                )
                
                # Apply project filter
                if effective_project_id is not None:
                    task_raw_query = task_raw_query.filter(TaskRaw.project_id == effective_project_id)
                
                task_raw_daily = task_raw_query.group_by(TaskRaw.trainer, TaskRaw.last_completed_date).all()
                
                # Build trainer+date to task_raw stats map
                task_raw_map = {}
                for tr in task_raw_daily:
                    if tr.trainer and tr.last_completed_date:
                        key = (tr.trainer, tr.last_completed_date.isoformat())
                        task_raw_map[key] = {
                            'unique_tasks_raw': tr.unique_tasks_raw or 0,
                            'sum_turns': tr.sum_turns or 0
                        }
                
                # Get avg_rating per trainer per date from task_raw
                # Formula: SUM(sum_score) / SUM(count_reviews) WHERE count_reviews > 0 AND sum_followup_required = 0
                rating_query = session.query(
                    TaskRaw.trainer,
                    TaskRaw.last_completed_date,
                    func.sum(TaskRaw.sum_score).label('total_score'),
                    func.sum(TaskRaw.count_reviews).label('total_reviews')
                ).filter(
                    TaskRaw.count_reviews > 0,
                    # Removed sum_followup_required filter to include tasks sent to rework
                    TaskRaw.last_completed_date.isnot(None)
                )
                
                # Apply project filter
                if effective_project_id is not None:
                    rating_query = rating_query.filter(TaskRaw.project_id == effective_project_id)
                
                rating_daily = rating_query.group_by(TaskRaw.trainer, TaskRaw.last_completed_date).all()
                
                # Build trainer+date to rating map
                rating_map = {}
                for r in rating_daily:
                    if r.trainer and r.last_completed_date:
                        key = (r.trainer, r.last_completed_date.isoformat())
                        total_score = r.total_score or 0
                        total_reviews = r.total_reviews or 0
                        avg_rating = round(total_score / total_reviews, 2) if total_reviews > 0 else None
                        rating_map[key] = avg_rating
                
                result = []
                for stat in daily_stats:
                    contributor_info = contributor_map.get(stat.contributor_id, {})
                    name = contributor_info.get('name', 'Unknown')
                    status = contributor_info.get('status', None)
                    email = contributor_info.get('email')
                    
                    new_tasks = stat.new_tasks_submitted or 0
                    rework = stat.rework_submitted or 0
                    unique_tasks = stat.unique_tasks or 0
                    
                    # Get task_raw stats for this trainer on this date
                    date_str = stat.submission_date.isoformat() if stat.submission_date else None
                    tr_stats = task_raw_map.get((email, date_str), {})
                    unique_tasks_from_raw = tr_stats.get('unique_tasks_raw', 0)
                    sum_turns = tr_stats.get('sum_turns', 0)
                    
                    # Avg Rework = ((total_completions / unique_tasks) - 1) * 100
                    # Where total_completions = new_tasks + rework
                    avg_rework = None
                    total_completions = new_tasks + rework
                    if unique_tasks > 0:
                        avg_rework = round((total_completions / unique_tasks) - 1, 2)
                    
                    # Rework % = rework / (rework + new_tasks) * 100
                    rework_percent = None
                    if (rework + new_tasks) > 0:
                        rework_percent = round((rework / (rework + new_tasks)) * 100, 0)
                    
                    # Get avg_rating for this trainer on this date
                    avg_rating = rating_map.get((email, date_str))
                    
                    result.append({
                        'trainer_id': stat.contributor_id,
                        'trainer_name': self._format_name_with_status(name, status),
                        'trainer_email': email,
                        'submission_date': date_str,
                        'new_tasks_submitted': new_tasks,
                        'rework_submitted': rework,
                        'total_submissions': stat.total_submissions or 0,
                        'unique_tasks': unique_tasks_from_raw if unique_tasks_from_raw > 0 else unique_tasks,
                        'tasks_ready_for_delivery': getattr(stat, 'tasks_ready_for_delivery', 0) or 0,
                        'sum_number_of_turns': sum_turns,
                        'avg_rework': avg_rework,
                        'rework_percent': rework_percent,
                        'avg_rating': avg_rating,
                    })
                
                return result
        except Exception as e:
            logger.error(f"Error getting trainer daily stats: {e}")
            raise
    
    def get_trainer_overall_stats(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Get overall trainer stats using:
        - TaskHistoryRaw for unique_tasks, new_tasks_submitted, rework_submitted (matching spreadsheet exactly)
        - TaskRaw for sum_number_of_turns (for avg_rework calculation)
        - TaskRaw + TaskHistoryRaw for approved, approved_rework, delivered, in_queue
        - TrainerReviewStats for total_reviews and avg_rating
        """
        try:
            from collections import defaultdict
            
            contributor_map = self._get_contributor_map()
            
            # Get project_id from filters, fall back to default
            project_id = filters.get('project_id') if filters else None
            effective_project_id = project_id if project_id is not None else self.settings.project_id_filter
            
            # Build project filter list
            filter_project_ids = [effective_project_id] if effective_project_id is not None else None
            
            with self.db_service.get_session() as session:
                from sqlalchemy import case, distinct
                
                # Get metrics from task_history_raw using actual author for proper attribution
                history_query = session.query(
                    TaskHistoryRaw.author,
                    func.count(distinct(TaskHistoryRaw.task_id)).label('unique_tasks'),
                    func.sum(case(
                        (TaskHistoryRaw.completed_status_count == 1, 1),
                        else_=0
                    )).label('new_tasks'),
                    func.sum(case(
                        (TaskHistoryRaw.completed_status_count > 1, 1),
                        else_=0
                    )).label('rework')
                ).filter(
                    TaskHistoryRaw.new_status == 'completed',
                    TaskHistoryRaw.old_status != 'completed-approval',
                    TaskHistoryRaw.author.isnot(None)
                )
                
                # Apply project filter
                if filter_project_ids:
                    history_query = history_query.filter(TaskHistoryRaw.project_id.in_(filter_project_ids))
                
                history_stats = history_query.group_by(TaskHistoryRaw.author).all()
                
                # Build email to history stats map
                history_map = {}
                for hs in history_stats:
                    if hs.author:
                        email_key = hs.author.lower().strip()
                        history_map[email_key] = {
                            'unique_tasks': hs.unique_tasks or 0,
                            'new_tasks': hs.new_tasks or 0,
                            'rework': hs.rework or 0
                        }
                
                # Get sum_number_of_turns from task_raw for avg_rework calculation
                task_raw_query = session.query(
                    TaskRaw.trainer,
                    func.sum(TaskRaw.number_of_turns).label('sum_turns')
                ).filter(
                    TaskRaw.derived_status.in_(['Completed', 'Reviewed', 'Rework', 'Validated']),
                    TaskRaw.last_completed_date.isnot(None)
                )
                
                if filter_project_ids:
                    task_raw_query = task_raw_query.filter(TaskRaw.project_id.in_(filter_project_ids))
                
                task_raw_stats = task_raw_query.group_by(TaskRaw.trainer).all()
                
                # Build trainer email to task_raw stats map
                task_raw_map = {}
                for tr in task_raw_stats:
                    if tr.trainer:
                        email_key = tr.trainer.lower().strip()
                        task_raw_map[email_key] = {
                            'sum_turns': tr.sum_turns or 0
                        }
                
                # ---------------------------------------------------------
                # Get Approved Tasks with proper attribution
                # ---------------------------------------------------------
                approved_tasks_query = session.query(
                    TaskRaw.task_id
                ).filter(
                    func.lower(TaskRaw.task_status) == 'completed',
                    TaskRaw.count_reviews > 0,
                    or_(
                        TaskRaw.review_action_type != 'rework',
                        TaskRaw.review_action_type.is_(None)
                    )
                )
                
                if filter_project_ids:
                    approved_tasks_query = approved_tasks_query.filter(TaskRaw.project_id.in_(filter_project_ids))
                
                approved_task_ids = [r.task_id for r in approved_tasks_query.all()]
                
                # Attribute approved tasks
                trainer_approved = {}
                trainer_approved_rework = {}
                
                if approved_task_ids:
                    completion_events = session.query(
                        TaskHistoryRaw.task_id,
                        TaskHistoryRaw.author,
                        TaskHistoryRaw.completed_status_count,
                        TaskHistoryRaw.time_stamp
                    ).filter(
                        TaskHistoryRaw.task_id.in_(approved_task_ids),
                        TaskHistoryRaw.new_status == 'completed',
                        TaskHistoryRaw.old_status != 'completed-approval',
                        TaskHistoryRaw.author.isnot(None)
                    ).all()
                    
                    task_completions = defaultdict(list)
                    for event in completion_events:
                        task_completions[event.task_id].append({
                            'author': event.author.lower().strip() if event.author else None,
                            'completed_status_count': event.completed_status_count,
                            'time_stamp': event.time_stamp
                        })
                    
                    for task_id, completions in task_completions.items():
                        if not completions:
                            continue
                        completions_sorted = sorted(completions, key=lambda x: x['time_stamp'] or '')
                        first_author = completions_sorted[0]['author']
                        last_completer = completions_sorted[-1]['author']
                        
                        if not last_completer:
                            continue
                        
                        if first_author == last_completer:
                            trainer_approved[last_completer] = trainer_approved.get(last_completer, 0) + 1
                        else:
                            trainer_approved_rework[last_completer] = trainer_approved_rework.get(last_completer, 0) + 1
                
                # ---------------------------------------------------------
                # Get Delivered and In Queue tasks
                # ---------------------------------------------------------
                delivered_tasks_query = session.query(
                    TaskRaw.task_id
                ).filter(
                    func.lower(TaskRaw.delivery_status) == 'delivered'
                )
                if filter_project_ids:
                    delivered_tasks_query = delivered_tasks_query.filter(TaskRaw.project_id.in_(filter_project_ids))
                delivered_task_ids = [r.task_id for r in delivered_tasks_query.all()]
                
                in_queue_tasks_query = session.query(
                    TaskRaw.task_id
                ).filter(
                    TaskRaw.delivery_batch_name.isnot(None),
                    TaskRaw.delivery_batch_name != '',
                    or_(
                        func.lower(TaskRaw.delivery_status) != 'delivered',
                        TaskRaw.delivery_status.is_(None)
                    )
                )
                if filter_project_ids:
                    in_queue_tasks_query = in_queue_tasks_query.filter(TaskRaw.project_id.in_(filter_project_ids))
                in_queue_task_ids = [r.task_id for r in in_queue_tasks_query.all()]
                
                trainer_delivered = {}
                trainer_in_queue = {}
                
                all_delivery_task_ids = list(set(delivered_task_ids + in_queue_task_ids))
                
                if all_delivery_task_ids:
                    delivery_completion_events = session.query(
                        TaskHistoryRaw.task_id,
                        TaskHistoryRaw.author,
                        TaskHistoryRaw.time_stamp
                    ).filter(
                        TaskHistoryRaw.task_id.in_(all_delivery_task_ids),
                        TaskHistoryRaw.new_status == 'completed',
                        TaskHistoryRaw.old_status != 'completed-approval',
                        TaskHistoryRaw.author.isnot(None)
                    ).all()
                    
                    delivery_task_completions = defaultdict(list)
                    for event in delivery_completion_events:
                        delivery_task_completions[event.task_id].append({
                            'author': event.author.lower().strip() if event.author else None,
                            'time_stamp': event.time_stamp
                        })
                    
                    delivered_set = set(delivered_task_ids)
                    in_queue_set = set(in_queue_task_ids)
                    
                    for task_id, completions in delivery_task_completions.items():
                        if not completions:
                            continue
                        completions_sorted = sorted(completions, key=lambda x: x['time_stamp'] or '')
                        last_completer = completions_sorted[-1]['author']
                        
                        if not last_completer:
                            continue
                        
                        if task_id in delivered_set:
                            trainer_delivered[last_completer] = trainer_delivered.get(last_completer, 0) + 1
                        if task_id in in_queue_set:
                            trainer_in_queue[last_completer] = trainer_in_queue.get(last_completer, 0) + 1
                
                # ---------------------------------------------------------
                # Get Total Reviews and Avg Rating from trainer_review_stats
                # ---------------------------------------------------------
                review_query = session.query(
                    TrainerReviewStats.trainer_email,
                    func.count(TrainerReviewStats.review_id).label('total_reviews'),
                    func.sum(TrainerReviewStats.score).label('total_score')
                ).filter(
                    TrainerReviewStats.score.isnot(None)
                )
                
                if filter_project_ids:
                    review_query = review_query.filter(TrainerReviewStats.project_id.in_(filter_project_ids))
                
                review_stats = review_query.group_by(TrainerReviewStats.trainer_email).all()
                
                trainer_reviews_map = {}
                for rs in review_stats:
                    if rs.trainer_email:
                        email_key = rs.trainer_email.lower().strip()
                        total_reviews = rs.total_reviews or 0
                        total_score = rs.total_score or 0
                        avg_rating = round(total_score / total_reviews, 2) if total_reviews > 0 else None
                        trainer_reviews_map[email_key] = {
                            'total_reviews': total_reviews,
                            'avg_rating': avg_rating
                        }
                
                # Build email to contributor_id map
                email_to_id = {}
                for cid, info in contributor_map.items():
                    if info.get('email'):
                        email_to_id[info['email'].lower().strip()] = cid
                
                # ---------------------------------------------------------
                # Get Jibble Hours for trainers (filtered by date range if provided)
                # ---------------------------------------------------------
                trainer_jibble_map = {}
                try:
                    # Build mapping from jibble member_code to trainer email via pod_lead_mapping
                    jibble_to_trainer = {}
                    pod_mappings = session.query(PodLeadMapping).all()
                    for pm in pod_mappings:
                        if pm.jibble_id and pm.trainer_email:
                            jibble_to_trainer[str(pm.jibble_id)] = pm.trainer_email.lower().strip()
                    
                    logger.info(f"Built jibble_to_trainer mapping with {len(jibble_to_trainer)} entries")
                    
                    # Query Jibble hours with optional date and project filtering
                    # Also get full_name for fallback matching
                    jibble_query = session.query(
                        JibbleHours.member_code,
                        JibbleHours.full_name,
                        func.sum(JibbleHours.logged_hours).label('total_hours')
                    )
                    
                    # Apply date range filter if provided
                    start_date = filters.get('start_date') if filters else None
                    end_date = filters.get('end_date') if filters else None
                    
                    if start_date:
                        jibble_query = jibble_query.filter(JibbleHours.entry_date >= start_date)
                    if end_date:
                        jibble_query = jibble_query.filter(JibbleHours.entry_date <= end_date)
                    
                    # Apply project filter if provided - map project_id to project name
                    project_id = filters.get('project_id') if filters else None
                    project_name_map = {
                        36: 'SysBench',
                        37: 'CFBench',
                        38: 'InverseIFEval',
                        39: 'Multichallenge',
                    }
                    if project_id and project_id in project_name_map:
                        project_pattern = f"%{project_name_map[project_id]}%"
                        jibble_query = jibble_query.filter(JibbleHours.project.ilike(project_pattern))
                        logger.info(f"Filtering Jibble hours by project: {project_pattern}")
                    
                    jibble_query = jibble_query.group_by(JibbleHours.member_code, JibbleHours.full_name)
                    jibble_results = jibble_query.all()
                    
                    logger.info(f"Found {len(jibble_results)} unique Jibble member_codes")
                    
                    # Map to trainer emails AND build name-based lookup for ALL records
                    jibble_by_name = {}  # For fallback matching by name - populated for ALL records
                    unmatched_count = 0
                    for jr in jibble_results:
                        # Always add to name-based lookup for fallback matching
                        if jr.full_name:
                            name_key = jr.full_name.lower().strip()
                            # Accumulate hours for same name (might have multiple member_codes)
                            jibble_by_name[name_key] = jibble_by_name.get(name_key, 0) + float(jr.total_hours or 0)
                        
                        # Also try email-based mapping
                        if jr.member_code:
                            trainer_email = jibble_to_trainer.get(str(jr.member_code))
                            if trainer_email:
                                trainer_jibble_map[trainer_email] = float(jr.total_hours or 0)
                            else:
                                unmatched_count += 1
                    
                    date_range_msg = f" for {start_date} to {end_date}" if start_date or end_date else " (all time)"
                    logger.info(f"Matched {len(trainer_jibble_map)} trainers to Jibble hours via email{date_range_msg}")
                    logger.info(f"Unmatched Jibble records: {unmatched_count} (no email mapping)")
                    logger.info(f"Built jibble_by_name with {len(jibble_by_name)} unique names for fallback matching")
                    
                    # Store jibble_by_name for potential use in result building
                    self._jibble_by_name = jibble_by_name
                except Exception as jibble_err:
                    logger.warning(f"Failed to fetch Jibble hours: {jibble_err}")
                
                result = []
                
                # Check for email overlap and try name-based matching for unmatched
                jibble_by_name = getattr(self, '_jibble_by_name', {})
                overlap = set(history_map.keys()) & set(trainer_jibble_map.keys())
                logger.info(f"Email overlap between history and jibble: {len(overlap)} trainers out of {len(history_map)} in history")
                
                # Debug: Show sample emails from both maps
                sample_history = list(history_map.keys())[:3]
                sample_jibble = list(trainer_jibble_map.keys())[:3]
                logger.info(f"Sample history emails: {sample_history}")
                logger.info(f"Sample jibble emails: {sample_jibble}")
                
                # Iterate over all trainers with history data
                for email, hist_stats in history_map.items():
                    contributor_id = email_to_id.get(email)
                    contributor_info = contributor_map.get(contributor_id, {}) if contributor_id else {}
                    name = contributor_info.get('name', email.split('@')[0] if email else 'Unknown')
                    status = contributor_info.get('status', None)
                    
                    unique_tasks = hist_stats.get('unique_tasks', 0)
                    new_tasks = hist_stats.get('new_tasks', 0)
                    rework = hist_stats.get('rework', 0)
                    
                    # Skip contributors with no data
                    if unique_tasks == 0 and new_tasks == 0 and rework == 0:
                        continue
                    
                    # Get sum_turns from task_raw for avg_rework calculation
                    tr_stats = task_raw_map.get(email, {})
                    sum_turns = tr_stats.get('sum_turns', 0)
                    
                    # Avg Rework = (total_completions / unique_tasks) - 1
                    # This is a decimal number (e.g., 4.12 means average 4.12 reworks per task)
                    avg_rework = None
                    total_completions = new_tasks + rework
                    if unique_tasks > 0:
                        avg_rework = round((total_completions / unique_tasks) - 1, 2)
                    
                    # Rework % = rework / (new_tasks + rework) * 100
                    rework_percent = None
                    if (rework + new_tasks) > 0:
                        rework_percent = round((rework / (rework + new_tasks)) * 100, 0)
                    
                    # Get review stats
                    review_info = trainer_reviews_map.get(email, {})
                    total_reviews = review_info.get('total_reviews', 0)
                    avg_rating = review_info.get('avg_rating')
                    
                    # Get approved/delivery stats
                    approved = trainer_approved.get(email, 0)
                    approved_rework = trainer_approved_rework.get(email, 0)
                    delivered = trainer_delivered.get(email, 0)
                    in_queue = trainer_in_queue.get(email, 0)
                    
                    # Get Jibble hours for this trainer
                    jibble_hours = trainer_jibble_map.get(email, None)
                    
                    # Debug: Log first few matches/misses
                    if len(result) < 3:
                        logger.info(f"Trainer lookup: email='{email}', jibble_hours={jibble_hours}, in_jibble_map={email in trainer_jibble_map}")
                    
                    # Fallback: try matching by name if email didn't match
                    if jibble_hours is None and name and jibble_by_name:
                        name_key = name.lower().strip()
                        # Remove status suffixes like "(in-trial)" for matching
                        name_clean = name_key.split('(')[0].strip()
                        jibble_hours = jibble_by_name.get(name_key) or jibble_by_name.get(name_clean)
                        if jibble_hours and len(result) < 10:
                            logger.info(f"Trainer '{email}' matched by name '{name_clean}' with {jibble_hours} hours")
                    
                    result.append({
                        'trainer_id': contributor_id,
                        'trainer_name': self._format_name_with_status(name, status),
                        'trainer_email': email,
                        'submission_date': None,  # null for overall aggregation
                        'new_tasks_submitted': new_tasks,
                        'rework_submitted': rework,
                        'total_submissions': new_tasks + rework,
                        'unique_tasks': unique_tasks,
                        'tasks_ready_for_delivery': 0,
                        'sum_number_of_turns': sum_turns,
                        'avg_rework': avg_rework,
                        'rework_percent': rework_percent,
                        'avg_rating': avg_rating,
                        'total_reviews': total_reviews,
                        'approved': approved,
                        'approved_rework': approved_rework,
                        'delivered': delivered,
                        'in_queue': in_queue,
                        'jibble_hours': round(jibble_hours, 2) if jibble_hours else None,
                    })
                
                # Debug: Count how many trainers have jibble_hours
                with_jibble = sum(1 for r in result if r.get('jibble_hours') is not None)
                logger.info(f"Returning {len(result)} trainers, {with_jibble} have jibble_hours")
                
                # Debug: Show first 3 trainers with their jibble_hours
                for r in result[:3]:
                    logger.info(f"Sample result: {r.get('trainer_name')} - jibble_hours={r.get('jibble_hours')}")
                
                return result
        except Exception as e:
            logger.error(f"Error getting trainer overall stats: {e}")
            raise
    
    def get_reviewer_daily_stats(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get reviewer stats at date level - reviewer x date granularity"""
        try:
            contributor_map = self._get_contributor_map()
            
            with self.db_service.get_session() as session:
                query = session.query(ReviewerDailyStats).order_by(
                    ReviewerDailyStats.reviewer_id,
                    ReviewerDailyStats.review_date
                )
                
                daily_stats = query.all()
                
                # Get avg_rating per reviewer per date from task_raw
                # Formula: SUM(sum_score) / SUM(count_reviews) WHERE count_reviews > 0 AND sum_followup_required = 0
                # Use r_submitted_date for the reviewer's date
                rating_daily = session.query(
                    TaskRaw.reviewer,
                    TaskRaw.r_submitted_date,
                    func.sum(TaskRaw.sum_score).label('total_score'),
                    func.sum(TaskRaw.count_reviews).label('total_reviews')
                ).filter(
                    TaskRaw.count_reviews > 0,
                    # Removed sum_followup_required filter to include tasks sent to rework
                    TaskRaw.r_submitted_date.isnot(None),
                    TaskRaw.project_id == self.settings.project_id_filter
                ).group_by(TaskRaw.reviewer, TaskRaw.r_submitted_date).all()
                
                # Build reviewer+date to rating map
                rating_map = {}
                for r in rating_daily:
                    if r.reviewer and r.r_submitted_date:
                        key = (r.reviewer, r.r_submitted_date.isoformat())
                        total_score = r.total_score or 0
                        total_reviews = r.total_reviews or 0
                        avg_rating = round(total_score / total_reviews, 2) if total_reviews > 0 else None
                        rating_map[key] = avg_rating
                
                result = []
                for stat in daily_stats:
                    contributor_info = contributor_map.get(stat.reviewer_id, {})
                    name = contributor_info.get('name', 'Unknown')
                    status = contributor_info.get('status', None)
                    email = contributor_info.get('email')
                    
                    unique_tasks = stat.unique_tasks_reviewed or 0
                    new_tasks = stat.new_tasks_reviewed or 0
                    rework = stat.rework_reviewed or 0
                    sum_turns = getattr(stat, 'sum_number_of_turns', 0) or 0
                    
                    # Calculate avg_rework = (total_completions / unique_tasks) - 1
                    # Where total_completions = new_tasks + rework
                    avg_rework = None
                    total_completions = new_tasks + rework
                    if unique_tasks > 0:
                        avg_rework = round((total_completions / unique_tasks) - 1, 2)
                    
                    # Calculate rework_percent = rework / (rework + new_tasks) * 100
                    rework_percent = None
                    total_submissions = rework + new_tasks
                    if total_submissions > 0:
                        rework_percent = round((rework / total_submissions) * 100, 1)
                    
                    # Get avg_rating for this reviewer on this date
                    review_date_str = stat.review_date.isoformat() if stat.review_date else None
                    avg_rating = rating_map.get((email, review_date_str))
                    
                    result.append({
                        'reviewer_id': stat.reviewer_id,
                        'reviewer_name': self._format_name_with_status(name, status),
                        'reviewer_email': email,
                        'review_date': review_date_str,
                        'unique_tasks_reviewed': unique_tasks,
                        'new_tasks_reviewed': new_tasks,
                        'rework_reviewed': rework,
                        'total_reviews': stat.total_reviews or 0,
                        'tasks_ready_for_delivery': getattr(stat, 'tasks_ready_for_delivery', 0) or 0,
                        'sum_number_of_turns': sum_turns,
                        'avg_rework': avg_rework,
                        'rework_percent': rework_percent,
                        'avg_rating': avg_rating,
                    })
                
                return result
        except Exception as e:
            logger.error(f"Error getting reviewer daily stats: {e}")
            raise
    
    def get_trainers_by_reviewer_date(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Get trainers reviewed by each reviewer on each date with full metrics"""
        try:
            contributor_map = self._get_contributor_map()
            
            with self.db_service.get_session() as session:
                from app.models.db_models import ReviewerTrainerDailyStats
                
                # Query from the synced reviewer_trainer_daily_stats table
                query = session.query(ReviewerTrainerDailyStats).order_by(
                    ReviewerTrainerDailyStats.reviewer_id,
                    ReviewerTrainerDailyStats.review_date,
                    ReviewerTrainerDailyStats.trainer_id
                )
                
                results = query.all()
                
                # Get overall avg_rating per trainer from task_raw (not date-specific)
                rating_overall = session.query(
                    TaskRaw.trainer,
                    func.sum(TaskRaw.sum_score).label('total_score'),
                    func.sum(TaskRaw.count_reviews).label('total_reviews')
                ).filter(
                    TaskRaw.count_reviews > 0,
                    # Removed sum_followup_required filter to include tasks sent to rework
                    TaskRaw.project_id == self.settings.project_id_filter
                ).group_by(TaskRaw.trainer).all()
                
                # Build trainer email to overall rating map
                trainer_rating_map = {}
                for r in rating_overall:
                    if r.trainer:
                        total_score = r.total_score or 0
                        total_reviews = r.total_reviews or 0
                        avg_rating = round(total_score / total_reviews, 2) if total_reviews > 0 else None
                        trainer_rating_map[r.trainer] = avg_rating
                
                trainer_data = []
                for row in results:
                    reviewer_info = contributor_map.get(row.reviewer_id, {})
                    trainer_info = contributor_map.get(row.trainer_id, {})
                    
                    review_date_str = row.review_date.isoformat() if row.review_date else None
                    
                    tasks_reviewed = row.tasks_reviewed or 0
                    new_tasks_reviewed = row.new_tasks_reviewed or 0
                    rework_reviewed = row.rework_reviewed or 0
                    sum_turns = row.sum_number_of_turns or 0
                    
                    # Calculate avg_rework = (total_completions / tasks_reviewed) - 1
                    # Where total_completions = new_tasks + rework
                    avg_rework = None
                    total_completions = new_tasks_reviewed + rework_reviewed
                    if tasks_reviewed > 0:
                        avg_rework = round((total_completions / tasks_reviewed) - 1, 2)
                    
                    # Calculate rework_percent = rework_reviewed / (new_tasks_reviewed + rework_reviewed) * 100
                    rework_percent = None
                    total_submissions = new_tasks_reviewed + rework_reviewed
                    if total_submissions > 0:
                        rework_percent = round((rework_reviewed / total_submissions) * 100, 1)
                    
                    # Get overall avg_rating for this trainer
                    trainer_email = trainer_info.get('email')
                    avg_rating = trainer_rating_map.get(trainer_email) if trainer_email else None
                    
                    trainer_data.append({
                        'reviewer_id': row.reviewer_id,
                        'reviewer_name': reviewer_info.get('name', 'Unknown'),
                        'reviewer_email': reviewer_info.get('email'),
                        'review_date': review_date_str,
                        'trainer_id': row.trainer_id,
                        'trainer_name': trainer_info.get('name', 'Unknown'),
                        'trainer_email': trainer_email,
                        'tasks_reviewed': tasks_reviewed,
                        'avg_score': None,  # Not available from this table
                        'total_reviews': row.total_reviews or 0,
                        'new_tasks_reviewed': new_tasks_reviewed,
                        'rework_reviewed': rework_reviewed,
                        'ready_for_delivery': row.ready_for_delivery or 0,
                        'sum_number_of_turns': sum_turns,
                        'avg_rework': avg_rework,
                        'rework_percent': rework_percent,
                        'avg_rating': avg_rating,
                    })
                
                return trainer_data
        except Exception as e:
            logger.error(f"Error getting trainers by reviewer date: {e}")
            raise

    def get_rating_trends(self, trainer_email: str = None, granularity: str = "weekly") -> Dict[str, Any]:
        """Get rating trends over time"""
        try:
            with self.db_service.get_session() as session:
                from sqlalchemy import func, extract
                from datetime import datetime, timedelta
                
                # Base query on TaskRaw - get ratings by date
                # Group by period based on granularity
                
                if granularity == "daily":
                    date_group = TaskRaw.last_completed_date
                elif granularity == "monthly":
                    # Group by year-month
                    date_group = func.date_trunc('month', TaskRaw.last_completed_date)
                else:  # weekly
                    date_group = func.date_trunc('week', TaskRaw.last_completed_date)
                
                # Build query
                query = session.query(
                    date_group.label('period'),
                    TaskRaw.trainer.label('trainer'),
                    func.sum(TaskRaw.sum_score).label('total_score'),
                    func.sum(TaskRaw.count_reviews).label('total_reviews'),
                    func.count(func.distinct(TaskRaw.task_id)).label('tasks_count')
                ).filter(
                    TaskRaw.count_reviews > 0,
                    # Removed sum_followup_required filter to include tasks sent to rework
                    TaskRaw.last_completed_date.isnot(None)
                )
                
                if trainer_email:
                    query = query.filter(TaskRaw.trainer == trainer_email)
                
                query = query.group_by(date_group, TaskRaw.trainer).order_by(date_group)
                
                results = query.all()
                
                # Process results
                trends_by_trainer = {}
                overall_trends = []
                
                # Aggregate by period for overall
                period_totals = {}
                
                for row in results:
                    period_str = str(row.period)[:10] if row.period else None
                    if not period_str:
                        continue
                    
                    trainer = row.trainer or 'Unknown'
                    total_score = float(row.total_score) if row.total_score else 0
                    total_reviews = int(row.total_reviews) if row.total_reviews else 0
                    avg_rating = round(total_score / total_reviews, 2) if total_reviews > 0 else None
                    
                    # By trainer
                    if trainer not in trends_by_trainer:
                        trends_by_trainer[trainer] = []
                    
                    trends_by_trainer[trainer].append({
                        'period': period_str,
                        'avg_rating': avg_rating,
                        'total_reviews': total_reviews,
                        'tasks_count': row.tasks_count or 0
                    })
                    
                    # Overall aggregation
                    if period_str not in period_totals:
                        period_totals[period_str] = {'total_score': 0, 'total_reviews': 0, 'tasks_count': 0}
                    
                    period_totals[period_str]['total_score'] += total_score
                    period_totals[period_str]['total_reviews'] += total_reviews
                    period_totals[period_str]['tasks_count'] += row.tasks_count or 0
                
                # Calculate overall trends
                for period, totals in sorted(period_totals.items()):
                    avg = round(totals['total_score'] / totals['total_reviews'], 2) if totals['total_reviews'] > 0 else None
                    overall_trends.append({
                        'period': period,
                        'avg_rating': avg,
                        'total_reviews': totals['total_reviews'],
                        'tasks_count': totals['tasks_count']
                    })
                
                # Calculate improvement stats
                improvement_stats = {}
                
                if len(overall_trends) >= 2:
                    first_rating = overall_trends[0]['avg_rating']
                    last_rating = overall_trends[-1]['avg_rating']
                    
                    if first_rating and last_rating:
                        improvement = round(last_rating - first_rating, 2)
                        improvement_pct = round((improvement / first_rating) * 100, 1) if first_rating > 0 else 0
                        
                        improvement_stats = {
                            'first_period': overall_trends[0]['period'],
                            'last_period': overall_trends[-1]['period'],
                            'first_rating': first_rating,
                            'last_rating': last_rating,
                            'rating_change': improvement,
                            'improvement_percent': improvement_pct,
                            'trend': 'improving' if improvement > 0 else ('declining' if improvement < 0 else 'stable')
                        }
                
                return {
                    'granularity': granularity,
                    'overall_trends': overall_trends,
                    'by_trainer': trends_by_trainer,
                    'improvement_stats': improvement_stats,
                    'trainer_count': len(trends_by_trainer),
                    'period_count': len(overall_trends)
                }
                
        except Exception as e:
            logger.error(f"Error getting rating trends: {e}")
            raise

    def get_rating_comparison(self, period1_start: str, period1_end: str, 
                               period2_start: str, period2_end: str,
                               trainer_email: str = None) -> Dict[str, Any]:
        """Compare ratings between two time periods"""
        try:
            with self.db_service.get_session() as session:
                from sqlalchemy import func
                from datetime import datetime
                
                def get_period_stats(start_date: str, end_date: str):
                    """Get stats for a specific period"""
                    query = session.query(
                        TaskRaw.trainer.label('trainer'),
                        func.sum(TaskRaw.sum_score).label('total_score'),
                        func.sum(TaskRaw.count_reviews).label('total_reviews'),
                        func.count(func.distinct(TaskRaw.task_id)).label('tasks_count')
                    ).filter(
                        TaskRaw.count_reviews > 0,
                        # Removed sum_followup_required filter to include tasks sent to rework
                        TaskRaw.last_completed_date >= start_date,
                        TaskRaw.last_completed_date <= end_date
                    )
                    
                    if trainer_email:
                        query = query.filter(TaskRaw.trainer == trainer_email)
                    
                    query = query.group_by(TaskRaw.trainer)
                    
                    results = {}
                    total_score = 0
                    total_reviews = 0
                    total_tasks = 0
                    
                    for row in query.all():
                        trainer = row.trainer or 'Unknown'
                        score = float(row.total_score) if row.total_score else 0
                        reviews = int(row.total_reviews) if row.total_reviews else 0
                        avg = round(score / reviews, 2) if reviews > 0 else None
                        
                        results[trainer] = {
                            'avg_rating': avg,
                            'total_reviews': reviews,
                            'tasks_count': row.tasks_count or 0
                        }
                        
                        total_score += score
                        total_reviews += reviews
                        total_tasks += row.tasks_count or 0
                    
                    overall_avg = round(total_score / total_reviews, 2) if total_reviews > 0 else None
                    
                    return {
                        'by_trainer': results,
                        'overall': {
                            'avg_rating': overall_avg,
                            'total_reviews': total_reviews,
                            'tasks_count': total_tasks,
                            'trainer_count': len(results)
                        }
                    }
                
                # Get stats for both periods
                period1_stats = get_period_stats(period1_start, period1_end)
                period2_stats = get_period_stats(period2_start, period2_end)
                
                # Calculate improvements
                improvements = []
                all_trainers = set(period1_stats['by_trainer'].keys()) | set(period2_stats['by_trainer'].keys())
                
                for trainer in all_trainers:
                    p1 = period1_stats['by_trainer'].get(trainer, {})
                    p2 = period2_stats['by_trainer'].get(trainer, {})
                    
                    p1_rating = p1.get('avg_rating')
                    p2_rating = p2.get('avg_rating')
                    
                    change = None
                    change_pct = None
                    trend = 'no_data'
                    
                    if p1_rating is not None and p2_rating is not None:
                        change = round(p2_rating - p1_rating, 2)
                        change_pct = round((change / p1_rating) * 100, 1) if p1_rating > 0 else 0
                        trend = 'improving' if change > 0 else ('declining' if change < 0 else 'stable')
                    
                    improvements.append({
                        'trainer': trainer,
                        'period1_rating': p1_rating,
                        'period1_reviews': p1.get('total_reviews', 0),
                        'period2_rating': p2_rating,
                        'period2_reviews': p2.get('total_reviews', 0),
                        'rating_change': change,
                        'change_percent': change_pct,
                        'trend': trend
                    })
                
                # Sort by improvement (descending)
                improvements.sort(key=lambda x: (x['rating_change'] or -999), reverse=True)
                
                # Overall comparison
                p1_overall = period1_stats['overall']
                p2_overall = period2_stats['overall']
                
                overall_change = None
                overall_change_pct = None
                overall_trend = 'no_data'
                
                if p1_overall['avg_rating'] and p2_overall['avg_rating']:
                    overall_change = round(p2_overall['avg_rating'] - p1_overall['avg_rating'], 2)
                    overall_change_pct = round((overall_change / p1_overall['avg_rating']) * 100, 1) if p1_overall['avg_rating'] > 0 else 0
                    overall_trend = 'improving' if overall_change > 0 else ('declining' if overall_change < 0 else 'stable')
                
                return {
                    'period1': {
                        'start': period1_start,
                        'end': period1_end,
                        'stats': period1_stats['overall']
                    },
                    'period2': {
                        'start': period2_start,
                        'end': period2_end,
                        'stats': period2_stats['overall']
                    },
                    'overall_comparison': {
                        'rating_change': overall_change,
                        'change_percent': overall_change_pct,
                        'trend': overall_trend
                    },
                    'by_trainer': improvements,
                    'summary': {
                        'trainers_improved': len([i for i in improvements if i['trend'] == 'improving']),
                        'trainers_declined': len([i for i in improvements if i['trend'] == 'declining']),
                        'trainers_stable': len([i for i in improvements if i['trend'] == 'stable']),
                        'trainers_no_data': len([i for i in improvements if i['trend'] == 'no_data'])
                    }
                }
                
        except Exception as e:
            logger.error(f"Error getting rating comparison: {e}")
            raise

    def get_pod_lead_stats_with_trainers(self, start_date: str = None, end_date: str = None, timeframe: str = 'overall', project_id: int = None) -> List[Dict[str, Any]]:
        """
        Get POD Lead stats with trainers under each POD Lead.
        Uses TaskHistoryRaw and TaskRaw directly (same as Trainer Wise tab) for consistency.
        If project_id is provided, filters to that specific project. Otherwise uses all projects.
        """
        try:
            from sqlalchemy import case, distinct
            from collections import defaultdict
            
            # Use provided project_id or default to all projects
            filter_project_ids = [project_id] if project_id else self.settings.all_project_ids_list
            
            with self.db_service.get_session() as session:
                # Get POD Lead mappings
                pod_mappings = session.query(PodLeadMapping).all()
                
                if not pod_mappings:
                    logger.warning("No POD Lead mappings found")
                    return []
                
                # Build trainer to pod lead mapping
                trainer_to_pod = {}
                pod_trainers = defaultdict(list)
                
                for mapping in pod_mappings:
                    if mapping.trainer_email and mapping.pod_lead_email:
                        trainer_email = mapping.trainer_email.lower().strip()
                        pod_email = mapping.pod_lead_email.lower().strip()
                        trainer_to_pod[trainer_email] = {
                            'pod_lead_email': pod_email,
                            'trainer_name': mapping.trainer_name,
                            'trainer_email': trainer_email,
                            'status': mapping.current_status
                        }
                        pod_trainers[pod_email].append(trainer_email)
                
                logger.info(f"Found {len(trainer_to_pod)} trainer-pod mappings, {len(pod_trainers)} unique POD Leads, filtering by project_id: {filter_project_ids}")
                
                # ---------------------------------------------------------
                # STEP 1: Get metrics from task_history_raw using actual author
                # FIX: Use task_history_raw.author (who actually made the transition) for proper attribution
                # This ensures credit goes to the trainer who actually did the work, even if task was reassigned
                # Unique Tasks = COUNT DISTINCT task_id WHERE new_status='completed' AND old_status <> 'completed-approval'
                # New Tasks = COUNT WHERE completed_status_count = 1
                # Rework = COUNT WHERE completed_status_count > 1
                # ---------------------------------------------------------
                history_query = session.query(
                    TaskHistoryRaw.author,
                    func.count(distinct(TaskHistoryRaw.task_id)).label('unique_tasks'),
                    func.sum(case(
                        (TaskHistoryRaw.completed_status_count == 1, 1),
                        else_=0
                    )).label('new_tasks'),
                    func.sum(case(
                        (TaskHistoryRaw.completed_status_count > 1, 1),
                        else_=0
                    )).label('rework')
                ).filter(
                    TaskHistoryRaw.new_status == 'completed',
                    TaskHistoryRaw.old_status != 'completed-approval',
                    TaskHistoryRaw.project_id.in_(filter_project_ids),
                    TaskHistoryRaw.author.isnot(None)
                )
                
                # Apply date filters on task_history_raw.date
                if start_date:
                    history_query = history_query.filter(TaskHistoryRaw.date >= start_date)
                if end_date:
                    history_query = history_query.filter(TaskHistoryRaw.date <= end_date)
                
                history_query = history_query.group_by(TaskHistoryRaw.author)
                history_results = history_query.all()
                
                # Build trainer email to history stats map
                trainer_history = {}
                for hs in history_results:
                    if hs.author:
                        email = hs.author.lower().strip()
                        trainer_history[email] = {
                            'unique_tasks': hs.unique_tasks or 0,
                            'new_tasks': hs.new_tasks or 0,
                            'rework': hs.rework or 0
                        }
                
                logger.info(f"Found history stats for {len(trainer_history)} trainers")
                
                # ---------------------------------------------------------
                # STEP 2: Get sum_turns from task_raw for avg_rework calculation
                # Filter by derived_status (column AP) IN ('Completed', 'Reviewed', 'Rework', 'Validated')
                # Formula: (SUM(number_of_turns) / unique_tasks) - 1
                # ---------------------------------------------------------
                task_raw_query = session.query(
                    TaskRaw.trainer,
                    func.sum(TaskRaw.number_of_turns).label('sum_turns')
                ).filter(
                    TaskRaw.derived_status.in_(['Completed', 'Reviewed', 'Rework', 'Validated']),
                    TaskRaw.last_completed_date.isnot(None),
                    TaskRaw.project_id.in_(filter_project_ids)
                )
                
                if start_date:
                    task_raw_query = task_raw_query.filter(TaskRaw.last_completed_date >= start_date)
                if end_date:
                    task_raw_query = task_raw_query.filter(TaskRaw.last_completed_date <= end_date)
                
                task_raw_query = task_raw_query.group_by(TaskRaw.trainer)
                task_raw_results = task_raw_query.all()
                
                trainer_turns = {}
                for tr in task_raw_results:
                    if tr.trainer:
                        email = tr.trainer.lower().strip()
                        trainer_turns[email] = tr.sum_turns or 0
                
                # ---------------------------------------------------------
                # STEP 3: Get Approved Tasks with proper attribution
                # 
                # Approved Task = task_status='completed', count_reviews > 0, review_action_type != 'rework'
                # 
                # Attribution RULE:
                # - Find the FIRST author (who originally completed the task)
                # - Find the LAST completer (who completed it when it got approved)
                # - If FIRST author == LAST completer → Approved (original owner got it approved)
                # - If FIRST author != LAST completer → Approved Rework (someone else fixed it)
                #
                # This ensures:
                # - Trainer A completes → approved → A gets "Approved"
                # - Trainer A completes → rejected → A reworks → approved → A gets "Approved" (A is first author)
                # - Trainer A completes → rejected → B reworks → approved → B gets "Approved Rework" (B is not first author)
                # ---------------------------------------------------------
                
                # First, get list of approved task IDs
                approved_tasks_subquery = session.query(
                    TaskRaw.task_id
                ).filter(
                    func.lower(TaskRaw.task_status) == 'completed',
                    TaskRaw.count_reviews > 0,
                    or_(
                        TaskRaw.review_action_type != 'rework',
                        TaskRaw.review_action_type.is_(None)
                    ),
                    TaskRaw.project_id.in_(filter_project_ids)
                )
                
                if start_date:
                    approved_tasks_subquery = approved_tasks_subquery.filter(TaskRaw.last_completed_date >= start_date)
                if end_date:
                    approved_tasks_subquery = approved_tasks_subquery.filter(TaskRaw.last_completed_date <= end_date)
                
                approved_task_ids = [r.task_id for r in approved_tasks_subquery.all()]
                
                logger.info(f"Found {len(approved_task_ids)} approved tasks")
                
                # Now find completion events and attribute based on first author rule
                trainer_approved = {}  # Approved tasks (first author got approval)
                trainer_approved_rework = {}  # Approved rework (someone else got approval)
                
                if approved_task_ids:
                    # Get all completion events for approved tasks
                    completion_events = session.query(
                        TaskHistoryRaw.task_id,
                        TaskHistoryRaw.author,
                        TaskHistoryRaw.completed_status_count,
                        TaskHistoryRaw.time_stamp
                    ).filter(
                        TaskHistoryRaw.task_id.in_(approved_task_ids),
                        TaskHistoryRaw.new_status == 'completed',
                        TaskHistoryRaw.old_status != 'completed-approval',
                        TaskHistoryRaw.author.isnot(None)
                    ).all()
                    
                    # Group by task_id
                    task_completions = defaultdict(list)
                    for event in completion_events:
                        task_completions[event.task_id].append({
                            'author': event.author.lower().strip() if event.author else None,
                            'completed_status_count': event.completed_status_count,
                            'time_stamp': event.time_stamp
                        })
                    
                    # For each task, find FIRST author and LAST completer
                    for task_id, completions in task_completions.items():
                        if not completions:
                            continue
                        
                        # Sort by timestamp ascending to find first, descending to find last
                        completions_sorted = sorted(completions, key=lambda x: x['time_stamp'] or '')
                        
                        # First author = person who made the FIRST completion (completed_status_count = 1)
                        first_completion = completions_sorted[0]
                        first_author = first_completion['author']
                        
                        # Last completer = person who made the LAST completion (got it approved)
                        last_completion = completions_sorted[-1]
                        last_completer = last_completion['author']
                        
                        if not last_completer:
                            continue
                        
                        # Apply the RULE:
                        # If first author == last completer → Approved
                        # If first author != last completer → Approved Rework
                        if first_author == last_completer:
                            # Original author got their task approved
                            trainer_approved[last_completer] = trainer_approved.get(last_completer, 0) + 1
                        else:
                            # Someone else fixed the task and got it approved
                            trainer_approved_rework[last_completer] = trainer_approved_rework.get(last_completer, 0) + 1
                
                logger.info(f"Attributed approved tasks to {len(trainer_approved)} trainers (original author), {len(trainer_approved_rework)} trainers (fixed others' work)")
                
                # ---------------------------------------------------------
                # STEP 3.5: Get delivery stats with proper attribution
                # 
                # Delivered Tasks = Tasks where delivery_status = 'delivered'
                # In Delivery Queue = Tasks where delivery_batch_name IS NOT NULL AND delivery_status != 'delivered'
                #
                # Attribution: Use the LAST COMPLETER from task_history_raw (same as Approved)
                # This ensures consistency - the person who completed the work gets credit for delivery
                # ---------------------------------------------------------
                
                # Get delivered task IDs
                delivered_tasks_query = session.query(
                    TaskRaw.task_id
                ).filter(
                    func.lower(TaskRaw.delivery_status) == 'delivered',
                    TaskRaw.project_id.in_(filter_project_ids)
                )
                if start_date:
                    delivered_tasks_query = delivered_tasks_query.filter(TaskRaw.last_completed_date >= start_date)
                if end_date:
                    delivered_tasks_query = delivered_tasks_query.filter(TaskRaw.last_completed_date <= end_date)
                delivered_task_ids = [r.task_id for r in delivered_tasks_query.all()]
                
                # Get in-queue task IDs
                in_queue_tasks_query = session.query(
                    TaskRaw.task_id
                ).filter(
                    TaskRaw.delivery_batch_name.isnot(None),
                    TaskRaw.delivery_batch_name != '',
                    or_(
                        func.lower(TaskRaw.delivery_status) != 'delivered',
                        TaskRaw.delivery_status.is_(None)
                    ),
                    TaskRaw.project_id.in_(filter_project_ids)
                )
                if start_date:
                    in_queue_tasks_query = in_queue_tasks_query.filter(TaskRaw.last_completed_date >= start_date)
                if end_date:
                    in_queue_tasks_query = in_queue_tasks_query.filter(TaskRaw.last_completed_date <= end_date)
                in_queue_task_ids = [r.task_id for r in in_queue_tasks_query.all()]
                
                logger.info(f"Found {len(delivered_task_ids)} delivered tasks, {len(in_queue_task_ids)} in-queue tasks")
                
                # Attribute delivery stats to last completer
                trainer_delivered = {}
                trainer_in_queue = {}
                
                all_delivery_task_ids = list(set(delivered_task_ids + in_queue_task_ids))
                
                if all_delivery_task_ids:
                    # Get completion events for delivery tasks
                    delivery_completion_events = session.query(
                        TaskHistoryRaw.task_id,
                        TaskHistoryRaw.author,
                        TaskHistoryRaw.time_stamp
                    ).filter(
                        TaskHistoryRaw.task_id.in_(all_delivery_task_ids),
                        TaskHistoryRaw.new_status == 'completed',
                        TaskHistoryRaw.old_status != 'completed-approval',
                        TaskHistoryRaw.author.isnot(None)
                    ).all()
                    
                    # Group by task_id and find last completer
                    delivery_task_completions = defaultdict(list)
                    for event in delivery_completion_events:
                        delivery_task_completions[event.task_id].append({
                            'author': event.author.lower().strip() if event.author else None,
                            'time_stamp': event.time_stamp
                        })
                    
                    # Attribute to last completer
                    delivered_set = set(delivered_task_ids)
                    in_queue_set = set(in_queue_task_ids)
                    
                    for task_id, completions in delivery_task_completions.items():
                        if not completions:
                            continue
                        # Find last completer
                        completions_sorted = sorted(completions, key=lambda x: x['time_stamp'] or '')
                        last_completer = completions_sorted[-1]['author']
                        
                        if not last_completer:
                            continue
                        
                        if task_id in delivered_set:
                            trainer_delivered[last_completer] = trainer_delivered.get(last_completer, 0) + 1
                        if task_id in in_queue_set:
                            trainer_in_queue[last_completer] = trainer_in_queue.get(last_completer, 0) + 1
                
                logger.info(f"Attributed delivery stats to {len(trainer_delivered)} trainers (delivered), {len(trainer_in_queue)} trainers (in queue)")
                
                # ---------------------------------------------------------
                # STEP 4 & 5: Get avg_rating and total_reviews from trainer_review_stats
                # 
                # NEW APPROACH: Each review is attributed to the trainer who did the work
                # that was reviewed (not the current task owner).
                #
                # Example:
                # - Trainer A completes task -> rejected (3.3) -> reworks -> approved (4.8)
                #   Trainer A gets 2 reviews: avg = (3.3 + 4.8) / 2 = 4.05
                #
                # - Trainer A completes task -> rejected (2.3) -> Trainer B reworks -> approved (5.0)
                #   Trainer A gets 1 review: 2.3
                #   Trainer B gets 1 review: 5.0
                # ---------------------------------------------------------
                trainer_review_query = session.query(
                    TrainerReviewStats.trainer_email,
                    func.count(TrainerReviewStats.review_id).label('total_reviews'),
                    func.sum(TrainerReviewStats.score).label('total_score')
                ).filter(
                    TrainerReviewStats.project_id.in_(filter_project_ids),
                    TrainerReviewStats.score.isnot(None)
                )
                
                if start_date:
                    trainer_review_query = trainer_review_query.filter(TrainerReviewStats.review_date >= start_date)
                if end_date:
                    trainer_review_query = trainer_review_query.filter(TrainerReviewStats.review_date <= end_date)
                
                trainer_review_query = trainer_review_query.group_by(TrainerReviewStats.trainer_email)
                trainer_review_results = trainer_review_query.all()
                
                trainer_ratings = {}
                trainer_total_reviews = {}
                trainer_total_scores = {}  # For POD-level aggregation
                for r in trainer_review_results:
                    if r.trainer_email:
                        email = r.trainer_email.lower().strip()
                        trainer_total_reviews[email] = r.total_reviews or 0
                        trainer_total_scores[email] = float(r.total_score or 0)
                        if r.total_reviews and r.total_reviews > 0 and r.total_score:
                            trainer_ratings[email] = round(float(r.total_score) / float(r.total_reviews), 2)
                
                logger.info(f"Found trainer-attributed reviews for {len(trainer_total_reviews)} trainers (using TrainerReviewStats)")
                
                # ---------------------------------------------------------
                # STEP 6: Get Jibble hours for trainers AND POD Leads
                # Trainers: Map via member_code (jibble_id) from pod_lead_mapping
                # POD Leads: Match by name from contributor table to jibble_hours.full_name
                # ---------------------------------------------------------
                # Build jibble_id to email mapping from pod_lead_mapping
                jibble_to_trainer = {}
                for mapping in pod_mappings:
                    if mapping.jibble_id and mapping.trainer_email:
                        jibble_to_trainer[str(mapping.jibble_id)] = mapping.trainer_email.lower().strip()
                
                # Query Jibble hours for trainers (by member_code)
                jibble_query = session.query(
                    JibbleHours.member_code,
                    func.sum(JibbleHours.logged_hours).label('total_hours')
                )
                
                if start_date:
                    jibble_query = jibble_query.filter(JibbleHours.entry_date >= start_date)
                if end_date:
                    jibble_query = jibble_query.filter(JibbleHours.entry_date <= end_date)
                
                # Apply project filter if provided - map project_id to project name
                project_name_map = {
                    36: 'SysBench',
                    37: 'CFBench',
                    38: 'InverseIFEval',
                    39: 'Multichallenge',
                }
                if project_id and project_id in project_name_map:
                    project_pattern = f"%{project_name_map[project_id]}%"
                    jibble_query = jibble_query.filter(JibbleHours.project.ilike(project_pattern))
                
                jibble_query = jibble_query.group_by(JibbleHours.member_code)
                jibble_results = jibble_query.all()
                
                # Map jibble hours to trainer email
                trainer_jibble_hours = {}
                for jr in jibble_results:
                    if jr.member_code:
                        trainer_email = jibble_to_trainer.get(str(jr.member_code))
                        if trainer_email:
                            trainer_jibble_hours[trainer_email] = float(jr.total_hours or 0)
                
                # Query Jibble hours for POD Leads using member_code from pod_lead_mapping
                # First, get POD Lead jibble_ids from their own trainer entries in pod_lead_mapping
                pod_lead_jibble_ids = {}
                for pod_email in pod_trainers.keys():
                    # POD Leads have their own entry in pod_lead_mapping with trainer_email = pod_lead_email
                    pod_mapping = session.query(PodLeadMapping).filter(
                        func.lower(PodLeadMapping.trainer_email) == pod_email.lower()
                    ).first()
                    if pod_mapping and pod_mapping.jibble_id:
                        pod_lead_jibble_ids[pod_email] = pod_mapping.jibble_id
                
                logger.info(f"Found jibble_ids for {len(pod_lead_jibble_ids)} POD Leads")
                
                # Now query jibble_hours using member_code for POD Leads
                pod_lead_jibble_hours = {}
                if pod_lead_jibble_ids:
                    jibble_id_list = list(pod_lead_jibble_ids.values())
                    
                    pod_jibble_query = session.query(
                        JibbleHours.member_code,
                        func.sum(JibbleHours.logged_hours).label('total_hours')
                    ).filter(JibbleHours.member_code.in_(jibble_id_list))
                    
                    if start_date:
                        pod_jibble_query = pod_jibble_query.filter(JibbleHours.entry_date >= start_date)
                    if end_date:
                        pod_jibble_query = pod_jibble_query.filter(JibbleHours.entry_date <= end_date)
                    
                    # Apply project filter for POD leads too
                    if project_id and project_id in project_name_map:
                        project_pattern = f"%{project_name_map[project_id]}%"
                        pod_jibble_query = pod_jibble_query.filter(JibbleHours.project.ilike(project_pattern))
                    
                    pod_jibble_query = pod_jibble_query.group_by(JibbleHours.member_code)
                    pod_jibble_results = pod_jibble_query.all()
                    
                    # Build member_code -> hours mapping
                    member_code_to_hours = {str(r.member_code): float(r.total_hours or 0) for r in pod_jibble_results}
                    
                    # Map back to pod_email
                    for pod_email, jibble_id in pod_lead_jibble_ids.items():
                        if str(jibble_id) in member_code_to_hours:
                            pod_lead_jibble_hours[pod_email] = member_code_to_hours[str(jibble_id)]
                
                logger.info(f"Found Jibble hours for {len(trainer_jibble_hours)} trainers, {len(pod_lead_jibble_hours)} POD Leads")
                
                # ---------------------------------------------------------
                # STEP 7: Build POD Lead results with trainers
                # ---------------------------------------------------------
                pod_results = []
                
                for pod_email, trainer_emails in pod_trainers.items():
                    # Get POD Lead name from contributor table
                    pod_contributor = session.query(Contributor).filter(
                        func.lower(Contributor.turing_email) == pod_email.lower()
                    ).first()
                    pod_name = pod_contributor.name if pod_contributor else pod_email.split('@')[0].replace('.', ' ').title()
                    
                    # Aggregate stats from all trainers under this POD
                    pod_totals = {
                        'unique_tasks': 0,
                        'new_tasks': 0,
                        'rework': 0,
                        'approved_tasks': 0,  # Approved new tasks
                        'approved_rework': 0,  # Approved rework tasks
                        'delivered_tasks': 0,
                        'in_delivery_queue': 0,
                        'sum_turns': 0,
                        'total_score': 0,
                        'total_reviews': 0,
                    }
                    
                    trainers_data = []
                    
                    for trainer_email in trainer_emails:
                        trainer_info = trainer_to_pod.get(trainer_email, {})
                        
                        # Get trainer name from contributor
                        trainer_contributor = session.query(Contributor).filter(
                            func.lower(Contributor.turing_email) == trainer_email.lower()
                        ).first()
                        trainer_name = trainer_contributor.name if trainer_contributor else trainer_info.get('trainer_name', trainer_email)
                        
                        # Get stats from each data source
                        hist = trainer_history.get(trainer_email, {})
                        unique_tasks = hist.get('unique_tasks', 0)
                        new_tasks = hist.get('new_tasks', 0)
                        rework = hist.get('rework', 0)
                        
                        sum_turns = trainer_turns.get(trainer_email, 0)
                        approved = trainer_approved.get(trainer_email, 0)  # Approved new tasks
                        approved_rework = trainer_approved_rework.get(trainer_email, 0)  # Approved rework tasks
                        delivered = trainer_delivered.get(trainer_email, 0)
                        in_queue = trainer_in_queue.get(trainer_email, 0)
                        avg_rating = trainer_ratings.get(trainer_email)
                        jibble_hours = trainer_jibble_hours.get(trainer_email, 0)
                        
                        # Get total_reviews from task_raw (SUM of count_reviews WHERE derived_status='Reviewed')
                        total_reviews = trainer_total_reviews.get(trainer_email, 0)
                        
                        # Calculate derived metrics (using new_tasks + rework for percentage calculations)
                        # Avg Rework = (total_completions / unique_tasks - 1) * 100
                        # Where total_completions = new_tasks + rework (all completion events from task_history_raw)
                        submissions = new_tasks + rework
                        avg_rework = round((submissions / unique_tasks) - 1, 2) if unique_tasks > 0 else None
                        rework_pct = round((rework / submissions) * 100, 1) if submissions > 0 else None
                        merged_aht = round((new_tasks * 10 + rework * 4) / submissions, 2) if submissions > 0 else None
                        # AHT of Submission = jibble_hours / (new_tasks + rework)
                        aht_submission = round(jibble_hours / submissions, 2) if submissions > 0 else None
                        
                        trainers_data.append({
                            'trainer_name': trainer_name,
                            'trainer_email': trainer_email,
                            'unique_tasks': unique_tasks,
                            'new_tasks': new_tasks,
                            'rework': rework,
                            'total_reviews': total_reviews,
                            'approved_tasks': approved,  # Approved new tasks (first completion approved)
                            'approved_rework': approved_rework,  # Approved rework (fixed someone else's task)
                            'delivered_tasks': delivered,
                            'in_delivery_queue': in_queue,
                            'avg_rework': avg_rework,
                            'rework_percent': rework_pct,
                            'avg_rating': avg_rating,
                            'merged_exp_aht': merged_aht,
                            'jibble_hours': round(jibble_hours, 2),
                            'aht_submission': aht_submission,
                            'status': trainer_info.get('status', 'Unknown'),
                        })
                        
                        # Accumulate for POD totals
                        pod_totals['unique_tasks'] += unique_tasks
                        pod_totals['new_tasks'] += new_tasks
                        pod_totals['rework'] += rework
                        pod_totals['approved_tasks'] += approved
                        pod_totals['approved_rework'] += approved_rework
                        pod_totals['delivered_tasks'] += delivered
                        pod_totals['in_delivery_queue'] += in_queue
                        pod_totals['sum_turns'] += sum_turns
                        pod_totals['total_reviews_sum'] = pod_totals.get('total_reviews_sum', 0) + total_reviews
                        pod_totals['trainer_jibble_hours'] = pod_totals.get('trainer_jibble_hours', 0) + jibble_hours
                        
                        # For avg_rating aggregation, use trainer_total_scores (from TrainerReviewStats)
                        pod_totals['total_score'] += trainer_total_scores.get(trainer_email, 0)
                        pod_totals['total_reviews'] += trainer_total_reviews.get(trainer_email, 0)
                    
                    # Filter out trainers with no data in this project
                    trainers_with_data = [t for t in trainers_data if t['unique_tasks'] > 0 or t['new_tasks'] > 0 or t['rework'] > 0 or t['total_reviews'] > 0]
                    
                    # Skip POD Leads with no trainers having data
                    if pod_totals['unique_tasks'] == 0 and pod_totals['new_tasks'] == 0 and pod_totals['rework'] == 0:
                        continue
                    
                    # Calculate POD-level metrics
                    # Avg Rework = (total_completions / unique_tasks - 1) * 100
                    pod_total_submissions = pod_totals['new_tasks'] + pod_totals['rework']
                    pod_avg_rework = round((pod_total_submissions / pod_totals['unique_tasks']) - 1, 2) if pod_totals['unique_tasks'] > 0 else None
                    pod_rework_pct = round((pod_totals['rework'] / pod_total_submissions) * 100, 1) if pod_total_submissions > 0 else None
                    pod_avg_rating = round(pod_totals['total_score'] / pod_totals['total_reviews'], 2) if pod_totals['total_reviews'] > 0 else None
                    pod_merged_aht = round((pod_totals['new_tasks'] * 10 + pod_totals['rework'] * 4) / pod_total_submissions, 2) if pod_total_submissions > 0 else None
                    
                    # Get POD Lead's own Jibble hours (not sum of trainers)
                    pod_own_jibble_hours = pod_lead_jibble_hours.get(pod_email, 0)
                    total_trainer_hours = pod_totals.get('trainer_jibble_hours', 0)
                    # AHT of Submission for POD = total_trainer_hours / (new_tasks + rework)
                    pod_aht_submission = round(total_trainer_hours / pod_total_submissions, 2) if pod_total_submissions > 0 else None
                    
                    pod_results.append({
                        'pod_lead_name': pod_name,
                        'pod_lead_email': pod_email,
                        'trainer_count': len(trainers_with_data),
                        'unique_tasks': pod_totals['unique_tasks'],
                        'new_tasks': pod_totals['new_tasks'],
                        'rework': pod_totals['rework'],
                        'total_reviews': pod_totals.get('total_reviews_sum', 0),
                        'approved_tasks': pod_totals['approved_tasks'],  # Approved new tasks
                        'approved_rework': pod_totals['approved_rework'],  # Approved rework tasks
                        'delivered_tasks': pod_totals['delivered_tasks'],
                        'in_delivery_queue': pod_totals['in_delivery_queue'],
                        'avg_rework': pod_avg_rework,
                        'rework_percent': pod_rework_pct,
                        'avg_rating': pod_avg_rating,
                        'merged_exp_aht': pod_merged_aht,
                        'jibble_hours': round(pod_own_jibble_hours, 2),
                        'total_trainer_hours': round(total_trainer_hours, 2),
                        'aht_submission': pod_aht_submission,
                        'trainers': sorted(trainers_with_data, key=lambda x: -(x['total_reviews'] or 0)),
                    })
                
                # Sort by total_reviews descending
                pod_results.sort(key=lambda x: -x['total_reviews'])
                
                return pod_results
                
        except Exception as e:
            logger.error(f"Error getting pod lead stats: {e}")
            raise

    def get_project_stats_with_pod_leads(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Get statistics aggregated by Project -> POD Lead hierarchy.
        Each project contains POD Leads with their aggregated metrics.
        """
        try:
            from sqlalchemy import case, distinct
            
            project_results = []
            
            # Get project names from config
            project_names = self.settings.project_names
            all_project_ids = self.settings.all_project_ids_list
            
            with self.db_service.get_session() as session:
                # Get POD Lead mappings
                pod_mappings = session.query(PodLeadMapping).all()
                
                # Build trainer -> pod lead mapping
                trainer_to_pod = {}
                for mapping in pod_mappings:
                    if mapping.trainer_email and mapping.pod_lead_email:
                        trainer_email = mapping.trainer_email.lower().strip()
                        trainer_to_pod[trainer_email] = {
                            'pod_lead_email': mapping.pod_lead_email.lower().strip(),
                            'pod_lead_name': mapping.pod_lead_email.split('@')[0] if mapping.pod_lead_email else 'Unknown',
                            'trainer_name': mapping.trainer_name or trainer_email.split('@')[0],
                            'status': mapping.current_status
                        }
                
                # For each project
                for project_id in all_project_ids:
                    project_name = project_names.get(project_id, f"Project {project_id}")
                    
                    # Get metrics from task_history_raw for this project
                    # FIX: Use task_history_raw.author for proper attribution
                    history_query = session.query(
                        TaskHistoryRaw.author,
                        func.count(distinct(TaskHistoryRaw.task_id)).label('unique_tasks'),
                        func.sum(case(
                            (TaskHistoryRaw.completed_status_count == 1, 1),
                            else_=0
                        )).label('new_tasks'),
                        func.sum(case(
                            (TaskHistoryRaw.completed_status_count > 1, 1),
                            else_=0
                        )).label('rework')
                    ).filter(
                        TaskHistoryRaw.new_status == 'completed',
                        TaskHistoryRaw.old_status != 'completed-approval',
                        TaskHistoryRaw.project_id == project_id,
                        TaskHistoryRaw.author.isnot(None)
                    )
                    
                    if start_date:
                        history_query = history_query.filter(TaskHistoryRaw.date >= start_date)
                    if end_date:
                        history_query = history_query.filter(TaskHistoryRaw.date <= end_date)
                    
                    history_query = history_query.group_by(TaskHistoryRaw.author)
                    history_results = history_query.all()
                    
                    # Build trainer -> history stats
                    trainer_history = {}
                    for hs in history_results:
                        if hs.author:
                            email = hs.author.lower().strip()
                            trainer_history[email] = {
                                'unique_tasks': hs.unique_tasks or 0,
                                'new_tasks': hs.new_tasks or 0,
                                'rework': hs.rework or 0
                            }
                    
                    # Get total_reviews from task_raw for this project
                    # Get total_reviews - removed followup_required filter to include all reviews
                    reviews_query = session.query(
                        TaskRaw.trainer,
                        func.sum(TaskRaw.count_reviews).label('total_reviews')
                    ).filter(
                        TaskRaw.count_reviews > 0,  # Only tasks that have been reviewed
                        TaskRaw.project_id == project_id
                    )
                    
                    if start_date:
                        reviews_query = reviews_query.filter(TaskRaw.last_completed_date >= start_date)
                    if end_date:
                        reviews_query = reviews_query.filter(TaskRaw.last_completed_date <= end_date)
                    
                    reviews_query = reviews_query.group_by(TaskRaw.trainer)
                    reviews_results = reviews_query.all()
                    
                    trainer_reviews = {}
                    for rr in reviews_results:
                        if rr.trainer:
                            email = rr.trainer.lower().strip()
                            trainer_reviews[email] = rr.total_reviews or 0
                    
                    # Get Jibble hours for all trainers
                    jibble_query = session.query(
                        JibbleHours.full_name,
                        func.sum(JibbleHours.logged_hours).label('total_hours')
                    )
                    if start_date:
                        jibble_query = jibble_query.filter(JibbleHours.entry_date >= start_date)
                    if end_date:
                        jibble_query = jibble_query.filter(JibbleHours.entry_date <= end_date)
                    
                    # Apply project filter - map project_id to project name
                    project_name_map = {
                        36: 'SysBench',
                        37: 'CFBench',
                        38: 'InverseIFEval',
                        39: 'Multichallenge',
                    }
                    if project_id and project_id in project_name_map:
                        project_pattern = f"%{project_name_map[project_id]}%"
                        jibble_query = jibble_query.filter(JibbleHours.project.ilike(project_pattern))
                    
                    jibble_query = jibble_query.group_by(JibbleHours.full_name)
                    jibble_results = jibble_query.all()
                    
                    # Build name -> hours map
                    name_to_jibble = {}
                    for jr in jibble_results:
                        if jr.full_name:
                            name_to_jibble[jr.full_name.lower().strip()] = float(jr.total_hours or 0)
                    
                    # Get contributor name by email for Jibble matching
                    contributors = session.query(Contributor).all()
                    email_to_name = {}
                    for c in contributors:
                        if c.turing_email and c.name:
                            email_to_name[c.turing_email.lower().strip()] = c.name
                    
                    # Aggregate by POD Lead
                    pod_aggregates = defaultdict(lambda: {
                        'unique_tasks': 0,
                        'new_tasks': 0,
                        'rework': 0,
                        'total_reviews': 0,
                        'trainer_count': 0,
                        'trainer_jibble_hours': 0.0
                    })
                    
                    for trainer_email, hist in trainer_history.items():
                        pod_info = trainer_to_pod.get(trainer_email)
                        if pod_info:
                            pod_email = pod_info['pod_lead_email']
                            pod_aggregates[pod_email]['unique_tasks'] += hist['unique_tasks']
                            pod_aggregates[pod_email]['new_tasks'] += hist['new_tasks']
                            pod_aggregates[pod_email]['rework'] += hist['rework']
                            pod_aggregates[pod_email]['total_reviews'] += trainer_reviews.get(trainer_email, 0)
                            pod_aggregates[pod_email]['trainer_count'] += 1
                            
                            # Get trainer's Jibble hours by name
                            trainer_name = email_to_name.get(trainer_email, '')
                            if trainer_name:
                                trainer_jibble = name_to_jibble.get(trainer_name.lower().strip(), 0)
                                pod_aggregates[pod_email]['trainer_jibble_hours'] += trainer_jibble
                    
                    # Build POD Lead list for this project
                    pod_leads_list = []
                    project_totals = {
                        'unique_tasks': 0,
                        'new_tasks': 0,
                        'rework': 0,
                        'total_reviews': 0,
                        'trainer_count': 0,
                        'trainer_jibble_hours': 0.0,
                        'pod_jibble_hours': 0.0
                    }
                    
                    for pod_email, agg in pod_aggregates.items():
                        submissions = agg['new_tasks'] + agg['rework']
                        avg_rework = round((submissions / agg['unique_tasks']) - 1, 2) if agg['unique_tasks'] > 0 else None
                        rework_pct = round((agg['rework'] / submissions) * 100, 1) if submissions > 0 else None
                        merged_aht = round((agg['new_tasks'] * 10 + agg['rework'] * 4) / submissions, 2) if submissions > 0 else None
                        
                        # Get POD Lead's own Jibble hours
                        pod_name = email_to_name.get(pod_email, '')
                        pod_own_jibble = name_to_jibble.get(pod_name.lower().strip(), 0) if pod_name else 0
                        trainer_jibble = agg['trainer_jibble_hours']
                        
                        pod_leads_list.append({
                            'pod_lead_name': pod_email.split('@')[0],
                            'pod_lead_email': pod_email,
                            'trainer_count': agg['trainer_count'],
                            'unique_tasks': agg['unique_tasks'],
                            'new_tasks': agg['new_tasks'],
                            'rework': agg['rework'],
                            'total_reviews': agg['total_reviews'],
                            'avg_rework': avg_rework,
                            'rework_percent': rework_pct,
                            'merged_exp_aht': merged_aht,
                            'pod_jibble_hours': round(pod_own_jibble, 2),
                            'trainer_jibble_hours': round(trainer_jibble, 2),
                        })
                        
                        # Accumulate project totals
                        project_totals['unique_tasks'] += agg['unique_tasks']
                        project_totals['new_tasks'] += agg['new_tasks']
                        project_totals['rework'] += agg['rework']
                        project_totals['total_reviews'] += agg['total_reviews']
                        project_totals['trainer_count'] += agg['trainer_count']
                        project_totals['trainer_jibble_hours'] += trainer_jibble
                        project_totals['pod_jibble_hours'] += pod_own_jibble
                    
                    # Sort POD leads by total_reviews
                    pod_leads_list.sort(key=lambda x: -(x['total_reviews'] or 0))
                    
                    # Calculate project-level metrics
                    proj_submissions = project_totals['new_tasks'] + project_totals['rework']
                    proj_avg_rework = round((proj_submissions / project_totals['unique_tasks']) - 1, 2) if project_totals['unique_tasks'] > 0 else None
                    proj_rework_pct = round((project_totals['rework'] / proj_submissions) * 100, 1) if proj_submissions > 0 else None
                    proj_merged_aht = round((project_totals['new_tasks'] * 10 + project_totals['rework'] * 4) / proj_submissions, 2) if proj_submissions > 0 else None
                    
                    # Calculate logged hours (trainers + POD leads)
                    total_logged_hours = project_totals['trainer_jibble_hours'] + project_totals['pod_jibble_hours']
                    
                    project_results.append({
                        'project_id': project_id,
                        'project_name': project_name,
                        'pod_lead_count': len(pod_leads_list),
                        'trainer_count': project_totals['trainer_count'],
                        'unique_tasks': project_totals['unique_tasks'],
                        'new_tasks': project_totals['new_tasks'],
                        'rework': project_totals['rework'],
                        'total_reviews': project_totals['total_reviews'],
                        'avg_rework': proj_avg_rework,
                        'rework_percent': proj_rework_pct,
                        'merged_exp_aht': proj_merged_aht,
                        'logged_hours': round(total_logged_hours, 2),
                        'total_pod_hours': round(project_totals['pod_jibble_hours'], 2),
                        'pod_leads': pod_leads_list,
                    })
                
                # Sort projects by total_reviews
                project_results.sort(key=lambda x: -(x['total_reviews'] or 0))
                
                return project_results
                
        except Exception as e:
            logger.error(f"Error getting project stats: {e}")
            raise


_query_service = None


def get_query_service() -> QueryService:
    """Get or create the global query service instance"""
    global _query_service
    if _query_service is None:
        _query_service = QueryService()
    return _query_service
