"""
PostgreSQL query service for nvidia dashboard statistics
"""
import logging
from typing import List, Dict, Any, Optional, Set
from collections import defaultdict
from sqlalchemy import func, or_, and_, text
from google.cloud import bigquery

from app.config import get_settings
from app.services.db_service import get_db_service
from app.models.db_models import ReviewDetail, Contributor, Task, WorkItem, TaskReviewedInfo, TaskAHT, ContributorTaskStats, ContributorDailyStats, ReviewerDailyStats, TaskRaw, TaskHistoryRaw, PodLeadMapping, ReviewerTrainerDailyStats, JibbleHours, TrainerReviewStats, ProjectRevenueWeekly, ProjectCostDaily, ProjectFTECostMonthly
from app.constants import get_constants

logger = logging.getLogger(__name__)


COMPLETED_PIPELINE_STATUSES = ('Completed', 'Reviewed', 'Rework', 'Validated', 'Approval')


class QueryService:
    """Service class for PostgreSQL query operations"""
    
    def __init__(self):
        self.settings = get_settings()
        self.db_service = get_db_service()
        self._allowed_quality_dimensions_cache: Optional[Set[str]] = None
        self._constants = get_constants()

    @staticmethod
    def _valid_task_ids_subquery(session, project_ids=None):
        """Task IDs whose current derived_status is still in the completed pipeline.
        
        Tasks that regressed to In Progress, Unclaimed, Improper, Obsolete etc.
        are excluded so they don't inflate unique/new/rework counts.
        """
        q = session.query(TaskRaw.task_id).filter(
            TaskRaw.derived_status.in_(COMPLETED_PIPELINE_STATUSES)
        )
        if project_ids:
            q = q.filter(TaskRaw.project_id.in_(project_ids))
        return q.subquery()
    
    def _calculate_merged_aht(self, tasks_with_new: int, tasks_with_rework: int, 
                               unique_tasks: int, project_id: int = None) -> Optional[float]:
        """
        Calculate merged expected AHT using per-project AHT when available.
        
        Formula: accounted_hours / unique_tasks
        Where accounted_hours = (tasks_with_new * NEW_AHT) + (tasks_with_rework * REWORK_AHT)
        """
        if unique_tasks == 0:
            return None
        new_aht, rework_aht = self._get_project_aht(project_id)
        aht_config = self._constants.aht
        return aht_config.calculate_merged_aht(
            tasks_with_new, tasks_with_rework, unique_tasks,
            new_task_aht=new_aht, rework_aht=rework_aht
        )
    
    def _calculate_accounted_hours(self, tasks_with_new: int, tasks_with_rework: int,
                                    project_id: int = None) -> float:
        """
        Calculate accounted hours using per-project AHT when available.
        
        Formula: (tasks_with_new * NEW_AHT) + (tasks_with_rework * REWORK_AHT)
        """
        new_aht, rework_aht = self._get_project_aht(project_id)
        aht_config = self._constants.aht
        return aht_config.calculate_trainer_accounted_hours(
            tasks_with_new, tasks_with_rework,
            new_task_aht=new_aht, rework_aht=rework_aht
        )
    
    def _get_project_aht(self, project_id: int = None) -> tuple:
        """Return (new_task_aht, rework_aht) for a project, falling back to defaults."""
        if project_id is not None:
            aht = self._constants.daily_targets.get_aht(project_id)
            return aht.get('new_task_aht', self._constants.aht.DEFAULT_NEW_TASK_AHT), \
                   aht.get('rework_aht', self._constants.aht.DEFAULT_REWORK_AHT)
        return None, None
    
    def _calculate_task_accounted_hours(self, is_new: bool, rework_count: int) -> float:
        """
        Calculate accounted hours for a single task.
        
        Formula: (NEW_AHT if is_new else 0) + (REWORK_AHT * min(rework_count, MAX_REWORKS_TO_REWARD))
        
        Args:
            is_new: True if trainer did the first completion
            rework_count: Number of rework submissions by trainer on this task
        """
        aht_config = self._constants.aht
        return aht_config.calculate_task_accounted_hours(is_new, rework_count)
    
    def _get_allowed_quality_dimensions(self, force_refresh: bool = False) -> Set[str]:
        """Fetch allowed quality dimensions from BigQuery"""
        if not force_refresh and self._allowed_quality_dimensions_cache is not None:
            return self._allowed_quality_dimensions_cache
        
        try:
            client = bigquery.Client(project=self.settings.gcp_project_id)
            
            query = f"""
            SELECT DISTINCT name 
            FROM `{self.settings.gcp_project_id}.{self.settings.bigquery_dataset}.project_quality_dimension` 
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
                
                valid_tasks = self._valid_task_ids_subquery(session, filter_project_ids)
                
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
                    )).label('rework'),
                    func.count(distinct(case(
                        (TaskHistoryRaw.completed_status_count > 1, TaskHistoryRaw.task_id),
                        else_=None
                    ))).label('tasks_with_rework')
                ).filter(
                    TaskHistoryRaw.new_status == 'completed',
                    TaskHistoryRaw.old_status != 'completed-approval',
                    TaskHistoryRaw.author.isnot(None),
                    TaskHistoryRaw.task_id.in_(session.query(valid_tasks))
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
                            'rework': hs.rework or 0,
                            'tasks_with_rework': hs.tasks_with_rework or 0  # NEW: unique tasks with rework
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
                # Get Jibble Hours for trainers (filtered by date range)
                # Uses turing_email on jibble_hours (populated during sync
                # via jibble_email_mapping: member_code -> turing_email)
                # ---------------------------------------------------------
                trainer_jibble_map = {}
                
                constants = get_constants()
                project_jibble_map = constants.projects.PROJECT_ID_TO_NAME
                
                try:
                    start_date = filters.get('start_date') if filters else None
                    end_date = filters.get('end_date') if filters else None
                    
                    jibble_projects_to_filter = []
                    jibble_config = self._constants.jibble
                    if filter_project_ids:
                        for pid in filter_project_ids:
                            jibble_names = jibble_config.PROJECT_ID_TO_JIBBLE_NAMES.get(pid, [])
                            if jibble_names:
                                jibble_projects_to_filter.extend(jibble_names)
                            elif pid in project_jibble_map:
                                jibble_projects_to_filter.append(project_jibble_map[pid])
                    
                    jibble_query = session.query(
                        JibbleHours.turing_email,
                        func.sum(JibbleHours.logged_hours).label('total_hours')
                    ).filter(
                        JibbleHours.turing_email.isnot(None),
                    )
                    
                    if jibble_projects_to_filter:
                        jibble_query = jibble_query.filter(JibbleHours.project.in_(jibble_projects_to_filter))
                    
                    if start_date:
                        jibble_query = jibble_query.filter(JibbleHours.entry_date >= start_date)
                    if end_date:
                        jibble_query = jibble_query.filter(JibbleHours.entry_date <= end_date)
                    
                    jibble_query = jibble_query.group_by(JibbleHours.turing_email)
                    jibble_results = jibble_query.all()
                    
                    for ar in jibble_results:
                        if ar.turing_email:
                            trainer_jibble_map[ar.turing_email.lower().strip()] = float(ar.total_hours or 0)
                    
                    date_range_msg = f" for {start_date} to {end_date}" if start_date or end_date else " (all time)"
                    project_msg = f", projects: {jibble_projects_to_filter}" if jibble_projects_to_filter else " (all projects)"
                    logger.info(f"Jibble hours: {len(trainer_jibble_map)} trainers mapped via turing_email{date_range_msg}{project_msg}")
                except Exception as jibble_err:
                    logger.warning(f"Failed to fetch Jibble hours: {jibble_err}")
                
                result = []
                
                overlap = set(history_map.keys()) & set(trainer_jibble_map.keys())
                logger.info(f"Email overlap between history and jibble: {len(overlap)} trainers out of {len(history_map)} in history")
                
                # Iterate over all trainers with history data
                for email, hist_stats in history_map.items():
                    contributor_id = email_to_id.get(email)
                    contributor_info = contributor_map.get(contributor_id, {}) if contributor_id else {}
                    name = contributor_info.get('name', email.split('@')[0] if email else 'Unknown')
                    status = contributor_info.get('status', None)
                    
                    unique_tasks = hist_stats.get('unique_tasks', 0)
                    new_tasks = hist_stats.get('new_tasks', 0)
                    rework = hist_stats.get('rework', 0)
                    tasks_with_rework = hist_stats.get('tasks_with_rework', 0)  # NEW: unique tasks with rework
                    
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
                    
                    accounted_hours = self._calculate_accounted_hours(new_tasks, tasks_with_rework, project_id=project_id) if (new_tasks + rework) > 0 else 0
                    merged_exp_aht = self._calculate_merged_aht(new_tasks, tasks_with_rework, unique_tasks, project_id=project_id)
                    
                    # Get review stats
                    review_info = trainer_reviews_map.get(email, {})
                    total_reviews = review_info.get('total_reviews', 0)
                    avg_rating = review_info.get('avg_rating')
                    
                    # Get approved/delivery stats
                    approved = trainer_approved.get(email, 0)
                    approved_rework = trainer_approved_rework.get(email, 0)
                    delivered = trainer_delivered.get(email, 0)
                    in_queue = trainer_in_queue.get(email, 0)
                    
                    jibble_hours = trainer_jibble_map.get(email, None)
                    
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
                        'merged_exp_aht': round(merged_exp_aht, 2) if merged_exp_aht is not None else None,  # NEW
                        'accounted_hours': round(accounted_hours, 2),  # NEW
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
                name_to_pod = {}
                
                for mapping in pod_mappings:
                    if mapping.trainer_email and mapping.pod_lead_email:
                        trainer_email = mapping.trainer_email.lower().strip()
                        pod_email = mapping.pod_lead_email.lower().strip()
                        trainer_to_pod[trainer_email] = {
                            'pod_lead_email': pod_email,
                            'trainer_name': mapping.trainer_name,
                            'trainer_email': trainer_email,
                            'status': mapping.current_status,
                            'role': mapping.role or 'Trainer',
                        }
                        pod_trainers[pod_email].append(trainer_email)
                        if mapping.trainer_name:
                            name_to_pod[mapping.trainer_name.lower().strip()] = trainer_to_pod[trainer_email]
                
                logger.info(f"Found {len(trainer_to_pod)} trainer-pod mappings, {len(pod_trainers)} unique POD Leads, filtering by project_id: {filter_project_ids}")
                
                # ---------------------------------------------------------
                # STEP 1: Get metrics from task_history_raw using actual author
                # Only count tasks whose current derived_status is still in the completed pipeline
                # ---------------------------------------------------------
                valid_tasks_pod = self._valid_task_ids_subquery(session, filter_project_ids)
                
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
                    )).label('rework'),
                    func.count(distinct(case(
                        (TaskHistoryRaw.completed_status_count > 1, TaskHistoryRaw.task_id),
                        else_=None
                    ))).label('tasks_with_rework')
                ).filter(
                    TaskHistoryRaw.new_status == 'completed',
                    TaskHistoryRaw.old_status != 'completed-approval',
                    TaskHistoryRaw.project_id.in_(filter_project_ids),
                    TaskHistoryRaw.author.isnot(None),
                    TaskHistoryRaw.task_id.in_(session.query(valid_tasks_pod))
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
                            'rework': hs.rework or 0,
                            'tasks_with_rework': hs.tasks_with_rework or 0  # NEW: unique tasks with rework
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
                # Filter by delivery_date (when the batch was actually delivered)
                delivered_tasks_query = session.query(
                    TaskRaw.task_id
                ).filter(
                    func.lower(TaskRaw.delivery_status) == 'delivered',
                    TaskRaw.project_id.in_(filter_project_ids)
                )
                if start_date:
                    delivered_tasks_query = delivered_tasks_query.filter(TaskRaw.delivery_date >= start_date)
                if end_date:
                    delivered_tasks_query = delivered_tasks_query.filter(TaskRaw.delivery_date <= end_date)
                delivered_task_ids = [r.task_id for r in delivered_tasks_query.all()]
                
                # Get in-queue task IDs
                # NOTE: Don't filter by date - "In Queue" is a CURRENT status, not historical
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
                # No date filter - show current queue status regardless of timeframe
                in_queue_task_ids = [r.task_id for r in in_queue_tasks_query.all()]
                
                logger.info(f"Found {len(delivered_task_ids)} delivered tasks, {len(in_queue_task_ids)} in-queue tasks")
                
                # Attribute delivery stats to last completer
                trainer_delivered = {}
                trainer_in_queue = {}
                
                all_delivery_task_ids = list(set(delivered_task_ids + in_queue_task_ids))
                delivery_task_completions = defaultdict(list)
                
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
                # STEP 3.6: Compute trainer-level revenue
                #
                # For each delivered task, look up the bill_rate_task from
                # ProjectRevenueWeekly for that project + delivery week.
                # trainer_revenue = SUM(bill_rate_task for each delivered task)
                #
                # Handles:
                # - Different bill rates per week for the same project
                # - MC vs MC-Advanced split via batch_name (both project_id=37)
                # - Tasks outside any sheet week get rate=0 (no revenue)
                # ---------------------------------------------------------
                trainer_revenue = {}
                
                if delivered_task_ids:
                    # Get rate entries from ProjectRevenueWeekly
                    from datetime import timedelta as td
                    rate_rows = session.query(
                        ProjectRevenueWeekly.jibble_project_name,
                        ProjectRevenueWeekly.week_start_date,
                        ProjectRevenueWeekly.week_end_date,
                        ProjectRevenueWeekly.bill_rate_task,
                    ).filter(
                        ProjectRevenueWeekly.bill_rate_task.isnot(None),
                        ProjectRevenueWeekly.bill_rate_task > 0,
                    ).all()
                    
                    rate_entries = []
                    for rr in rate_rows:
                        rate_entries.append({
                            'jibble_name': rr.jibble_project_name,
                            'week_start': rr.week_start_date,
                            'week_end': rr.week_end_date or (rr.week_start_date + td(days=6)),
                            'bill_rate': float(rr.bill_rate_task),
                        })
                    
                    # Get delivered tasks with batch_name and delivery_date
                    delivered_task_details = session.query(
                        TaskRaw.task_id,
                        TaskRaw.project_id,
                        TaskRaw.batch_name,
                        TaskRaw.delivery_date,
                    ).filter(
                        TaskRaw.task_id.in_(delivered_task_ids),
                    ).all()
                    
                    # Map task_id -> (project_id, batch_name, delivery_date)
                    task_detail_map = {}
                    for td_row in delivered_task_details:
                        task_detail_map[td_row.task_id] = {
                            'project_id': td_row.project_id,
                            'batch_name': td_row.batch_name,
                            'delivery_date': td_row.delivery_date,
                        }
                    
                    def _get_jibble_name(pid, batch_name):
                        """Map project_id to sheet's jibble_project_name."""
                        _pid_map = {
                            36: 'Nvidia - SysBench',
                            37: 'Nvidia - Multichallenge',
                            38: 'Nvidia - InverseIFEval',
                            39: 'Nvidia - CFBench Multilingual',
                            59: 'NVIDIA_STEM Math_Proof_Eval',
                        }
                        return _pid_map.get(pid, '')
                    
                    def _find_bill_rate(jibble_name, delivery_date):
                        """Find bill_rate for a project + delivery date from rate entries."""
                        if not delivery_date or not jibble_name:
                            return 0
                        for entry in rate_entries:
                            if entry['jibble_name'] == jibble_name and entry['week_start'] <= delivery_date <= entry['week_end']:
                                return entry['bill_rate']
                        return 0
                    
                    # For each delivered task, find last completer and compute revenue
                    for task_id in delivered_task_ids:
                        detail = task_detail_map.get(task_id)
                        if not detail or not detail['delivery_date']:
                            continue
                        
                        # Get trainer attribution (last completer)
                        completions = delivery_task_completions.get(task_id, [])
                        if completions:
                            completions_sorted = sorted(completions, key=lambda x: x['time_stamp'] or '')
                            trainer_email = completions_sorted[-1]['author']
                        else:
                            continue
                        
                        if not trainer_email:
                            continue
                        
                        jibble_name = _get_jibble_name(detail['project_id'], detail['batch_name'])
                        bill_rate = _find_bill_rate(jibble_name, detail['delivery_date'])
                        
                        if bill_rate > 0:
                            trainer_revenue[trainer_email] = trainer_revenue.get(trainer_email, 0) + bill_rate
                    
                    logger.info(f"Computed revenue for {len(trainer_revenue)} trainers, total=${sum(trainer_revenue.values()):,.0f}")
                
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
                
                # Query for MANUAL reviews
                trainer_review_query = session.query(
                    TrainerReviewStats.trainer_email,
                    func.count(TrainerReviewStats.review_id).label('total_reviews'),
                    func.sum(TrainerReviewStats.score).label('total_score')
                ).filter(
                    TrainerReviewStats.project_id.in_(filter_project_ids),
                    TrainerReviewStats.score.isnot(None),
                    or_(TrainerReviewStats.review_type == 'manual', TrainerReviewStats.review_type.is_(None))
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
                
                logger.info(f"Found trainer-attributed manual reviews for {len(trainer_total_reviews)} trainers")
                
                # Query for AGENTIC (auto) reviews
                agentic_review_query = session.query(
                    TrainerReviewStats.trainer_email,
                    func.count(TrainerReviewStats.review_id).label('total_reviews'),
                    func.sum(TrainerReviewStats.score).label('total_score')
                ).filter(
                    TrainerReviewStats.project_id.in_(filter_project_ids),
                    TrainerReviewStats.score.isnot(None),
                    TrainerReviewStats.review_type == 'auto'
                )
                
                if start_date:
                    agentic_review_query = agentic_review_query.filter(TrainerReviewStats.review_date >= start_date)
                if end_date:
                    agentic_review_query = agentic_review_query.filter(TrainerReviewStats.review_date <= end_date)
                
                agentic_review_query = agentic_review_query.group_by(TrainerReviewStats.trainer_email)
                agentic_review_results = agentic_review_query.all()
                
                trainer_agentic_ratings = {}
                trainer_agentic_reviews = {}
                trainer_agentic_scores = {}  # For POD-level aggregation
                for r in agentic_review_results:
                    if r.trainer_email:
                        email = r.trainer_email.lower().strip()
                        trainer_agentic_reviews[email] = r.total_reviews or 0
                        trainer_agentic_scores[email] = float(r.total_score or 0)
                        if r.total_reviews and r.total_reviews > 0 and r.total_score:
                            trainer_agentic_ratings[email] = round(float(r.total_score) / float(r.total_reviews), 2)
                
                logger.info(f"Found trainer-attributed agentic reviews for {len(trainer_agentic_reviews)} trainers")
                
                # ---------------------------------------------------------
                # STEP 6: Get Jibble hours for trainers AND POD Leads
                # Uses turing_email on jibble_hours (populated during sync
                # via jibble_email_mapping: member_code -> turing_email)
                # CRITICAL: Filter by specific project to avoid cross-project counting!
                # ---------------------------------------------------------
                trainer_jibble_hours = {}
                pod_lead_jibble_hours = {}
                
                # Get all POD lead emails for classification
                all_pod_emails = set(pod_trainers.keys())
                
                # Map project IDs to Jibble project names (from centralized constants)
                constants = get_constants()
                project_jibble_map = constants.projects.PROJECT_ID_TO_NAME
                jibble_config = constants.jibble
                
                # Build list of Jibble project names to filter (no swap - use original)
                jibble_projects_to_filter = []
                for pid in filter_project_ids:
                    # Get Jibble project names for this project ID from config
                    jibble_names = jibble_config.PROJECT_ID_TO_JIBBLE_NAMES.get(pid, [])
                    if jibble_names:
                        jibble_projects_to_filter.extend(jibble_names)
                    elif pid in project_jibble_map:
                        jibble_projects_to_filter.append(project_jibble_map[pid])
                
                jibble_query = session.query(
                    JibbleHours.turing_email,
                    func.sum(JibbleHours.logged_hours).label('total_hours')
                ).filter(
                    JibbleHours.turing_email.isnot(None),
                )
                
                if jibble_projects_to_filter:
                    jibble_query = jibble_query.filter(JibbleHours.project.in_(jibble_projects_to_filter))
                
                if start_date:
                    jibble_query = jibble_query.filter(JibbleHours.entry_date >= start_date)
                if end_date:
                    jibble_query = jibble_query.filter(JibbleHours.entry_date <= end_date)
                
                jibble_query = jibble_query.group_by(JibbleHours.turing_email)
                jibble_results = jibble_query.all()
                
                for ar in jibble_results:
                    if ar.turing_email:
                        email = ar.turing_email.lower().strip()
                        hours = float(ar.total_hours or 0)
                        if email in all_pod_emails:
                            pod_lead_jibble_hours[email] = hours
                        else:
                            trainer_jibble_hours[email] = hours
                
                logger.info(f"Jibble hours: {len(trainer_jibble_hours)} trainers, {len(pod_lead_jibble_hours)} POD leads")
                
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
                        tasks_with_rework = hist.get('tasks_with_rework', 0)  # NEW: unique tasks with rework
                        
                        sum_turns = trainer_turns.get(trainer_email, 0)
                        approved = trainer_approved.get(trainer_email, 0)  # Approved new tasks
                        approved_rework = trainer_approved_rework.get(trainer_email, 0)  # Approved rework tasks
                        delivered = trainer_delivered.get(trainer_email, 0)
                        in_queue = trainer_in_queue.get(trainer_email, 0)
                        avg_rating = trainer_ratings.get(trainer_email)
                        jibble_hours = trainer_jibble_hours.get(trainer_email, 0)
                        
                        # Get total_reviews from task_raw (SUM of count_reviews WHERE derived_status='Reviewed')
                        total_reviews = trainer_total_reviews.get(trainer_email, 0)
                        
                        # Get agentic review metrics
                        agentic_reviews = trainer_agentic_reviews.get(trainer_email, 0)
                        agentic_rating = trainer_agentic_ratings.get(trainer_email)
                        
                        # Calculate derived metrics (using new_tasks + rework for percentage calculations)
                        # Avg Rework = (total_completions / unique_tasks - 1) * 100
                        # Where total_completions = new_tasks + rework (all completion events from task_history_raw)
                        submissions = new_tasks + rework
                        avg_rework = round((submissions / unique_tasks) - 1, 2) if unique_tasks > 0 else None
                        rework_pct = round((rework / submissions) * 100, 1) if submissions > 0 else None
                        merged_aht = self._calculate_merged_aht(new_tasks, tasks_with_rework, unique_tasks, project_id=project_id)
                        aht_submission = round(jibble_hours / submissions, 2) if submissions > 0 else None
                        
                        trainer_rev = round(trainer_revenue.get(trainer_email, 0), 2)
                        
                        trainers_data.append({
                            'trainer_name': trainer_name,
                            'trainer_email': trainer_email,
                            'unique_tasks': unique_tasks,
                            'new_tasks': new_tasks,
                            'rework': rework,
                            'total_reviews': total_reviews,
                            'agentic_reviews': agentic_reviews,
                            'agentic_rating': agentic_rating,
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
                            'revenue': trainer_rev,
                            'status': trainer_info.get('status', 'Unknown'),
                        })
                        
                        # Accumulate for POD totals
                        pod_totals['unique_tasks'] += unique_tasks
                        pod_totals['new_tasks'] += new_tasks
                        pod_totals['rework'] += rework
                        pod_totals['tasks_with_rework'] = pod_totals.get('tasks_with_rework', 0) + tasks_with_rework  # NEW
                        pod_totals['approved_tasks'] += approved
                        pod_totals['approved_rework'] += approved_rework
                        pod_totals['delivered_tasks'] += delivered
                        pod_totals['in_delivery_queue'] += in_queue
                        pod_totals['sum_turns'] += sum_turns
                        pod_totals['total_reviews_sum'] = pod_totals.get('total_reviews_sum', 0) + total_reviews
                        
                        # FIX: Only add Jibble hours if trainer is NOT the same as POD lead
                        # This prevents double-counting when POD lead is listed as their own trainer
                        if trainer_email.lower().strip() != pod_email.lower().strip():
                            pod_totals['trainer_jibble_hours'] = pod_totals.get('trainer_jibble_hours', 0) + jibble_hours
                        else:
                            pod_totals['trainer_jibble_hours'] = pod_totals.get('trainer_jibble_hours', 0)
                        
                        # For avg_rating aggregation, use trainer_total_scores (from TrainerReviewStats)
                        pod_totals['total_score'] += trainer_total_scores.get(trainer_email, 0)
                        pod_totals['total_reviews'] += trainer_total_reviews.get(trainer_email, 0)
                        
                        # Agentic review aggregation
                        pod_totals['agentic_reviews'] = pod_totals.get('agentic_reviews', 0) + trainer_agentic_reviews.get(trainer_email, 0)
                        pod_totals['agentic_score'] = pod_totals.get('agentic_score', 0) + trainer_agentic_scores.get(trainer_email, 0)
                        
                        # Revenue accumulation
                        pod_totals['revenue'] = pod_totals.get('revenue', 0) + trainer_rev
                    
                    # Filter out trainers with no data in this project
                    # FIX: Also include trainers who have delivery data (in_queue/delivered) but no task completions
                    trainers_with_data = [t for t in trainers_data if 
                        t['unique_tasks'] > 0 or t['new_tasks'] > 0 or t['rework'] > 0 or 
                        t['total_reviews'] > 0 or t.get('delivered_tasks', 0) > 0 or t.get('in_delivery_queue', 0) > 0]
                    
                    # Skip POD Leads with no trainers having any data (task OR delivery)
                    # FIX: Also consider delivery data when deciding to include a POD Lead
                    if (pod_totals['unique_tasks'] == 0 and pod_totals['new_tasks'] == 0 and 
                        pod_totals['rework'] == 0 and pod_totals['delivered_tasks'] == 0 and 
                        pod_totals['in_delivery_queue'] == 0):
                        continue
                    
                    # Calculate POD-level metrics
                    # Avg Rework = (total_completions / unique_tasks - 1) * 100
                    pod_total_submissions = pod_totals['new_tasks'] + pod_totals['rework']
                    pod_avg_rework = round((pod_total_submissions / pod_totals['unique_tasks']) - 1, 2) if pod_totals['unique_tasks'] > 0 else None
                    pod_rework_pct = round((pod_totals['rework'] / pod_total_submissions) * 100, 1) if pod_total_submissions > 0 else None
                    pod_avg_rating = round(pod_totals['total_score'] / pod_totals['total_reviews'], 2) if pod_totals['total_reviews'] > 0 else None
                    pod_merged_aht = self._calculate_merged_aht(
                        pod_totals['new_tasks'], 
                        pod_totals.get('tasks_with_rework', 0), 
                        pod_totals['unique_tasks'],
                        project_id=project_id
                    )
                    
                    # Agentic review metrics at POD level
                    pod_agentic_reviews = pod_totals.get('agentic_reviews', 0)
                    pod_agentic_score = pod_totals.get('agentic_score', 0)
                    pod_agentic_rating = round(pod_agentic_score / pod_agentic_reviews, 2) if pod_agentic_reviews > 0 else None
                    
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
                        'agentic_reviews': pod_agentic_reviews,
                        'agentic_rating': pod_agentic_rating,
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
                        'revenue': round(pod_totals.get('revenue', 0), 2),
                        'trainers': sorted(trainers_with_data, key=lambda x: -(x['total_reviews'] or 0)),
                    })
                
                # ---------------------------------------------------------
                # STEP 8: Handle trainers WITHOUT POD Lead mapping ("No Pod Lead")
                # These are trainers with data in trainer_history but not in trainer_to_pod
                # Also includes trainers with delivery data but no task history
                # ---------------------------------------------------------
                NO_POD_LEAD_EMAIL = "no_pod_lead"
                NO_POD_LEAD_NAME = "No Pod Lead"
                
                # Build email_to_name for name-based fallback
                all_contributors = session.query(Contributor).all()
                email_to_name_fallback = {}
                for c in all_contributors:
                    if c.turing_email and c.name:
                        email_to_name_fallback[c.turing_email.lower().strip()] = c.name

                # Find trainers with data but no mapping (from task history)
                # Try name-based fallback before declaring unmapped
                unmapped_trainers_from_history = set()
                for trainer_email, hist in trainer_history.items():
                    if trainer_email not in trainer_to_pod:
                        contributor_name = email_to_name_fallback.get(trainer_email, '').lower().strip()
                        if contributor_name and contributor_name in name_to_pod:
                            matched_info = name_to_pod[contributor_name]
                            trainer_to_pod[trainer_email] = matched_info
                            pod_trainers[matched_info['pod_lead_email']].append(trainer_email)
                            logger.info(f"Name-based fallback matched '{contributor_name}' ({trainer_email}) to pod lead {matched_info['pod_lead_email']}")
                        else:
                            unmapped_trainers_from_history.add(trainer_email)
                
                # Also find unmapped trainers who have delivery data but no task history
                delivery_trainers = set(trainer_in_queue.keys()) | set(trainer_delivered.keys())
                unmapped_delivery_trainers = set()
                for te in delivery_trainers:
                    if te not in trainer_to_pod and te not in unmapped_trainers_from_history:
                        contributor_name = email_to_name_fallback.get(te, '').lower().strip()
                        if contributor_name and contributor_name in name_to_pod:
                            matched_info = name_to_pod[contributor_name]
                            trainer_to_pod[te] = matched_info
                            pod_trainers[matched_info['pod_lead_email']].append(te)
                        else:
                            unmapped_delivery_trainers.add(te)
                
                # Combine all unmapped trainers
                unmapped_trainers = list(unmapped_trainers_from_history | unmapped_delivery_trainers)
                
                logger.info(f"Found {len(unmapped_trainers_from_history)} unmapped trainers with task history, {len(unmapped_delivery_trainers)} with delivery data only")
                
                if unmapped_trainers:
                    logger.info(f"Found {len(unmapped_trainers)} unmapped trainers - adding to 'No Pod Lead' category")
                    
                    # Build "No Pod Lead" entry with unmapped trainers
                    no_pod_totals = {
                        'unique_tasks': 0,
                        'new_tasks': 0,
                        'rework': 0,
                        'tasks_with_rework': 0,  # NEW: unique tasks with at least 1 rework
                        'approved_tasks': 0,
                        'approved_rework': 0,
                        'delivered_tasks': 0,
                        'in_delivery_queue': 0,
                        'sum_turns': 0,
                        'total_score': 0,
                        'total_reviews': 0,
                        'agentic_reviews': 0,
                        'agentic_score': 0,
                        'trainer_jibble_hours': 0,
                    }
                    
                    unmapped_trainers_data = []
                    
                    for trainer_email in unmapped_trainers:
                        # Get trainer name from contributor table
                        trainer_contributor = session.query(Contributor).filter(
                            func.lower(Contributor.turing_email) == trainer_email.lower()
                        ).first()
                        trainer_name = trainer_contributor.name if trainer_contributor else trainer_email.split('@')[0].replace('.', ' ').title()
                        
                        # Get stats from data sources
                        hist = trainer_history.get(trainer_email, {})
                        unique_tasks = hist.get('unique_tasks', 0)
                        new_tasks = hist.get('new_tasks', 0)
                        rework = hist.get('rework', 0)
                        tasks_with_rework = hist.get('tasks_with_rework', 0)  # NEW: unique tasks with rework
                        
                        sum_turns = trainer_turns.get(trainer_email, 0)
                        approved = trainer_approved.get(trainer_email, 0)
                        approved_rework = trainer_approved_rework.get(trainer_email, 0)
                        delivered = trainer_delivered.get(trainer_email, 0)
                        in_queue = trainer_in_queue.get(trainer_email, 0)
                        avg_rating = trainer_ratings.get(trainer_email)
                        jibble_hours = trainer_jibble_hours.get(trainer_email, 0)
                        total_reviews = trainer_total_reviews.get(trainer_email, 0)
                        agentic_reviews = trainer_agentic_reviews.get(trainer_email, 0)
                        agentic_rating = trainer_agentic_ratings.get(trainer_email)
                        
                        # Calculate derived metrics
                        submissions = new_tasks + rework
                        avg_rework = round((submissions / unique_tasks) - 1, 2) if unique_tasks > 0 else None
                        rework_pct = round((rework / submissions) * 100, 1) if submissions > 0 else None
                        merged_aht = self._calculate_merged_aht(new_tasks, tasks_with_rework, unique_tasks, project_id=project_id)
                        aht_submission = round(jibble_hours / submissions, 2) if submissions > 0 else None
                        
                        trainer_rev = round(trainer_revenue.get(trainer_email, 0), 2)
                        
                        if unique_tasks > 0 or new_tasks > 0 or rework > 0 or total_reviews > 0 or delivered > 0 or in_queue > 0:
                            unmapped_trainers_data.append({
                                'trainer_name': trainer_name,
                                'trainer_email': trainer_email,
                                'unique_tasks': unique_tasks,
                                'new_tasks': new_tasks,
                                'rework': rework,
                                'total_reviews': total_reviews,
                                'agentic_reviews': agentic_reviews,
                                'agentic_rating': agentic_rating,
                                'approved_tasks': approved,
                                'approved_rework': approved_rework,
                                'delivered_tasks': delivered,
                                'in_delivery_queue': in_queue,
                                'avg_rework': avg_rework,
                                'rework_percent': rework_pct,
                                'avg_rating': avg_rating,
                                'merged_exp_aht': merged_aht,
                                'jibble_hours': round(jibble_hours, 2),
                                'aht_submission': aht_submission,
                                'revenue': trainer_rev,
                                'status': 'unmapped',
                            })
                            
                            # Accumulate totals
                            no_pod_totals['unique_tasks'] += unique_tasks
                            no_pod_totals['new_tasks'] += new_tasks
                            no_pod_totals['rework'] += rework
                            no_pod_totals['tasks_with_rework'] = no_pod_totals.get('tasks_with_rework', 0) + tasks_with_rework  # NEW
                            no_pod_totals['approved_tasks'] += approved
                            no_pod_totals['approved_rework'] += approved_rework
                            no_pod_totals['delivered_tasks'] += delivered
                            no_pod_totals['in_delivery_queue'] += in_queue
                            no_pod_totals['sum_turns'] += sum_turns
                            no_pod_totals['total_reviews'] += total_reviews
                            no_pod_totals['total_score'] += trainer_total_scores.get(trainer_email, 0)
                            no_pod_totals['agentic_reviews'] += agentic_reviews
                            no_pod_totals['agentic_score'] += trainer_agentic_scores.get(trainer_email, 0)
                            no_pod_totals['trainer_jibble_hours'] += jibble_hours
                            no_pod_totals['revenue'] = no_pod_totals.get('revenue', 0) + trainer_rev
                    
                    # Only add "No Pod Lead" entry if there are trainers with data
                    if unmapped_trainers_data:
                        no_pod_submissions = no_pod_totals['new_tasks'] + no_pod_totals['rework']
                        no_pod_avg_rework = round((no_pod_submissions / no_pod_totals['unique_tasks']) - 1, 2) if no_pod_totals['unique_tasks'] > 0 else None
                        no_pod_rework_pct = round((no_pod_totals['rework'] / no_pod_submissions) * 100, 1) if no_pod_submissions > 0 else None
                        no_pod_avg_rating = round(no_pod_totals['total_score'] / no_pod_totals['total_reviews'], 2) if no_pod_totals['total_reviews'] > 0 else None
                        no_pod_merged_aht = self._calculate_merged_aht(
                            no_pod_totals['new_tasks'], 
                            no_pod_totals.get('tasks_with_rework', 0), 
                            no_pod_totals['unique_tasks'],
                            project_id=project_id
                        )
                        no_pod_agentic_rating = round(no_pod_totals['agentic_score'] / no_pod_totals['agentic_reviews'], 2) if no_pod_totals['agentic_reviews'] > 0 else None
                        no_pod_aht_submission = round(no_pod_totals['trainer_jibble_hours'] / no_pod_submissions, 2) if no_pod_submissions > 0 else None
                        
                        pod_results.append({
                            'pod_lead_name': NO_POD_LEAD_NAME,
                            'pod_lead_email': NO_POD_LEAD_EMAIL,
                            'trainer_count': len(unmapped_trainers_data),
                            'unique_tasks': no_pod_totals['unique_tasks'],
                            'new_tasks': no_pod_totals['new_tasks'],
                            'rework': no_pod_totals['rework'],
                            'total_reviews': no_pod_totals['total_reviews'],
                            'agentic_reviews': no_pod_totals['agentic_reviews'],
                            'agentic_rating': no_pod_agentic_rating,
                            'approved_tasks': no_pod_totals['approved_tasks'],
                            'approved_rework': no_pod_totals['approved_rework'],
                            'delivered_tasks': no_pod_totals['delivered_tasks'],
                            'in_delivery_queue': no_pod_totals['in_delivery_queue'],
                            'avg_rework': no_pod_avg_rework,
                            'rework_percent': no_pod_rework_pct,
                            'avg_rating': no_pod_avg_rating,
                            'merged_exp_aht': no_pod_merged_aht,
                            'jibble_hours': 0,  # No POD lead hours
                            'total_trainer_hours': round(no_pod_totals['trainer_jibble_hours'], 2),
                            'aht_submission': no_pod_aht_submission,
                            'revenue': round(no_pod_totals.get('revenue', 0), 2),
                            'trainers': sorted(unmapped_trainers_data, key=lambda x: -(x['total_reviews'] or 0)),
                        })
                        
                        logger.info(f"Added 'No Pod Lead' with {len(unmapped_trainers_data)} trainers, {no_pod_totals['unique_tasks']} unique tasks")
                
                # Sort by total_reviews descending
                pod_results.sort(key=lambda x: -x['total_reviews'])
                
                return pod_results
                
        except Exception as e:
            logger.error(f"Error getting pod lead stats: {e}")
            raise

    def get_project_stats_with_pod_leads(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        include_tasks: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Get statistics aggregated by Project -> POD Lead hierarchy.
        Each project contains POD Leads with their aggregated metrics.
        
        Args:
            start_date: Start date filter (YYYY-MM-DD)
            end_date: End date filter (YYYY-MM-DD)
            include_tasks: If True, include task-level details under each trainer
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
                
                # Build trainer -> pod lead mapping (with name-based fallback)
                trainer_to_pod = {}
                name_to_pod = {}
                for mapping in pod_mappings:
                    if mapping.trainer_email and mapping.pod_lead_email:
                        trainer_email = mapping.trainer_email.lower().strip()
                        trainer_to_pod[trainer_email] = {
                            'pod_lead_email': mapping.pod_lead_email.lower().strip(),
                            'pod_lead_name': mapping.pod_lead_email.split('@')[0] if mapping.pod_lead_email else 'Unknown',
                            'trainer_name': mapping.trainer_name or trainer_email.split('@')[0],
                            'status': mapping.current_status,
                            'role': mapping.role or 'Trainer',
                        }
                        if mapping.trainer_name:
                            name_to_pod[mapping.trainer_name.lower().strip()] = trainer_to_pod[trainer_email]
                
                # Build calibrator email set once (shared across all projects)
                calibrator_emails_set: set = set()
                pod_role_rows = session.query(PodLeadMapping.trainer_email, PodLeadMapping.role).all()
                for pr in pod_role_rows:
                    if pr.trainer_email and pr.role:
                        rl = pr.role.lower().strip()
                        if rl in ('calibrator', 'auditor', 'team lead'):
                            calibrator_emails_set.add(pr.trainer_email.lower().strip())
                try:
                    from app.services.quality_rubrics_service import QualityRubricsService
                    qr_svc = QualityRubricsService()
                    for email, role in qr_svc._fetch_team_roles().items():
                        if role == 'calibrator':
                            calibrator_emails_set.add(email.lower().strip())
                except Exception:
                    pass
                
                # For each project
                for project_id in all_project_ids:
                    project_name = project_names.get(project_id, f"Project {project_id}")
                    
                    valid_tasks_proj = self._valid_task_ids_subquery(session, [project_id])
                    
                    # ---------------------------------------------------------
                    # FIX: Get TRUE unique_tasks count at project level
                    # Only count tasks still in completed pipeline
                    # ---------------------------------------------------------
                    true_unique_query = session.query(
                        func.count(distinct(TaskHistoryRaw.task_id)).label('unique_tasks')
                    ).filter(
                        TaskHistoryRaw.new_status == 'completed',
                        TaskHistoryRaw.old_status != 'completed-approval',
                        TaskHistoryRaw.project_id == project_id,
                        TaskHistoryRaw.task_id.in_(session.query(valid_tasks_proj))
                    )
                    
                    if start_date:
                        true_unique_query = true_unique_query.filter(TaskHistoryRaw.date >= start_date)
                    if end_date:
                        true_unique_query = true_unique_query.filter(TaskHistoryRaw.date <= end_date)
                    
                    true_unique_result = true_unique_query.first()
                    project_true_unique_tasks = true_unique_result.unique_tasks if true_unique_result else 0
                    
                    # ---------------------------------------------------------
                    # FIX: Get TRUE tasks_with_new and tasks_with_rework at project level
                    # This prevents inflation when tasks are worked on by multiple trainers
                    # - tasks_with_new = unique tasks that had their FIRST completion (completed_status_count=1)
                    # - tasks_with_rework = unique tasks that had REWORK completions (completed_status_count>1)
                    # Note: A task can appear in BOTH if it was new AND reworked in the same period
                    # ---------------------------------------------------------
                    true_aht_query = session.query(
                        func.count(distinct(case(
                            (TaskHistoryRaw.completed_status_count == 1, TaskHistoryRaw.task_id),
                            else_=None
                        ))).label('tasks_with_new'),
                        func.count(distinct(case(
                            (TaskHistoryRaw.completed_status_count > 1, TaskHistoryRaw.task_id),
                            else_=None
                        ))).label('tasks_with_rework')
                    ).filter(
                        TaskHistoryRaw.new_status == 'completed',
                        TaskHistoryRaw.old_status != 'completed-approval',
                        TaskHistoryRaw.project_id == project_id,
                        TaskHistoryRaw.task_id.in_(session.query(valid_tasks_proj))
                    )
                    
                    if start_date:
                        true_aht_query = true_aht_query.filter(TaskHistoryRaw.date >= start_date)
                    if end_date:
                        true_aht_query = true_aht_query.filter(TaskHistoryRaw.date <= end_date)
                    
                    true_aht_result = true_aht_query.first()
                    project_true_tasks_with_new = true_aht_result.tasks_with_new if true_aht_result else 0
                    project_true_tasks_with_rework = true_aht_result.tasks_with_rework if true_aht_result else 0
                    
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
                        )).label('rework'),
                        func.count(distinct(case(
                            (TaskHistoryRaw.completed_status_count > 1, TaskHistoryRaw.task_id),
                            else_=None
                        ))).label('tasks_with_rework')
                    ).filter(
                        TaskHistoryRaw.new_status == 'completed',
                        TaskHistoryRaw.old_status != 'completed-approval',
                        TaskHistoryRaw.project_id == project_id,
                        TaskHistoryRaw.author.isnot(None),
                        TaskHistoryRaw.task_id.in_(session.query(valid_tasks_proj))
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
                                'rework': hs.rework or 0,
                                'tasks_with_rework': hs.tasks_with_rework or 0  # NEW: unique tasks with rework
                            }
                    
                    # ---------------------------------------------------------
                    # If include_tasks=True, get task-level details for each trainer
                    # ---------------------------------------------------------
                    trainer_tasks = {}
                    if include_tasks:
                        # Get detailed task history with completion info per trainer
                        task_history_query = session.query(
                            TaskHistoryRaw.task_id,
                            TaskHistoryRaw.author,
                            TaskHistoryRaw.completed_status_count,
                            TaskHistoryRaw.date,
                            TaskHistoryRaw.time_stamp
                        ).filter(
                            TaskHistoryRaw.new_status == 'completed',
                            TaskHistoryRaw.old_status != 'completed-approval',
                            TaskHistoryRaw.project_id == project_id,
                            TaskHistoryRaw.author.isnot(None),
                            TaskHistoryRaw.task_id.in_(session.query(valid_tasks_proj))
                        )
                        
                        if start_date:
                            task_history_query = task_history_query.filter(TaskHistoryRaw.date >= start_date)
                        if end_date:
                            task_history_query = task_history_query.filter(TaskHistoryRaw.date <= end_date)
                        
                        task_history_details = task_history_query.all()
                        
                        # Group task IDs by trainer email
                        trainer_task_ids = defaultdict(set)
                        task_completion_info = {}  # (task_id, email) -> {is_new, rework_count, completion_date, ...}
                        
                        for th in task_history_details:
                            email = th.author.lower().strip()
                            trainer_task_ids[email].add(th.task_id)
                            
                            # Track the completion info for each (task_id, trainer) pair
                            # Key insight: 
                            #   - is_new should be TRUE if the FIRST completion by this trainer had completed_status_count == 1
                            #   - rework_count = (total completions by this trainer) - 1
                            key = (th.task_id, email)
                            if key not in task_completion_info:
                                # First time seeing this (task, trainer) pair
                                task_completion_info[key] = {
                                    'is_new': th.completed_status_count == 1,  # Was this a NEW task completion?
                                    'total_completions': 1,  # Count of completions by this trainer
                                    'completion_date': th.date,
                                    '_first_ts': th.time_stamp,  # Track first completion timestamp
                                    '_last_ts': th.time_stamp,   # Track last completion for date
                                    '_first_count': th.completed_status_count,  # The count at first completion
                                }
                            else:
                                # Already seen this (task, trainer) pair - update tracking
                                info = task_completion_info[key]
                                info['total_completions'] += 1
                                
                                # Update is_new based on EARLIEST completion (lowest completed_status_count or earliest timestamp)
                                if th.time_stamp and info.get('_first_ts'):
                                    if th.time_stamp < info['_first_ts']:
                                        # This event is earlier, update first completion info
                                        info['is_new'] = th.completed_status_count == 1
                                        info['_first_ts'] = th.time_stamp
                                        info['_first_count'] = th.completed_status_count
                                
                                # Update completion_date to latest
                                if th.time_stamp and (not info.get('_last_ts') or th.time_stamp > info['_last_ts']):
                                    info['completion_date'] = th.date
                                    info['_last_ts'] = th.time_stamp
                        
                        # Calculate rework_count from total_completions
                        for key, info in task_completion_info.items():
                            # rework_count = total completions - 1 (if new task) or total completions (if started as rework)
                            # Actually, simpler: rework_count = completions where count > 1
                            # For the trainer, rework_count = total_completions - 1 if is_new, else total_completions
                            if info['is_new']:
                                info['rework_count'] = max(0, info['total_completions'] - 1)
                            else:
                                # Task was already rework when this trainer first completed it
                                info['rework_count'] = info['total_completions']
                        
                        # Get all unique task IDs for this project
                        all_task_ids = set()
                        for ids in trainer_task_ids.values():
                            all_task_ids.update(ids)
                        
                        # Fetch task details from TaskRaw
                        task_details = {}
                        if all_task_ids:
                            task_raw_query = session.query(TaskRaw).filter(
                                TaskRaw.task_id.in_(list(all_task_ids)),
                                TaskRaw.project_id == project_id
                            )
                            
                            for task in task_raw_query.all():
                                reviewer_email = (task.reviewer or '').lower().strip()
                                is_calibrated = 1 if reviewer_email and reviewer_email in calibrator_emails_set else 0
                                cal_passed = 1 if is_calibrated and (task.review_action_type or '').lower() != 'rework' else 0
                                task_details[task.task_id] = {
                                    'task_id': task.task_id,
                                    'colab_link': task.colab_link,
                                    'task_status': task.task_status,
                                    'delivery_status': task.delivery_status,
                                    'delivery_batch_name': task.delivery_batch_name,
                                    'count_reviews': task.count_reviews or 0,
                                    'avg_rating': round(float(task.sum_score) / float(task.count_reviews), 2) if task.count_reviews and task.count_reviews > 0 and task.sum_score else None,
                                    'number_of_turns': task.number_of_turns or 0,
                                    'last_completed_date': task.last_completed_date.isoformat() if task.last_completed_date else None,
                                    'created_date': task.created_date.isoformat() if task.created_date else None,
                                    'task_duration': task.task_duration,  # AHT in minutes
                                    'is_calibrated': is_calibrated,
                                    'calibration_passed': cal_passed,
                                }
                        
                        # Get per-task agentic review data
                        task_agentic_reviews = {}
                        if all_task_ids:
                            agentic_per_task = session.query(
                                TrainerReviewStats.task_id,
                                func.count(TrainerReviewStats.review_id).label('agentic_count'),
                                func.sum(TrainerReviewStats.score).label('agentic_score_sum')
                            ).filter(
                                TrainerReviewStats.task_id.in_(list(all_task_ids)),
                                TrainerReviewStats.project_id == project_id,
                                TrainerReviewStats.score.isnot(None),
                                TrainerReviewStats.review_type == 'auto'
                            )
                            
                            if start_date:
                                agentic_per_task = agentic_per_task.filter(TrainerReviewStats.review_date >= start_date)
                            if end_date:
                                agentic_per_task = agentic_per_task.filter(TrainerReviewStats.review_date <= end_date)
                            
                            agentic_per_task = agentic_per_task.group_by(TrainerReviewStats.task_id)
                            
                            for ar in agentic_per_task.all():
                                task_agentic_reviews[ar.task_id] = {
                                    'count': ar.agentic_count or 0,
                                    'avg_rating': round(float(ar.agentic_score_sum) / float(ar.agentic_count), 2) if ar.agentic_count and ar.agentic_count > 0 and ar.agentic_score_sum else None
                                }
                        
                        # Build task list for each trainer
                        for email, task_ids in trainer_task_ids.items():
                            tasks_list = []
                            for task_id in task_ids:
                                task_info = task_details.get(task_id, {})
                                completion_info = task_completion_info.get((task_id, email), {})
                                agentic_info = task_agentic_reviews.get(task_id, {})
                                
                                # Determine delivery status display
                                is_delivered = task_info.get('delivery_status', '').lower() == 'delivered' if task_info.get('delivery_status') else False
                                is_in_queue = (
                                    task_info.get('delivery_batch_name') and 
                                    not is_delivered
                                )
                                
                                # Determine if new or rework for this task submission
                                is_new = completion_info.get('is_new', False)
                                rework_count = completion_info.get('rework_count', 0)
                                total_completions = completion_info.get('total_completions', 1)
                                
                                # Calculate task-level accounted hours using new logic
                                # NEW LOGIC (Feb 2026):
                                # - New task: credit 10 hours
                                # - Rework: credit 4 hours ONCE per task (capped by MAX_REWORKS_TO_REWARD)
                                # This prevents rewarding multiple low-quality reworks by same trainer
                                aht_config = self._constants.aht
                                task_accounted_hrs = aht_config.calculate_task_accounted_hours(
                                    is_new=is_new,
                                    rework_count=rework_count
                                )
                                
                                # Rework percentage = rework_count / total_submissions × 100
                                # total_submissions = 1 (if new) + rework_count OR just rework_count (if not new)
                                total_submissions = (1 if is_new else 0) + rework_count
                                if total_submissions > 0:
                                    task_rework_pct = round((rework_count / total_submissions) * 100, 1)
                                else:
                                    task_rework_pct = 0
                                
                                # Task-level merged AHT = accounted_hours for this single task
                                # (For a single task, merged AHT = accounted_hours since unique_tasks = 1)
                                task_merged_aht = task_accounted_hrs
                                
                                tasks_list.append({
                                    'task_id': task_id,
                                    'colab_link': task_info.get('colab_link'),
                                    'is_new': is_new,
                                    'rework_count': rework_count,
                                    'reviews': task_info.get('count_reviews', 0),
                                    'avg_rating': task_info.get('avg_rating'),
                                    'agentic_reviews': agentic_info.get('count', 0),
                                    'agentic_rating': agentic_info.get('avg_rating'),
                                    'is_delivered': is_delivered,
                                    'is_in_queue': is_in_queue,
                                    'task_status': task_info.get('task_status'),
                                    'last_completed_date': completion_info.get('completion_date').isoformat() if completion_info.get('completion_date') else task_info.get('last_completed_date'),
                                    'aht_mins': task_merged_aht,
                                    'accounted_hours': task_accounted_hrs,
                                    'rework_percent': task_rework_pct,
                                    'is_calibrated': task_info.get('is_calibrated', 0),
                                    'calibration_passed': task_info.get('calibration_passed', 0),
                                })
                            
                            # Sort tasks by last_completed_date (most recent first)
                            tasks_list.sort(key=lambda x: x.get('last_completed_date') or '', reverse=True)
                            trainer_tasks[email] = tasks_list
                    
                    # ---------------------------------------------------------
                    # Get total_reviews and avg_rating from TrainerReviewStats
                    # FIX: Use TrainerReviewStats for proper attribution (same as POD Lead tab)
                    # This ensures reviews are attributed to the trainer who did the work,
                    # not the current task owner.
                    #
                    # Edge case handled:
                    # - Trainer A completes task -> rejected (2.3) -> Trainer B reworks -> approved (5.0)
                    #   Trainer A gets 1 review: 2.3
                    #   Trainer B gets 1 review: 5.0
                    # ---------------------------------------------------------
                    # Query for MANUAL reviews
                    reviews_query = session.query(
                        TrainerReviewStats.trainer_email,
                        func.count(TrainerReviewStats.review_id).label('total_reviews'),
                        func.sum(TrainerReviewStats.score).label('total_score')
                    ).filter(
                        TrainerReviewStats.project_id == project_id,
                        TrainerReviewStats.score.isnot(None),
                        or_(TrainerReviewStats.review_type == 'manual', TrainerReviewStats.review_type.is_(None))
                    )
                    
                    if start_date:
                        reviews_query = reviews_query.filter(TrainerReviewStats.review_date >= start_date)
                    if end_date:
                        reviews_query = reviews_query.filter(TrainerReviewStats.review_date <= end_date)
                    
                    reviews_query = reviews_query.group_by(TrainerReviewStats.trainer_email)
                    reviews_results = reviews_query.all()
                    
                    trainer_reviews = {}
                    trainer_avg_rating = {}
                    trainer_manual_scores = {}  # For aggregation
                    for rr in reviews_results:
                        if rr.trainer_email:
                            email = rr.trainer_email.lower().strip()
                            trainer_reviews[email] = rr.total_reviews or 0
                            trainer_manual_scores[email] = float(rr.total_score or 0)
                            if rr.total_reviews and rr.total_reviews > 0 and rr.total_score:
                                trainer_avg_rating[email] = round(float(rr.total_score) / float(rr.total_reviews), 2)
                            else:
                                trainer_avg_rating[email] = None
                    
                    # Query for AGENTIC (auto) reviews
                    agentic_query = session.query(
                        TrainerReviewStats.trainer_email,
                        func.count(TrainerReviewStats.review_id).label('total_reviews'),
                        func.sum(TrainerReviewStats.score).label('total_score')
                    ).filter(
                        TrainerReviewStats.project_id == project_id,
                        TrainerReviewStats.score.isnot(None),
                        TrainerReviewStats.review_type == 'auto'
                    )
                    
                    if start_date:
                        agentic_query = agentic_query.filter(TrainerReviewStats.review_date >= start_date)
                    if end_date:
                        agentic_query = agentic_query.filter(TrainerReviewStats.review_date <= end_date)
                    
                    agentic_query = agentic_query.group_by(TrainerReviewStats.trainer_email)
                    agentic_results = agentic_query.all()
                    
                    trainer_agentic_reviews = {}
                    trainer_agentic_rating = {}
                    trainer_agentic_scores = {}  # For aggregation
                    for ar in agentic_results:
                        if ar.trainer_email:
                            email = ar.trainer_email.lower().strip()
                            trainer_agentic_reviews[email] = ar.total_reviews or 0
                            trainer_agentic_scores[email] = float(ar.total_score or 0)
                            if ar.total_reviews and ar.total_reviews > 0 and ar.total_score:
                                trainer_agentic_rating[email] = round(float(ar.total_score) / float(ar.total_reviews), 2)
                            else:
                                trainer_agentic_rating[email] = None
                    
                    # ---------------------------------------------------------
                    # Get delivered and in_queue counts with proper attribution
                    # FIX: Use LAST COMPLETER from TaskHistoryRaw (same as POD Lead tab)
                    # Use delivery_status and delivery_batch_name (same as POD Lead tab)
                    # ---------------------------------------------------------
                    
                    # Get delivered task IDs (delivery_status = 'delivered')
                    # Filter by delivery_date (when the batch was actually delivered)
                    delivered_tasks_q = session.query(TaskRaw.task_id).filter(
                        func.lower(TaskRaw.delivery_status) == 'delivered',
                        TaskRaw.project_id == project_id
                    )
                    if start_date:
                        delivered_tasks_q = delivered_tasks_q.filter(TaskRaw.delivery_date >= start_date)
                    if end_date:
                        delivered_tasks_q = delivered_tasks_q.filter(TaskRaw.delivery_date <= end_date)
                    delivered_task_ids = [r.task_id for r in delivered_tasks_q.all()]
                    
                    # Get in_queue task IDs (has delivery_batch_name but not yet delivered)
                    # NOTE: Don't filter by date - "In Queue" is a CURRENT status, not historical
                    queue_tasks_q = session.query(TaskRaw.task_id).filter(
                        TaskRaw.delivery_batch_name.isnot(None),
                        TaskRaw.delivery_batch_name != '',
                        or_(
                            func.lower(TaskRaw.delivery_status) != 'delivered',
                            TaskRaw.delivery_status.is_(None)
                        ),
                        TaskRaw.project_id == project_id
                    )
                    # No date filter - show current queue status regardless of timeframe
                    in_queue_task_ids = [r.task_id for r in queue_tasks_q.all()]
                    
                    # Attribute to LAST COMPLETER from TaskHistoryRaw
                    trainer_delivered = {}
                    trainer_in_queue = {}
                    all_delivery_task_ids = list(set(delivered_task_ids + in_queue_task_ids))
                    task_completions = defaultdict(list)  # Initialize before conditional block
                    
                    if all_delivery_task_ids:
                        # Get completion events
                        completion_events = session.query(
                            TaskHistoryRaw.task_id,
                            TaskHistoryRaw.author,
                            TaskHistoryRaw.time_stamp
                        ).filter(
                            TaskHistoryRaw.task_id.in_(all_delivery_task_ids),
                            TaskHistoryRaw.new_status == 'completed',
                            TaskHistoryRaw.old_status != 'completed-approval',
                            TaskHistoryRaw.author.isnot(None)
                        ).all()
                        
                        # Group by task_id
                        from collections import defaultdict as dd
                        task_completions = dd(list)
                        for event in completion_events:
                            task_completions[event.task_id].append({
                                'author': event.author.lower().strip() if event.author else None,
                                'time_stamp': event.time_stamp
                            })
                        
                        # Attribute to last completer
                        delivered_set = set(delivered_task_ids)
                        in_queue_set = set(in_queue_task_ids)
                        
                        for task_id, completions in task_completions.items():
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
                    
                    # ---------------------------------------------------------
                    # Compute trainer-level revenue for this project
                    # Trainer revenue = SUM(bill_rate_task for each delivered task)
                    # Uses week-aware rate lookup from ProjectRevenueWeekly
                    # ---------------------------------------------------------
                    trainer_revenue_map = {}
                    
                    if delivered_task_ids:
                        from datetime import timedelta as _td
                        
                        # Get rate entries from ProjectRevenueWeekly for this project
                        _rate_rows = session.query(
                            ProjectRevenueWeekly.jibble_project_name,
                            ProjectRevenueWeekly.week_start_date,
                            ProjectRevenueWeekly.week_end_date,
                            ProjectRevenueWeekly.bill_rate_task,
                        ).filter(
                            ProjectRevenueWeekly.bill_rate_task.isnot(None),
                            ProjectRevenueWeekly.bill_rate_task > 0,
                        ).all()
                        
                        _rate_entries = []
                        for _rr in _rate_rows:
                            _rate_entries.append({
                                'jibble_name': _rr.jibble_project_name,
                                'week_start': _rr.week_start_date,
                                'week_end': _rr.week_end_date or (_rr.week_start_date + _td(days=6)),
                                'bill_rate': float(_rr.bill_rate_task),
                            })
                        
                        # Get delivered task details
                        _dtd = session.query(
                            TaskRaw.task_id,
                            TaskRaw.project_id,
                            TaskRaw.batch_name,
                            TaskRaw.delivery_date,
                        ).filter(
                            TaskRaw.task_id.in_(delivered_task_ids),
                        ).all()
                        
                        _task_detail = {}
                        for _row in _dtd:
                            _task_detail[_row.task_id] = {
                                'project_id': _row.project_id,
                                'batch_name': _row.batch_name,
                                'delivery_date': _row.delivery_date,
                            }
                        
                        def _get_jibble_name_proj(pid, batch_name):
                            _pid_m = {
                                36: 'Nvidia - SysBench',
                                37: 'Nvidia - Multichallenge',
                                38: 'Nvidia - InverseIFEval',
                                39: 'Nvidia - CFBench Multilingual',
                                59: 'NVIDIA_STEM Math_Proof_Eval',
                            }
                            return _pid_m.get(pid, '')
                        
                        def _find_rate(jn, dd):
                            if not dd or not jn:
                                return 0
                            for ent in _rate_entries:
                                if ent['jibble_name'] == jn and ent['week_start'] <= dd <= ent['week_end']:
                                    return ent['bill_rate']
                            return 0
                        
                        # Use task_completions (already computed above for delivery attribution)
                        for _tid in delivered_task_ids:
                            _det = _task_detail.get(_tid)
                            if not _det or not _det['delivery_date']:
                                continue
                            _comps = task_completions.get(_tid, [])
                            if _comps:
                                _sorted = sorted(_comps, key=lambda x: x['time_stamp'] or '')
                                _trainer = _sorted[-1]['author']
                            else:
                                continue
                            if not _trainer:
                                continue
                            _jn = _get_jibble_name_proj(_det['project_id'], _det['batch_name'])
                            _br = _find_rate(_jn, _det['delivery_date'])
                            if _br > 0:
                                trainer_revenue_map[_trainer] = trainer_revenue_map.get(_trainer, 0) + _br
                    
                    # Get Jibble hours for all trainers - use project-specific data only
                    # Map project_id to exact Jibble project name (from centralized constants)
                    constants = get_constants()
                    project_jibble_map = constants.projects.PROJECT_ID_TO_NAME
                    jibble_config = constants.jibble
                    
                    jibble_project_name = project_jibble_map.get(project_id)
                    
                    # Query Jibble hours grouped by turing_email (populated during sync
                    # via jibble_email_mapping: member_code -> turing_email)
                    jibble_projects_to_filter = []
                    jibble_names = jibble_config.PROJECT_ID_TO_JIBBLE_NAMES.get(project_id, [])
                    if jibble_names:
                        jibble_projects_to_filter.extend(jibble_names)
                    elif jibble_project_name:
                        jibble_projects_to_filter.append(jibble_project_name)
                    
                    jibble_query = session.query(
                        JibbleHours.turing_email,
                        func.sum(JibbleHours.logged_hours).label('total_hours')
                    ).filter(
                        JibbleHours.turing_email.isnot(None),
                    )
                    
                    if jibble_projects_to_filter:
                        jibble_query = jibble_query.filter(JibbleHours.project.in_(jibble_projects_to_filter))
                    
                    if start_date:
                        jibble_query = jibble_query.filter(JibbleHours.entry_date >= start_date)
                    if end_date:
                        jibble_query = jibble_query.filter(JibbleHours.entry_date <= end_date)
                    
                    jibble_query = jibble_query.group_by(JibbleHours.turing_email)
                    jibble_results = jibble_query.all()
                    
                    email_to_jibble = {}
                    for jr in jibble_results:
                        if jr.turing_email:
                            email_to_jibble[jr.turing_email.lower().strip()] = float(jr.total_hours or 0)
                    
                    logger.info(f"Project {project_name}: {len(email_to_jibble)} trainers mapped via turing_email")
                    
                    # ---------------------------------------------------------
                    # Task pipeline status counts from TaskRaw.derived_status
                    # ---------------------------------------------------------
                    status_q = session.query(
                        TaskRaw.trainer,
                        TaskRaw.derived_status,
                        func.count(TaskRaw.task_id).label('cnt')
                    ).filter(
                        TaskRaw.project_id == project_id,
                        TaskRaw.trainer.isnot(None),
                        TaskRaw.derived_status.isnot(None),
                    ).group_by(TaskRaw.trainer, TaskRaw.derived_status)
                    
                    trainer_status_map: dict = defaultdict(lambda: defaultdict(int))
                    for sr in status_q.all():
                        if sr.trainer:
                            trainer_status_map[sr.trainer.lower().strip()][sr.derived_status] = sr.cnt
                    
                    # Count tasks reviewed by calibrators per trainer
                    trainer_calibrated_map: dict = defaultdict(int)
                    trainer_cal_passed_map: dict = defaultdict(int)
                    if calibrator_emails_set:
                        cal_q = session.query(
                            TaskRaw.trainer,
                            func.count(TaskRaw.task_id).label('cnt'),
                            func.sum(case(
                                (func.lower(TaskRaw.review_action_type) != 'rework', 1),
                                else_=0
                            )).label('passed')
                        ).filter(
                            TaskRaw.project_id == project_id,
                            TaskRaw.trainer.isnot(None),
                            TaskRaw.reviewer.isnot(None),
                            TaskRaw.count_reviews > 0,
                            func.lower(TaskRaw.reviewer).in_(calibrator_emails_set),
                        ).group_by(TaskRaw.trainer)
                        
                        for cr in cal_q.all():
                            if cr.trainer:
                                trainer_cal_passed_map[cr.trainer.lower().strip()] = cr.passed or 0
                                trainer_calibrated_map[cr.trainer.lower().strip()] = cr.cnt
                    
                    # Get contributor name by email for fallback matching
                    contributors = session.query(Contributor).all()
                    email_to_name = {}
                    for c in contributors:
                        if c.turing_email and c.name:
                            email_to_name[c.turing_email.lower().strip()] = c.name
                    
                    # Aggregate by POD Lead - now includes trainer details
                    pod_aggregates = defaultdict(lambda: {
                        'unique_tasks': 0,
                        'new_tasks': 0,
                        'rework': 0,
                        'tasks_with_rework': 0,
                        'target': 0,
                        'claimed': 0,
                        'in_progress': 0,
                        'completed_current': 0,
                        'reviewed': 0,
                        'calibrated': 0,
                        'calibration_passed': 0,
                        'in_rework': 0,
                        'total_reviews': 0,
                        'agentic_reviews': 0,
                        'agentic_score': 0.0,
                        'delivered': 0,
                        'in_queue': 0,
                        'trainer_count': 0,
                        'trainer_jibble_hours': 0.0,
                        'accounted_hours': 0.0,
                        'total_score': 0.0,
                        'rated_reviews': 0,
                        'trainers': []
                    })
                    
                    # Special key for trainers without POD Lead mapping
                    NO_POD_LEAD_EMAIL = "no_pod_lead"
                    NO_POD_LEAD_NAME = "No Pod Lead"
                    
                    # Track trainer emails per POD lead for TRUE AHT calculation
                    pod_trainer_emails = defaultdict(list)
                    
                    for trainer_email, hist in trainer_history.items():
                        pod_info = trainer_to_pod.get(trainer_email)
                        
                        # Fallback: try name-based matching if email not found
                        if not pod_info:
                            contributor_name = email_to_name.get(trainer_email, '').lower().strip()
                            if contributor_name and contributor_name in name_to_pod:
                                pod_info = name_to_pod[contributor_name]
                                logger.info(f"Name-based fallback matched '{contributor_name}' ({trainer_email}) to pod lead {pod_info['pod_lead_email']}")
                        
                        # Determine POD Lead email and trainer name
                        if pod_info:
                            pod_email = pod_info['pod_lead_email']
                            trainer_name = pod_info.get('trainer_name', trainer_email.split('@')[0])
                            trainer_status = pod_info.get('status', 'active')
                        else:
                            # Unmapped trainer - assign to "No Pod Lead" category
                            pod_email = NO_POD_LEAD_EMAIL
                            # Try to get name from contributor table
                            trainer_name = email_to_name.get(trainer_email, trainer_email.split('@')[0])
                            trainer_status = 'unmapped'
                        
                        # Get trainer's Jibble hours via turing_email
                        trainer_jibble = email_to_jibble.get(trainer_email.lower().strip(), 0)
                        
                        # Calculate trainer-level metrics
                        t_unique = hist['unique_tasks']
                        t_new = hist['new_tasks']  # Count of first-completion events (= unique tasks with new)
                        t_rework = hist['rework']  # Total rework events (for display/% calculation)
                        t_tasks_with_rework = hist.get('tasks_with_rework', 0)  # NEW: unique tasks with rework
                        t_reviews = trainer_reviews.get(trainer_email, 0)
                        t_rating = trainer_avg_rating.get(trainer_email)
                        t_delivered = trainer_delivered.get(trainer_email, 0)
                        t_in_queue = trainer_in_queue.get(trainer_email, 0)
                        t_submissions = t_new + t_rework
                        
                        # Agentic review metrics
                        t_agentic_reviews = trainer_agentic_reviews.get(trainer_email, 0)
                        t_agentic_rating = trainer_agentic_rating.get(trainer_email)
                        
                        t_avg_rework = round((t_submissions / t_unique) - 1, 2) if t_unique > 0 else None
                        t_rework_pct = round((t_rework / t_submissions) * 100, 1) if t_submissions > 0 else None
                        
                        # Determine role for per-project AHT calculations
                        trainer_role = pod_info.get('role', 'Trainer') if pod_info else 'Trainer'
                        
                        # Accounted hours: per-project AHT (configured or default)
                        t_accounted_hrs = self._constants.daily_targets.compute_accounted_hours(
                            project_id=project_id,
                            role=trainer_role,
                            new_tasks=t_new,
                            rework=t_rework,
                            total_reviews=t_reviews,
                        ) if (t_submissions > 0 or t_reviews > 0) else 0
                        
                        # Merged Expected AHT = accounted_hours / unique_tasks
                        t_merged_aht = round(t_accounted_hrs / t_unique, 2) if t_unique > 0 and t_accounted_hrs > 0 else None
                        
                        # Calculate efficiency (accounted / jibble * 100)
                        t_efficiency = None
                        if trainer_jibble > 0 and t_accounted_hrs > 0:
                            t_efficiency = round((t_accounted_hrs / trainer_jibble) * 100, 1)
                        
                        # Trainer revenue = delivered_tasks * bill_rate_task
                        t_revenue = round(trainer_revenue_map.get(trainer_email, 0), 2)
                        target_info = self._constants.daily_targets.compute_tasks_per_8hrs(
                            project_id=project_id,
                            role=trainer_role,
                            new_tasks=t_new,
                            rework=t_rework,
                            total_reviews=t_reviews,
                            jibble_hours=trainer_jibble,
                        )

                        # Pipeline status counts from TaskRaw (cumulative/waterfall)
                        # Hierarchy: Unclaimed < In Progress < Completed < Reviewed < Validated < Delivered
                        # Each level includes tasks that progressed beyond it,
                        # but excludes tasks that regressed below it (e.g. sent to rework).
                        sc = trainer_status_map.get(trainer_email, {})
                        t_claimed = sum(sc.get(s, 0) for s in ('In Progress', 'Completed', 'Reviewed', 'Rework', 'Validated', 'Approval'))
                        t_in_progress = sc.get('In Progress', 0)
                        t_completed_current = sum(sc.get(s, 0) for s in ('Completed', 'Reviewed', 'Validated', 'Approval'))
                        t_reviewed = sum(sc.get(s, 0) for s in ('Reviewed', 'Validated'))
                        t_calibrated = trainer_calibrated_map.get(trainer_email, 0)
                        t_cal_passed = trainer_cal_passed_map.get(trainer_email, 0)
                        t_in_rework = sc.get('Rework', 0)
                        
                        # Target: jibble_hours / new_task_aht
                        proj_aht = self._constants.daily_targets.get_aht(project_id)
                        t_new_task_aht = proj_aht.get('new_task_aht', self._constants.daily_targets.DEFAULT_NEW_TASK_AHT)
                        t_target = round(trainer_jibble / t_new_task_aht, 1) if t_new_task_aht > 0 and trainer_jibble > 0 else 0
                        
                        # Create trainer entry with all columns from Trainer wise tab
                        trainer_entry = {
                            'trainer_name': trainer_name,
                            'trainer_email': trainer_email,
                            'target': t_target,
                            'unique_tasks': t_unique,
                            'new_tasks': t_new,
                            'claimed': t_claimed,
                            'in_progress': t_in_progress,
                            'completed_current': t_completed_current,
                            'reviewed': t_reviewed,
                            'calibrated': t_calibrated,
                            'calibration_passed': t_cal_passed,
                            'in_rework': t_in_rework,
                            'rework': t_rework,
                            'total_reviews': t_reviews,
                            'agentic_reviews': t_agentic_reviews,
                            'agentic_rating': t_agentic_rating,
                            'delivered': t_delivered,
                            'in_queue': t_in_queue,
                            'avg_rework': t_avg_rework,
                            'rework_percent': t_rework_pct,
                            'avg_rating': t_rating,
                            'merged_exp_aht': t_merged_aht,
                            'jibble_hours': round(trainer_jibble, 2),
                            'accounted_hours': round(t_accounted_hrs, 2),
                            'efficiency': t_efficiency,
                            'revenue': t_revenue,
                            'status': trainer_status,
                            'role': target_info['role'],
                            'tasks_per_8hrs': target_info['tasks_per_8hrs'],
                            'daily_target': target_info['daily_target'],
                            'below_target': target_info['below_target'],
                        }
                        
                        # Add tasks if requested
                        if include_tasks:
                            trainer_entry['tasks'] = trainer_tasks.get(trainer_email, [])
                        
                        # Aggregate to POD level (or "No Pod Lead" category)
                        pod_aggregates[pod_email]['unique_tasks'] += t_unique
                        pod_aggregates[pod_email]['new_tasks'] += t_new
                        pod_aggregates[pod_email]['rework'] += t_rework
                        pod_aggregates[pod_email]['tasks_with_rework'] += t_tasks_with_rework
                        pod_aggregates[pod_email]['target'] += t_target
                        pod_aggregates[pod_email]['claimed'] += t_claimed
                        pod_aggregates[pod_email]['in_progress'] += t_in_progress
                        pod_aggregates[pod_email]['completed_current'] += t_completed_current
                        pod_aggregates[pod_email]['reviewed'] += t_reviewed
                        pod_aggregates[pod_email]['calibrated'] += t_calibrated
                        pod_aggregates[pod_email]['calibration_passed'] += t_cal_passed
                        pod_aggregates[pod_email]['in_rework'] += t_in_rework
                        pod_aggregates[pod_email]['total_reviews'] += t_reviews
                        pod_aggregates[pod_email]['agentic_reviews'] += t_agentic_reviews
                        pod_aggregates[pod_email]['agentic_score'] += trainer_agentic_scores.get(trainer_email, 0)
                        pod_aggregates[pod_email]['delivered'] += t_delivered
                        pod_aggregates[pod_email]['in_queue'] += t_in_queue
                        pod_aggregates[pod_email]['trainer_count'] += 1
                        pod_aggregates[pod_email]['accounted_hours'] += t_accounted_hrs
                        
                        # For weighted average rating
                        if t_rating is not None and t_reviews > 0:
                            pod_aggregates[pod_email]['total_score'] += t_rating * t_reviews
                            pod_aggregates[pod_email]['rated_reviews'] += t_reviews
                        
                        # FIX: Only add Jibble hours if trainer is NOT the same as POD lead
                        # This prevents double-counting when POD lead is listed as their own trainer
                        if trainer_email.lower().strip() != pod_email.lower().strip():
                            pod_aggregates[pod_email]['trainer_jibble_hours'] += trainer_jibble
                        
                        # Revenue accumulation at POD level
                        pod_aggregates[pod_email]['revenue'] = pod_aggregates[pod_email].get('revenue', 0) + t_revenue
                        
                        pod_aggregates[pod_email]['trainers'].append(trainer_entry)
                        
                        # Track trainer email for TRUE POD-level AHT calculation
                        pod_trainer_emails[pod_email].append(trainer_email)
                    
                    # ---------------------------------------------------------
                    # FIX: Include trainers who have in_queue/delivered tasks but NO task history
                    # These trainers are in trainer_in_queue or trainer_delivered but not in trainer_history
                    # This ensures we don't miss any in_queue counts from trainers without recent completions
                    # ---------------------------------------------------------
                    processed_trainers = set(trainer_history.keys())
                    
                    # Find trainers with delivery data (in_queue or delivered) who weren't processed
                    delivery_trainers = set(trainer_in_queue.keys()) | set(trainer_delivered.keys())
                    unprocessed_delivery_trainers = delivery_trainers - processed_trainers
                    
                    if unprocessed_delivery_trainers:
                        logger.info(f"Project {project_name}: Found {len(unprocessed_delivery_trainers)} trainers with delivery data but no task history in date range")
                        
                        for trainer_email in unprocessed_delivery_trainers:
                            # Determine POD Lead
                            pod_info = trainer_to_pod.get(trainer_email)
                            if not pod_info:
                                contributor_name = email_to_name.get(trainer_email, '').lower().strip()
                                if contributor_name and contributor_name in name_to_pod:
                                    pod_info = name_to_pod[contributor_name]
                            if pod_info:
                                pod_email = pod_info['pod_lead_email']
                                trainer_name = pod_info.get('trainer_name', trainer_email.split('@')[0])
                            else:
                                pod_email = NO_POD_LEAD_EMAIL
                                trainer_name = email_to_name.get(trainer_email, trainer_email.split('@')[0])
                            
                            # Get delivery stats for this trainer
                            extra_delivered = trainer_delivered.get(trainer_email, 0)
                            extra_in_queue = trainer_in_queue.get(trainer_email, 0)
                            
                            if extra_delivered > 0 or extra_in_queue > 0:
                                # Add to POD aggregates
                                pod_aggregates[pod_email]['delivered'] += extra_delivered
                                pod_aggregates[pod_email]['in_queue'] += extra_in_queue
                                
                                # Revenue for delivery-only trainer
                                _extra_rev = round(trainer_revenue_map.get(trainer_email, 0), 2)
                                
                                # Add a trainer entry with just delivery data
                                _del_role = pod_info.get('role', 'Trainer') if pod_info else 'Trainer'
                                _del_target = self._constants.daily_targets.get_target(project_id, _del_role)
                                pod_aggregates[pod_email]['trainers'].append({
                                    'trainer_name': trainer_name,
                                    'trainer_email': trainer_email,
                                    'target': 0,
                                    'unique_tasks': 0,
                                    'new_tasks': 0,
                                    'claimed': 0,
                                    'in_progress': 0,
                                    'completed_current': 0,
                                    'reviewed': 0,
                                    'calibrated': 0,
                                    'calibration_passed': 0,
                                    'in_rework': 0,
                                    'rework': 0,
                                    'total_reviews': 0,
                                    'agentic_reviews': 0,
                                    'agentic_rating': None,
                                    'delivered': extra_delivered,
                                    'in_queue': extra_in_queue,
                                    'avg_rework': None,
                                    'rework_percent': None,
                                    'avg_rating': None,
                                    'merged_exp_aht': None,
                                    'jibble_hours': 0,
                                    'accounted_hours': 0,
                                    'efficiency': None,
                                    'revenue': _extra_rev,
                                    'status': 'delivery_only',
                                    'role': _del_role,
                                    'tasks_per_8hrs': None,
                                    'daily_target': _del_target,
                                    'below_target': False,
                                })
                                pod_aggregates[pod_email]['revenue'] = pod_aggregates[pod_email].get('revenue', 0) + _extra_rev
                                # NOTE: Do NOT increment trainer_count here.
                                # Size should only reflect trainers who completed new/rework tasks in the date range.
                    
                    # ---------------------------------------------------------
                    # Include trainers who logged Jibble hours but have NO task history
                    # Target = Jibble Hours / AHT regardless of completions.
                    # This surfaces time-logging without output.
                    # ---------------------------------------------------------
                    already_processed = processed_trainers | unprocessed_delivery_trainers
                    jibble_only_trainers = set(email_to_jibble.keys()) - already_processed
                    
                    proj_aht = self._constants.daily_targets.get_aht(project_id)
                    _jibble_aht = proj_aht.get('new_task_aht', self._constants.daily_targets.DEFAULT_NEW_TASK_AHT)
                    
                    jibble_only_count = 0
                    for trainer_email in jibble_only_trainers:
                        trainer_jibble = email_to_jibble.get(trainer_email, 0)
                        if trainer_jibble <= 0:
                            continue
                        
                        pod_info = trainer_to_pod.get(trainer_email)
                        if not pod_info:
                            contributor_name = email_to_name.get(trainer_email, '').lower().strip()
                            if contributor_name and contributor_name in name_to_pod:
                                pod_info = name_to_pod[contributor_name]
                        
                        if pod_info:
                            pod_email = pod_info['pod_lead_email']
                            trainer_name = pod_info.get('trainer_name', trainer_email.split('@')[0])
                            trainer_role = pod_info.get('role', 'Trainer')
                            trainer_status = pod_info.get('status', 'active')
                        else:
                            pod_email = NO_POD_LEAD_EMAIL
                            trainer_name = email_to_name.get(trainer_email, trainer_email.split('@')[0])
                            trainer_role = 'Trainer'
                            trainer_status = 'unmapped'
                        
                        t_target = round(trainer_jibble / _jibble_aht, 1) if _jibble_aht > 0 else 0
                        _jt_del_target = self._constants.daily_targets.get_target(project_id, trainer_role)
                        
                        sc = trainer_status_map.get(trainer_email, {})
                        t_claimed = sum(sc.get(s, 0) for s in ('In Progress', 'Completed', 'Reviewed', 'Rework', 'Validated', 'Approval'))
                        t_in_progress = sc.get('In Progress', 0)
                        t_completed_current = sum(sc.get(s, 0) for s in ('Completed', 'Reviewed', 'Validated', 'Approval'))
                        t_reviewed = sum(sc.get(s, 0) for s in ('Reviewed', 'Validated'))
                        t_calibrated = trainer_calibrated_map.get(trainer_email, 0)
                        t_cal_passed = trainer_cal_passed_map.get(trainer_email, 0)
                        t_in_rework = sc.get('Rework', 0)

                        trainer_entry = {
                            'trainer_name': trainer_name,
                            'trainer_email': trainer_email,
                            'target': t_target,
                            'unique_tasks': 0,
                            'new_tasks': 0,
                            'claimed': t_claimed,
                            'in_progress': t_in_progress,
                            'completed_current': t_completed_current,
                            'reviewed': t_reviewed,
                            'calibrated': t_calibrated,
                            'calibration_passed': t_cal_passed,
                            'in_rework': t_in_rework,
                            'rework': 0,
                            'total_reviews': trainer_reviews.get(trainer_email, 0),
                            'agentic_reviews': trainer_agentic_reviews.get(trainer_email, 0),
                            'agentic_rating': trainer_agentic_rating.get(trainer_email),
                            'delivered': trainer_delivered.get(trainer_email, 0),
                            'in_queue': trainer_in_queue.get(trainer_email, 0),
                            'avg_rework': None,
                            'rework_percent': None,
                            'avg_rating': trainer_avg_rating.get(trainer_email),
                            'merged_exp_aht': None,
                            'jibble_hours': round(trainer_jibble, 2),
                            'accounted_hours': 0,
                            'efficiency': 0,
                            'revenue': round(trainer_revenue_map.get(trainer_email, 0), 2),
                            'status': trainer_status,
                            'role': trainer_role,
                            'tasks_per_8hrs': None,
                            'daily_target': _jt_del_target,
                            'below_target': True if t_target > 0 else False,
                        }
                        
                        pod_aggregates[pod_email]['target'] += t_target
                        pod_aggregates[pod_email]['claimed'] += t_claimed
                        pod_aggregates[pod_email]['in_progress'] += t_in_progress
                        pod_aggregates[pod_email]['completed_current'] += t_completed_current
                        pod_aggregates[pod_email]['reviewed'] += t_reviewed
                        pod_aggregates[pod_email]['calibrated'] += t_calibrated
                        pod_aggregates[pod_email]['calibration_passed'] += t_cal_passed
                        pod_aggregates[pod_email]['in_rework'] += t_in_rework
                        pod_aggregates[pod_email]['delivered'] += trainer_entry['delivered']
                        pod_aggregates[pod_email]['in_queue'] += trainer_entry['in_queue']
                        # NOTE: Do NOT increment trainer_count here.
                        # Size should only reflect trainers who completed new/rework tasks in the date range.
                        if trainer_email.lower().strip() != pod_email.lower().strip():
                            pod_aggregates[pod_email]['trainer_jibble_hours'] += trainer_jibble
                        pod_aggregates[pod_email]['revenue'] = pod_aggregates[pod_email].get('revenue', 0) + trainer_entry['revenue']
                        pod_aggregates[pod_email]['trainers'].append(trainer_entry)
                        pod_trainer_emails[pod_email].append(trainer_email)
                        jibble_only_count += 1
                    
                    if jibble_only_count > 0:
                        logger.info(f"Project {project_name}: Added {jibble_only_count} trainers with Jibble hours but no task completions")
                    
                    # Build POD Lead list for this project
                    pod_leads_list = []
                    project_totals = {
                        'unique_tasks': 0,
                        'new_tasks': 0,
                        'rework': 0,
                        'tasks_with_rework': 0,
                        'target': 0,
                        'claimed': 0,
                        'in_progress': 0,
                        'completed_current': 0,
                        'reviewed': 0,
                        'calibrated': 0,
                        'calibration_passed': 0,
                        'in_rework': 0,
                        'total_reviews': 0,
                        'agentic_reviews': 0,
                        'agentic_score': 0.0,
                        'delivered': 0,
                        'in_queue': 0,
                        'trainer_count': 0,
                        'trainer_jibble_hours': 0.0,
                        'pod_jibble_hours': 0.0,
                        'accounted_hours': 0.0,
                        'total_score': 0.0,
                        'rated_reviews': 0
                    }
                    
                    for pod_email, agg in pod_aggregates.items():
                        submissions = agg['new_tasks'] + agg['rework']
                        avg_rework = round((submissions / agg['unique_tasks']) - 1, 2) if agg['unique_tasks'] > 0 else None
                        rework_pct = round((agg['rework'] / submissions) * 100, 1) if submissions > 0 else None
                        
                        # ---------------------------------------------------------
                        # FIX: Query TRUE tasks_with_new and tasks_with_rework for this POD lead
                        # This prevents inflation when trainers within the same POD share tasks
                        # ---------------------------------------------------------
                        pod_trainers = pod_trainer_emails.get(pod_email, [])
                        
                        if len(pod_trainers) > 1:
                            # Multiple trainers - query TRUE POD-level metrics
                            pod_true_query = session.query(
                                func.count(distinct(TaskHistoryRaw.task_id)).label('unique_tasks'),
                                func.count(distinct(case(
                                    (TaskHistoryRaw.completed_status_count == 1, TaskHistoryRaw.task_id),
                                    else_=None
                                ))).label('tasks_with_new'),
                                func.count(distinct(case(
                                    (TaskHistoryRaw.completed_status_count > 1, TaskHistoryRaw.task_id),
                                    else_=None
                                ))).label('tasks_with_rework')
                            ).filter(
                                TaskHistoryRaw.new_status == 'completed',
                                TaskHistoryRaw.old_status != 'completed-approval',
                                TaskHistoryRaw.project_id == project_id,
                                func.lower(TaskHistoryRaw.author).in_([t.lower() for t in pod_trainers]),
                                TaskHistoryRaw.task_id.in_(session.query(valid_tasks_proj))
                            )
                            
                            if start_date:
                                pod_true_query = pod_true_query.filter(TaskHistoryRaw.date >= start_date)
                            if end_date:
                                pod_true_query = pod_true_query.filter(TaskHistoryRaw.date <= end_date)
                            
                            pod_true_result = pod_true_query.first()
                            pod_true_unique = pod_true_result.unique_tasks if pod_true_result else 0
                            pod_true_tasks_with_new = pod_true_result.tasks_with_new if pod_true_result else 0
                            pod_true_tasks_with_rework = pod_true_result.tasks_with_rework if pod_true_result else 0
                        else:
                            # Single trainer or no trainers - summed values are correct
                            pod_true_unique = agg['unique_tasks']
                            pod_true_tasks_with_new = agg['new_tasks']
                            pod_true_tasks_with_rework = agg.get('tasks_with_rework', 0)
                        
                        # Calculate merged AHT using TRUE POD-level values
                        merged_aht = self._calculate_merged_aht(
                            pod_true_tasks_with_new, 
                            pod_true_tasks_with_rework, 
                            pod_true_unique,
                            project_id=project_id
                        )
                        
                        # Calculate TRUE accounted hours for POD level
                        pod_accounted = self._calculate_accounted_hours(
                            pod_true_tasks_with_new, 
                            pod_true_tasks_with_rework,
                            project_id=project_id
                        )
                        
                        # Get POD Lead's own Jibble hours via turing_email
                        pod_own_jibble = email_to_jibble.get(pod_email.lower().strip(), 0)
                        trainer_jibble = agg['trainer_jibble_hours']
                        
                        # Calculate aggregated rating (weighted average)
                        pod_avg_rating = None
                        if agg['rated_reviews'] > 0:
                            pod_avg_rating = round(agg['total_score'] / agg['rated_reviews'], 2)
                        
                        # Calculate agentic review rating
                        pod_agentic_rating = None
                        if agg['agentic_reviews'] > 0:
                            pod_agentic_rating = round(agg['agentic_score'] / agg['agentic_reviews'], 2)
                        
                        # Calculate POD-level efficiency using TRUE accounted hours
                        total_pod_jibble = trainer_jibble + pod_own_jibble
                        pod_efficiency = None
                        if total_pod_jibble > 0 and pod_accounted > 0:
                            pod_efficiency = round((pod_accounted / total_pod_jibble) * 100, 1)
                        
                        # Count active people (trainers + pod lead who logged Jibble hours)
                        pod_active_people = sum(1 for t in agg['trainers'] if t.get('jibble_hours', 0) > 0)
                        if pod_own_jibble > 0:
                            pod_active_people += 1
                        
                        # Sort trainers by total_reviews within this POD lead
                        trainers_sorted = sorted(agg['trainers'], key=lambda x: -(x['total_reviews'] or 0))
                        
                        # Use proper display name for "No Pod Lead" category
                        display_name = NO_POD_LEAD_NAME if pod_email == NO_POD_LEAD_EMAIL else pod_email.split('@')[0]
                        
                        pod_leads_list.append({
                            'pod_lead_name': display_name,
                            'pod_lead_email': pod_email,
                            'trainer_count': agg['trainer_count'],
                            'target': round(agg['target'], 1),
                            'unique_tasks': pod_true_unique,
                            'new_tasks': agg['new_tasks'],
                            'claimed': agg['claimed'],
                            'in_progress': agg['in_progress'],
                            'completed_current': agg['completed_current'],
                            'reviewed': agg['reviewed'],
                            'calibrated': agg['calibrated'],
                            'calibration_passed': agg['calibration_passed'],
                            'in_rework': agg['in_rework'],
                            'rework': agg['rework'],
                            'total_reviews': agg['total_reviews'],
                            'agentic_reviews': agg['agentic_reviews'],
                            'agentic_rating': pod_agentic_rating,
                            'delivered': agg['delivered'],
                            'in_queue': agg['in_queue'],
                            'avg_rework': avg_rework,
                            'rework_percent': rework_pct,
                            'avg_rating': pod_avg_rating,
                            'merged_exp_aht': merged_aht,
                            'pod_jibble_hours': round(pod_own_jibble, 2),
                            'trainer_jibble_hours': round(trainer_jibble, 2),
                            'accounted_hours': round(pod_accounted, 2),
                            'efficiency': pod_efficiency,
                            'active_jibble_people': pod_active_people,
                            'revenue': round(agg.get('revenue', 0), 2),
                            'trainers': trainers_sorted,  # Include trainer details
                        })
                        
                        # Accumulate project totals
                        project_totals['unique_tasks'] += agg['unique_tasks']
                        project_totals['new_tasks'] += agg['new_tasks']
                        project_totals['rework'] += agg['rework']
                        project_totals['tasks_with_rework'] += agg.get('tasks_with_rework', 0)
                        project_totals['target'] += agg['target']
                        project_totals['claimed'] += agg['claimed']
                        project_totals['in_progress'] += agg['in_progress']
                        project_totals['completed_current'] += agg['completed_current']
                        project_totals['reviewed'] += agg['reviewed']
                        project_totals['calibrated'] += agg['calibrated']
                        project_totals['calibration_passed'] += agg.get('calibration_passed', 0)
                        project_totals['in_rework'] += agg['in_rework']
                        project_totals['total_reviews'] += agg['total_reviews']
                        project_totals['agentic_reviews'] += agg['agentic_reviews']
                        project_totals['agentic_score'] += agg['agentic_score']
                        project_totals['delivered'] += agg['delivered']
                        project_totals['in_queue'] += agg['in_queue']
                        project_totals['trainer_count'] += agg['trainer_count']
                        project_totals['trainer_jibble_hours'] += trainer_jibble
                        project_totals['pod_jibble_hours'] += pod_own_jibble
                        project_totals['accounted_hours'] += agg['accounted_hours']
                        project_totals['total_score'] += agg['total_score']
                        project_totals['rated_reviews'] += agg['rated_reviews']
                    
                    # Sort POD leads by total_reviews
                    pod_leads_list.sort(key=lambda x: -(x['total_reviews'] or 0))
                    
                    # Calculate project-level metrics
                    # FIX: Use project_true_unique_tasks instead of summed unique_tasks for accurate avg_rework
                    proj_submissions = project_totals['new_tasks'] + project_totals['rework']
                    proj_avg_rework = round((proj_submissions / project_true_unique_tasks) - 1, 2) if project_true_unique_tasks > 0 else None
                    proj_rework_pct = round((project_totals['rework'] / proj_submissions) * 100, 1) if proj_submissions > 0 else None
                    
                    # ---------------------------------------------------------
                    # FIX: Use TRUE project-level tasks_with_new and tasks_with_rework for AHT
                    # This gives accurate per-task AHT even when tasks are shared between trainers
                    # - project_true_tasks_with_new: unique tasks with first completion in period
                    # - project_true_tasks_with_rework: unique tasks with rework in period
                    # ---------------------------------------------------------
                    proj_merged_aht = self._calculate_merged_aht(
                        project_true_tasks_with_new, 
                        project_true_tasks_with_rework, 
                        project_true_unique_tasks,
                        project_id=project_id
                    )
                    
                    # Also recalculate accounted hours using true project-level values
                    proj_accounted = self._calculate_accounted_hours(
                        project_true_tasks_with_new, 
                        project_true_tasks_with_rework,
                        project_id=project_id
                    )
                    
                    # Calculate logged hours - query directly from Jibble data at project level
                    # This ensures hours show even when no trainers are mapped to the project
                    # No swap - use original project names to match client PnL sheet
                    jibble_project_names = jibble_config.PROJECT_ID_TO_JIBBLE_NAMES.get(project_id, [])
                    
                    active_jibble_people = 0
                    if jibble_project_names:
                        direct_jibble_query = session.query(
                            func.sum(JibbleHours.logged_hours).label('total'),
                            func.count(func.distinct(JibbleHours.member_code)).label('active_people')
                        ).filter(JibbleHours.project.in_(jibble_project_names))
                        if start_date:
                            direct_jibble_query = direct_jibble_query.filter(JibbleHours.entry_date >= start_date)
                        if end_date:
                            direct_jibble_query = direct_jibble_query.filter(JibbleHours.entry_date <= end_date)
                        direct_result = direct_jibble_query.one()
                        total_logged_hours = float(direct_result.total or 0)
                        active_jibble_people = int(direct_result.active_people or 0)
                    else:
                        total_logged_hours = project_totals['trainer_jibble_hours'] + project_totals['pod_jibble_hours']
                    
                    # Calculate project-level rating (weighted average)
                    proj_avg_rating = None
                    if project_totals['rated_reviews'] > 0:
                        proj_avg_rating = round(project_totals['total_score'] / project_totals['rated_reviews'], 2)
                    
                    # Calculate project-level agentic rating
                    proj_agentic_rating = None
                    if project_totals['agentic_reviews'] > 0:
                        proj_agentic_rating = round(project_totals['agentic_score'] / project_totals['agentic_reviews'], 2)
                    proj_efficiency = None
                    if total_logged_hours > 0 and proj_accounted > 0:
                        proj_efficiency = round((proj_accounted / total_logged_hours) * 100, 1)
                    
                    project_results.append({
                        'project_id': project_id,
                        'project_name': project_name,
                        'pod_lead_count': sum(1 for pl in pod_leads_list if pl.get('trainer_count', 0) > 0),
                        'trainer_count': project_totals['trainer_count'],
                        'target': round(project_totals['target'], 1),
                        'unique_tasks': project_true_unique_tasks,
                        'new_tasks': project_totals['new_tasks'],
                        'claimed': project_totals['claimed'],
                        'in_progress': project_totals['in_progress'],
                        'completed_current': project_totals['completed_current'],
                        'reviewed': project_totals['reviewed'],
                        'calibrated': project_totals['calibrated'],
                        'calibration_passed': project_totals['calibration_passed'],
                        'in_rework': project_totals['in_rework'],
                        'rework': project_totals['rework'],
                        'total_reviews': project_totals['total_reviews'],
                        'agentic_reviews': project_totals['agentic_reviews'],
                        'agentic_rating': proj_agentic_rating,
                        'delivered': project_totals['delivered'],
                        'in_queue': project_totals['in_queue'],
                        'avg_rework': proj_avg_rework,
                        'rework_percent': proj_rework_pct,
                        'avg_rating': proj_avg_rating,
                        'merged_exp_aht': proj_merged_aht,
                        'logged_hours': round(total_logged_hours, 2),
                        'active_jibble_people': active_jibble_people,
                        'total_pod_hours': round(project_totals['pod_jibble_hours'], 2),
                        'accounted_hours': proj_accounted,
                        'efficiency': proj_efficiency,
                        'pod_leads': pod_leads_list,
                    })
                
                # Sort projects by total_reviews
                project_results.sort(key=lambda x: -(x['total_reviews'] or 0))
                
                # ============================================================
                # FINANCIAL METRICS
                # Attach revenue, cost, margin data at project level
                # ============================================================
                try:
                    financial_data = self.get_financial_metrics(
                        start_date=start_date,
                        end_date=end_date,
                        project_ids=[p['project_id'] for p in project_results],
                        session=session
                    )
                    
                    # Merge financial data into project results
                    for proj in project_results:
                        pid = proj['project_id']
                        fin = financial_data.get(pid, {})
                        proj['revenue'] = fin.get('revenue', 0)
                        proj['cost'] = fin.get('cost', 0)
                        proj['work_cost'] = fin.get('work_cost', 0)
                        proj['non_work_cost'] = fin.get('non_work_cost', 0)
                        proj['margin'] = fin.get('margin', 0)
                        proj['margin_percent'] = fin.get('margin_percent', None)
                        proj['cost_logged_hours'] = fin.get('cost_logged_hours', 0)
                        proj['revenue_weeks_matched'] = fin.get('revenue_weeks_matched', 0)
                        proj['revenue_partial_week'] = fin.get('revenue_partial_week', False)
                except Exception as e:
                    logger.warning(f"Failed to attach financial metrics (non-fatal): {e}")
                    import traceback
                    traceback.print_exc()
                    # Financial metrics are optional - don't break the response
                    for proj in project_results:
                        proj['revenue'] = 0
                        proj['cost'] = 0
                        proj['work_cost'] = 0
                        proj['non_work_cost'] = 0
                        proj['margin'] = 0
                        proj['margin_percent'] = None
                        proj['cost_logged_hours'] = 0
                        proj['revenue_weeks_matched'] = 0
                        proj['revenue_partial_week'] = False
                
                return project_results
                
        except Exception as e:
            logger.error(f"Error getting project stats: {e}")
            raise
    
    def get_financial_metrics(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        project_ids: Optional[list] = None,
        session=None,
    ) -> Dict:
        """
        Get financial metrics (revenue, cost, margins) for projects.
        
        Revenue: From project_revenue_weekly (weekly granularity)
            - Uses week_end_date for date matching (matches client's PnL sheet logic)
            - A revenue week is included if: start_date < week_end_date <= end_date
        
        Cost: From project_cost_daily (daily granularity) + project_fte_cost_monthly
            - Contractor cost: precise daily from BigQuery Jibblelogs Billings
            - FTE cost: monthly from mom_fte_costs (client's PnL sheet)
            - Total cost = Contractor cost + FTE cost
        
        Margin: Revenue - Total Cost
        Margin%: ((Revenue - Cost) / Revenue) * 100
        """
        from sqlalchemy import func, and_, case, extract
        from datetime import date, datetime as dt
        
        fin_config = get_constants().financial
        
        result = {}
        
        try:
            parsed_start = None
            parsed_end = None
            if start_date:
                parsed_start = dt.strptime(start_date, '%Y-%m-%d').date() if isinstance(start_date, str) else start_date
            if end_date:
                parsed_end = dt.strptime(end_date, '%Y-%m-%d').date() if isinstance(end_date, str) else end_date
            
            if project_ids is None:
                project_ids = self.settings.all_project_ids_list
            
            for pid in project_ids:
                result[pid] = {
                    'revenue': 0,
                    'cost': 0,
                    'work_cost': 0,
                    'non_work_cost': 0,
                    'fte_cost': 0,
                    'margin': 0,
                    'margin_percent': None,
                    'cost_logged_hours': 0,
                    'revenue_weeks_matched': 0,
                    'revenue_partial_week': False,
                }
            
            # ============================================================
            # REVENUE: Match by week_end_date (same as client's PnL sheet)
            # Client formula: SUMIFS(V:V, E:E, project, B:B, ">"&start, B:B, "<="&end)
            # where B = Week End Date. Include if start < week_end_date <= end.
            # Fall back to week_start_date + 6 if week_end_date is NULL.
            # ============================================================
            week_anchor = func.coalesce(
                ProjectRevenueWeekly.week_end_date,
                ProjectRevenueWeekly.week_start_date + 6,
            )
            
            revenue_query = session.query(
                ProjectRevenueWeekly.project_id,
                func.sum(ProjectRevenueWeekly.actual_revenue).label('total_revenue'),
                func.count(ProjectRevenueWeekly.id).label('weeks_matched'),
            ).filter(
                ProjectRevenueWeekly.project_id.isnot(None),
                ProjectRevenueWeekly.project_id.in_(project_ids),
            )
            
            if parsed_start:
                revenue_query = revenue_query.filter(week_anchor > parsed_start)
            if parsed_end:
                revenue_query = revenue_query.filter(week_anchor <= parsed_end)
            
            revenue_query = revenue_query.group_by(ProjectRevenueWeekly.project_id)
            
            for row in revenue_query.all():
                pid = row.project_id
                if pid in result:
                    result[pid]['revenue'] = round(float(row.total_revenue or 0), 2)
                    result[pid]['revenue_weeks_matched'] = row.weeks_matched or 0
            
            # ============================================================
            # COST (Contractors): Query project_cost_daily
            # ============================================================
            cost_query = session.query(
                ProjectCostDaily.project_id,
                ProjectCostDaily.activity_type,
                func.sum(ProjectCostDaily.total_cost).label('total_cost'),
                func.sum(ProjectCostDaily.logged_hours).label('total_hours'),
            ).filter(
                ProjectCostDaily.project_id.isnot(None),
                ProjectCostDaily.project_id.in_(project_ids),
            )
            
            if parsed_start:
                cost_query = cost_query.filter(ProjectCostDaily.date >= parsed_start)
            if parsed_end:
                cost_query = cost_query.filter(ProjectCostDaily.date <= parsed_end)
            
            cost_query = cost_query.group_by(
                ProjectCostDaily.project_id,
                ProjectCostDaily.activity_type,
            )
            
            for row in cost_query.all():
                pid = row.project_id
                if pid not in result:
                    continue
                    
                cost_val = round(float(row.total_cost or 0), 2)
                hours_val = round(float(row.total_hours or 0), 2)
                
                if row.activity_type == 'Work Activity':
                    result[pid]['work_cost'] += cost_val
                    result[pid]['cost_logged_hours'] += hours_val
                elif row.activity_type == 'Non-Work Activity':
                    result[pid]['non_work_cost'] += cost_val
                    result[pid]['cost_logged_hours'] += hours_val
            
            # ============================================================
            # COST (FTEs): Query project_fte_cost_monthly
            # Client's monthly PnL: Total Cost = Contractors + FTEs
            # ============================================================
            try:
                fte_query = session.query(
                    ProjectFTECostMonthly.project_id,
                    func.sum(ProjectFTECostMonthly.cost).label('total_fte_cost'),
                ).filter(
                    ProjectFTECostMonthly.project_id.isnot(None),
                    ProjectFTECostMonthly.project_id.in_(project_ids),
                )
                
                if parsed_start:
                    fte_query = fte_query.filter(
                        ProjectFTECostMonthly.month_end_date >= parsed_start,
                    )
                if parsed_end:
                    fte_query = fte_query.filter(
                        ProjectFTECostMonthly.month_start_date <= parsed_end,
                    )
                
                fte_query = fte_query.group_by(ProjectFTECostMonthly.project_id)
                
                for row in fte_query.all():
                    pid = row.project_id
                    if pid in result:
                        result[pid]['fte_cost'] = round(float(row.total_fte_cost or 0), 2)
            except Exception as fte_err:
                logger.warning(f"FTE cost query failed (table may not exist yet): {fte_err}")
            
            # ============================================================
            # Calculate totals and margins
            # Total cost = contractor (work + non-work) + FTE
            # ============================================================
            for pid in project_ids:
                if pid not in result:
                    continue
                
                r = result[pid]
                contractor_cost = round(r['work_cost'] + r['non_work_cost'], 2)
                r['cost'] = round(contractor_cost + r['fte_cost'], 2)
                r['margin'] = round(fin_config.calculate_margin(r['revenue'], r['cost']), 2)
                r['margin_percent'] = fin_config.calculate_margin_percent(r['revenue'], r['cost'])
                r['work_cost'] = round(r['work_cost'], 2)
                r['non_work_cost'] = round(r['non_work_cost'], 2)
                r['cost_logged_hours'] = round(r['cost_logged_hours'], 2)
            
            return result
            
        except Exception as e:
            logger.error(f"Error calculating financial metrics: {e}")
            import traceback
            traceback.print_exc()
            return result


    # ================================================================
    # PROJECT SUMMARY (Executive View)
    # ================================================================

    def _compute_fpy_from_reviews(
        self,
        project_ids: list[int],
        start_date: str = None,
        end_date: str = None,
    ) -> dict:
        """Compute Reviewer FPY and Auditor FPY per project from BigQuery reviews.

        Logic:
        - For each task, get ALL published reviews ordered by time.
        - Determine reviewer role (reviewer vs calibrator) using the team sheet
          for Math Proof Eval, or PodLeadMapping.role for other projects.
        - For each task+role combo, check the FIRST review action:
            approved (action_type != 'rework') → FPY pass
            rework  (action_type == 'rework')  → FPY fail
        - Reviewer FPY  = reviewer-pass / reviewer-total
        - Auditor  FPY  = calibrator-pass / calibrator-total  (null if no calibrators)
        """
        from collections import defaultdict
        from app.config import get_settings
        from app.models.db_models import PodLeadMapping

        if not project_ids:
            return {}

        s = get_settings()
        bq_client = self._get_bq_client()
        if not bq_client:
            return {}

        p, d = s.gcp_project_id, s.bigquery_dataset
        pid_list = ','.join(str(i) for i in project_ids)

        date_clause = ""
        if start_date:
            date_clause += f" AND DATE(r.submitted_at) >= '{start_date}'"
        if end_date:
            date_clause += f" AND DATE(r.submitted_at) <= '{end_date}'"

        query = f"""
        SELECT
            conv.project_id,
            r.conversation_id,
            cont.turing_email AS reviewer_email,
            JSON_EXTRACT_SCALAR(r.review_action, '$.type') AS action_type,
            r.submitted_at
        FROM `{p}.{d}.review` r
        JOIN `{p}.{d}.conversation` conv ON conv.id = r.conversation_id
        LEFT JOIN `{p}.{d}.contributor` cont ON cont.id = r.reviewer_id
        WHERE conv.project_id IN ({pid_list})
          AND r.review_type = 'manual'
          AND r.status = 'published'
          AND r.submitted_at IS NOT NULL
          {date_clause}
        ORDER BY r.conversation_id, r.submitted_at ASC
        """

        try:
            rows = list(bq_client.query(query).result())
        except Exception as e:
            logger.error(f"FPY BigQuery query failed: {e}")
            return {}

        # Build role mapping: email → 'reviewer' | 'calibrator'
        role_map: dict[str, str] = {}

        # From PodLeadMapping (all projects)
        with self.db_service.get_session() as session:
            pod_rows = session.query(
                PodLeadMapping.trainer_email,
                PodLeadMapping.role
            ).all()
            for pr in pod_rows:
                if pr.trainer_email and pr.role:
                    role_lower = pr.role.lower().strip()
                    email_lower = pr.trainer_email.lower().strip()
                    if role_lower in ('pod lead', 'sub pod lead', 'pod_lead'):
                        role_map[email_lower] = 'reviewer'
                    elif role_lower in ('calibrator', 'auditor', 'team lead'):
                        role_map[email_lower] = 'calibrator'

        # Try team sheet for Math Proof Eval (has calibrator mapping)
        try:
            from app.services.quality_rubrics_service import QualityRubricsService
            qr_service = QualityRubricsService()
            team_roles = qr_service._fetch_team_roles()
            for email, role in team_roles.items():
                role_map[email.lower().strip()] = role
        except Exception as e:
            logger.warning(f"Could not load team sheet roles for FPY: {e}")

        # Group reviews by (project_id, conversation_id)
        # Key: (project_id, conversation_id) → list of (reviewer_email, action_type)
        reviews_by_task: dict[tuple, list] = defaultdict(list)
        for row in rows:
            key = (row['project_id'], row['conversation_id'])
            reviews_by_task[key].append({
                'reviewer_email': (row['reviewer_email'] or '').lower().strip(),
                'action_type': (row['action_type'] or '').lower(),
            })

        # Compute FPY per project
        # For each task, find the FIRST review by a reviewer and by a calibrator
        project_fpy: dict[int, dict] = {pid: {
            'r_total': 0, 'r_pass': 0,
            'a_total': 0, 'a_pass': 0,
        } for pid in project_ids}

        for (pid, conv_id), reviews in reviews_by_task.items():
            first_reviewer_seen = False
            first_calibrator_seen = False

            for rev in reviews:  # already sorted by submitted_at ASC
                email = rev['reviewer_email']
                action = rev['action_type']
                role = role_map.get(email, 'reviewer')  # default to reviewer

                if role == 'reviewer' and not first_reviewer_seen:
                    first_reviewer_seen = True
                    project_fpy[pid]['r_total'] += 1
                    if action != 'rework':
                        project_fpy[pid]['r_pass'] += 1

                elif role == 'calibrator' and not first_calibrator_seen:
                    first_calibrator_seen = True
                    project_fpy[pid]['a_total'] += 1
                    if action != 'rework':
                        project_fpy[pid]['a_pass'] += 1

        result = {}
        for pid in project_ids:
            counts = project_fpy[pid]
            r_fpy = round(counts['r_pass'] / counts['r_total'] * 100, 1) if counts['r_total'] > 0 else None
            a_fpy = round(counts['a_pass'] / counts['a_total'] * 100, 1) if counts['a_total'] > 0 else None
            result[pid] = {
                'reviewer_fpy': r_fpy,
                'auditor_fpy': a_fpy,
            }

        logger.info(f"FPY computed for {len(project_ids)} projects from {len(rows)} reviews")
        return result

    def _get_bq_client(self):
        """Get BigQuery client, returning None if unavailable."""
        try:
            from app.config import get_settings
            from google.cloud import bigquery
            s = get_settings()
            if s.google_application_credentials:
                from google.oauth2 import service_account
                creds = service_account.Credentials.from_service_account_file(
                    s.google_application_credentials
                )
                return bigquery.Client(project=s.gcp_project_id, credentials=creds)
            return bigquery.Client(project=s.gcp_project_id)
        except Exception as e:
            logger.warning(f"BigQuery client unavailable for FPY: {e}")
            return None

    def get_project_summary(self, start_date: str = None, end_date: str = None) -> list:
        """
        Return one row per project with metrics for the executive summary page.

        Re-uses the fully-computed data from get_project_stats_with_pod_leads
        (which already has financials, accounted hours, targets, etc.) and
        adds FPY% on top by querying BigQuery reviews.
        """
        from app.models.db_models import PodLeadMapping

        project_stats = self.get_project_stats_with_pod_leads(
            start_date=start_date, end_date=end_date, include_tasks=False
        )

        # ---------- FPY: skip in main call for performance ----------
        # FPY is computed via a separate endpoint to keep this fast.
        fpy_by_project = {}

        summaries = []
        for proj in project_stats:
            pid = proj['project_id']
            fpy = fpy_by_project.get(pid, {})
            reviewer_fpy = fpy.get('reviewer_fpy')
            auditor_fpy = fpy.get('auditor_fpy')

            trainer_count = proj.get('trainer_count', 0) or 0
            pod_lead_count = proj.get('pod_lead_count', 0) or 0
            resources_jibble = proj.get('active_jibble_people', 0) or 0
            hours_submitted = proj.get('logged_hours', 0) or 0
            accounted_hours = proj.get('accounted_hours', 0) or 0
            target = proj.get('target', 0) or 0
            delivered = (proj.get('delivered', 0) or 0) + (proj.get('in_queue', 0) or 0)
            rework_rate = proj.get('rework_percent', None)
            avg_rework = proj.get('avg_rework', None)
            revenue = proj.get('revenue', 0) or 0
            cost = proj.get('cost', 0) or 0
            margin = proj.get('margin', 0) or 0
            margin_pct = proj.get('margin_percent', None)

            # ------- Project Status (Red / Yellow / Green) -------
            is_red = False
            red_reasons = []

            total_team = trainer_count + pod_lead_count
            if total_team > 0 and total_team < resources_jibble:
                is_red = True
                red_reasons.append('Resources in labeling tool < Jibble')
            if target > 0 and delivered < target:
                is_red = True
                red_reasons.append('Tasks delivered < target')
            if rework_rate is not None and rework_rate > 50:
                is_red = True
                red_reasons.append('Rework rate > 50%')
            if margin_pct is not None and margin_pct < 10:
                is_red = True
                red_reasons.append('Margin < 10%')

            if is_red:
                project_status = 'Red'
            elif margin_pct is not None and margin_pct < 30:
                project_status = 'Yellow'
            else:
                project_status = 'Green'

            summaries.append({
                'project_id': pid,
                'project_name': proj.get('project_name', ''),
                'project_status': project_status,
                'status_reasons': red_reasons,
                'trainer_count': trainer_count,
                'pod_lead_count': pod_lead_count,
                'total_team_size': total_team,
                'resources_labeling_tool': total_team,
                'resources_jibble': resources_jibble,
                'hours_submitted': round(hours_submitted, 1),
                'accounted_hours': round(accounted_hours, 1) if accounted_hours else 0,
                'target': round(target, 1),
                'delivered': delivered,
                'reviewer_fpy_pct': reviewer_fpy,
                'auditor_fpy_pct': auditor_fpy,
                'rework_rate': round(rework_rate, 1) if rework_rate is not None else None,
                'avg_rework_per_task': round(avg_rework, 2) if avg_rework is not None else None,
                'revenue': round(revenue, 2),
                'cost': round(cost, 2),
                'margin': round(margin, 2),
                'margin_pct': round(margin_pct, 1) if margin_pct is not None else None,
            })

        return summaries


_query_service = None


def get_query_service() -> QueryService:
    """Get or create the global query service instance"""
    global _query_service
    if _query_service is None:
        _query_service = QueryService()
    return _query_service
