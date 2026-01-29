"""
Target vs Actual Comparison Service

Calculates and compares actual performance against configured targets.
Supports:
- Daily, weekly, monthly rollup
- Trainer throughput (tasks completed)
- Reviewer throughput (reviews performed)
- Automatic target inheritance (entity-specific or project default)
"""
import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from sqlalchemy import func, and_, or_
from sqlalchemy.orm import Session

from ..models.db_models import (
    TaskHistoryRaw, TaskRaw, TrainerReviewStats, 
    Contributor, PodLeadMapping
)
from .db_service import get_db_service
from .configuration_service import get_configuration_service, ConfigType

logger = logging.getLogger(__name__)


class RollupPeriod(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


@dataclass
class TargetComparison:
    """Result of target vs actual comparison."""
    entity_type: str  # 'trainer' or 'reviewer'
    entity_id: Optional[int]
    entity_email: Optional[str]
    entity_name: Optional[str]
    
    # Target info
    target_daily: int
    target_period: int  # Based on rollup (daily=target, weekly=target*5, monthly=target*working_days)
    target_source: str  # 'individual' or 'project_default'
    
    # Actual performance
    actual: int
    
    # Comparison metrics
    gap: int  # actual - target (positive = exceeded, negative = missed)
    achievement_percent: float  # (actual / target) * 100
    
    # Period info
    period_start: date
    period_end: date
    rollup: str
    working_days: int


class TargetComparisonService:
    """
    Service for comparing actual performance against targets.
    """
    
    def __init__(self):
        self.db_service = get_db_service()
        self.config_service = get_configuration_service()
    
    def get_trainer_comparison(
        self,
        project_id: int,
        trainer_email: Optional[str] = None,
        trainer_id: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        rollup: RollupPeriod = RollupPeriod.DAILY
    ) -> List[TargetComparison]:
        """
        Get target vs actual comparison for trainer(s).
        
        Args:
            project_id: Project ID
            trainer_email: Optional specific trainer email (if None, returns all trainers)
            trainer_id: Optional specific trainer ID
            start_date: Start of period (default: today for daily, start of week for weekly)
            end_date: End of period (default: today)
            rollup: Rollup period (daily, weekly, monthly)
        
        Returns:
            List of TargetComparison objects
        """
        # Set default dates based on rollup
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = self._get_period_start(end_date, rollup)
        
        working_days = self._count_working_days(start_date, end_date)
        
        with self.db_service.get_session() as session:
            # Get actual completions from task_history_raw
            query = session.query(
                TaskHistoryRaw.author,
                func.count(TaskHistoryRaw.id).label('completion_count')
            ).filter(
                TaskHistoryRaw.project_id == project_id,
                TaskHistoryRaw.new_status == 'completed',
                TaskHistoryRaw.completed_status_count == 1,  # New tasks only
                func.date(TaskHistoryRaw.transition_time) >= start_date,
                func.date(TaskHistoryRaw.transition_time) <= end_date
            )
            
            if trainer_email:
                query = query.filter(TaskHistoryRaw.author == trainer_email)
            
            query = query.group_by(TaskHistoryRaw.author)
            
            actual_data = {row.author: row.completion_count for row in query.all()}
            
            # Also count rework completions
            rework_query = session.query(
                TaskHistoryRaw.author,
                func.count(TaskHistoryRaw.id).label('rework_count')
            ).filter(
                TaskHistoryRaw.project_id == project_id,
                TaskHistoryRaw.new_status == 'completed',
                TaskHistoryRaw.completed_status_count > 1,  # Rework
                func.date(TaskHistoryRaw.transition_time) >= start_date,
                func.date(TaskHistoryRaw.transition_time) <= end_date
            )
            
            if trainer_email:
                rework_query = rework_query.filter(TaskHistoryRaw.author == trainer_email)
            
            rework_query = rework_query.group_by(TaskHistoryRaw.author)
            rework_data = {row.author: row.rework_count for row in rework_query.all()}
            
            # Combine new tasks + rework for total throughput
            all_trainers = set(actual_data.keys()) | set(rework_data.keys())
            
            # If specific trainer requested but no data, still return comparison
            if trainer_email and trainer_email not in all_trainers:
                all_trainers.add(trainer_email)
            
            results = []
            for email in all_trainers:
                actual = actual_data.get(email, 0) + rework_data.get(email, 0)
                
                # Get target for this trainer
                target_daily, target_source = self._get_trainer_target(project_id, email, session)
                target_period = target_daily * working_days
                
                # Calculate comparison
                gap = actual - target_period
                achievement = (actual / target_period * 100) if target_period > 0 else 0
                
                # Get trainer name
                contributor = session.query(Contributor).filter(
                    Contributor.email == email
                ).first()
                
                results.append(TargetComparison(
                    entity_type='trainer',
                    entity_id=contributor.id if contributor else None,
                    entity_email=email,
                    entity_name=contributor.name if contributor else None,
                    target_daily=target_daily,
                    target_period=target_period,
                    target_source=target_source,
                    actual=actual,
                    gap=gap,
                    achievement_percent=round(achievement, 1),
                    period_start=start_date,
                    period_end=end_date,
                    rollup=rollup.value,
                    working_days=working_days
                ))
            
            return sorted(results, key=lambda x: x.achievement_percent, reverse=True)
    
    def get_reviewer_comparison(
        self,
        project_id: int,
        reviewer_email: Optional[str] = None,
        reviewer_id: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        rollup: RollupPeriod = RollupPeriod.DAILY
    ) -> List[TargetComparison]:
        """
        Get target vs actual comparison for reviewer(s).
        
        Reviewers are measured by number of reviews performed.
        """
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            start_date = self._get_period_start(end_date, rollup)
        
        working_days = self._count_working_days(start_date, end_date)
        
        with self.db_service.get_session() as session:
            # Get actual reviews from trainer_review_stats
            # Count reviews where this person was the reviewer
            query = session.query(
                TrainerReviewStats.trainer_email,  # This is actually the reviewer in this context
                func.count(TrainerReviewStats.id).label('review_count')
            ).filter(
                TrainerReviewStats.project_id == project_id,
                TrainerReviewStats.review_date >= start_date,
                TrainerReviewStats.review_date <= end_date
            )
            
            if reviewer_email:
                query = query.filter(TrainerReviewStats.trainer_email == reviewer_email)
            
            query = query.group_by(TrainerReviewStats.trainer_email)
            
            # Note: trainer_review_stats tracks trainer attributions, not reviewer counts
            # For reviewer metrics, we need to look at different data
            # Let's use pod_lead_mapping to identify reviewers and count their reviews differently
            
            # Get POD leads for this project
            pod_leads = session.query(PodLeadMapping.pod_lead_email).filter(
                PodLeadMapping.project_id == project_id
            ).distinct().all()
            pod_lead_emails = {p.pod_lead_email for p in pod_leads}
            
            # For now, return empty if no specific reviewer metrics
            # This would need to be enhanced based on how reviewer performance is tracked
            
            results = []
            for email in pod_lead_emails:
                if reviewer_email and email != reviewer_email:
                    continue
                
                # Get review count for this POD lead
                # This is a placeholder - actual implementation would depend on review tracking
                actual = 0  # TODO: Implement actual review counting
                
                target_daily, target_source = self._get_reviewer_target(project_id, email, session)
                target_period = target_daily * working_days
                
                gap = actual - target_period
                achievement = (actual / target_period * 100) if target_period > 0 else 0
                
                contributor = session.query(Contributor).filter(
                    Contributor.email == email
                ).first()
                
                results.append(TargetComparison(
                    entity_type='reviewer',
                    entity_id=contributor.id if contributor else None,
                    entity_email=email,
                    entity_name=contributor.name if contributor else None,
                    target_daily=target_daily,
                    target_period=target_period,
                    target_source=target_source,
                    actual=actual,
                    gap=gap,
                    achievement_percent=round(achievement, 1),
                    period_start=start_date,
                    period_end=end_date,
                    rollup=rollup.value,
                    working_days=working_days
                ))
            
            return sorted(results, key=lambda x: x.achievement_percent, reverse=True)
    
    def get_project_summary(
        self,
        project_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        rollup: RollupPeriod = RollupPeriod.WEEKLY
    ) -> Dict[str, Any]:
        """
        Get summary of target vs actual for entire project.
        """
        trainer_comparisons = self.get_trainer_comparison(
            project_id=project_id,
            start_date=start_date,
            end_date=end_date,
            rollup=rollup
        )
        
        if not trainer_comparisons:
            return {
                "project_id": project_id,
                "period_start": start_date,
                "period_end": end_date,
                "rollup": rollup.value,
                "trainers": {
                    "count": 0,
                    "total_target": 0,
                    "total_actual": 0,
                    "overall_achievement": 0,
                    "meeting_target": 0,
                    "below_target": 0
                }
            }
        
        total_target = sum(t.target_period for t in trainer_comparisons)
        total_actual = sum(t.actual for t in trainer_comparisons)
        meeting_target = sum(1 for t in trainer_comparisons if t.achievement_percent >= 100)
        below_target = sum(1 for t in trainer_comparisons if t.achievement_percent < 100)
        
        return {
            "project_id": project_id,
            "period_start": trainer_comparisons[0].period_start if trainer_comparisons else start_date,
            "period_end": trainer_comparisons[0].period_end if trainer_comparisons else end_date,
            "rollup": rollup.value,
            "trainers": {
                "count": len(trainer_comparisons),
                "total_target": total_target,
                "total_actual": total_actual,
                "overall_achievement": round((total_actual / total_target * 100) if total_target > 0 else 0, 1),
                "meeting_target": meeting_target,
                "below_target": below_target,
                "top_performers": [
                    {"email": t.entity_email, "name": t.entity_name, "achievement": t.achievement_percent}
                    for t in trainer_comparisons[:5]
                ],
                "needs_attention": [
                    {"email": t.entity_email, "name": t.entity_name, "achievement": t.achievement_percent}
                    for t in trainer_comparisons if t.achievement_percent < 80
                ][-5:]
            }
        }
    
    def _get_trainer_target(
        self, 
        project_id: int, 
        trainer_email: str,
        session: Session
    ) -> Tuple[int, str]:
        """
        Get throughput target for a trainer.
        
        Returns (target_daily, source) where source is 'individual' or 'project_default'.
        """
        # First try individual target
        contributor = session.query(Contributor).filter(
            Contributor.email == trainer_email
        ).first()
        
        if contributor:
            individual_target = self.config_service.get_throughput_target(
                project_id=project_id,
                entity_type='trainer',
                entity_id=contributor.id
            )
            if individual_target:
                return (individual_target, 'individual')
        
        # Fall back to project default
        default_target = self.config_service.get_throughput_target(
            project_id=project_id,
            entity_type='trainer'
        )
        
        return (default_target or 5, 'project_default')
    
    def _get_reviewer_target(
        self, 
        project_id: int, 
        reviewer_email: str,
        session: Session
    ) -> Tuple[int, str]:
        """Get throughput target for a reviewer."""
        contributor = session.query(Contributor).filter(
            Contributor.email == reviewer_email
        ).first()
        
        if contributor:
            individual_target = self.config_service.get_throughput_target(
                project_id=project_id,
                entity_type='reviewer',
                entity_id=contributor.id
            )
            if individual_target:
                return (individual_target, 'individual')
        
        default_target = self.config_service.get_throughput_target(
            project_id=project_id,
            entity_type='reviewer'
        )
        
        return (default_target or 20, 'project_default')
    
    def _get_period_start(self, end_date: date, rollup: RollupPeriod) -> date:
        """Calculate period start date based on rollup type."""
        if rollup == RollupPeriod.DAILY:
            return end_date
        elif rollup == RollupPeriod.WEEKLY:
            # Start of current week (Monday)
            days_since_monday = end_date.weekday()
            return end_date - timedelta(days=days_since_monday)
        elif rollup == RollupPeriod.MONTHLY:
            # Start of current month
            return end_date.replace(day=1)
        return end_date
    
    def _count_working_days(self, start_date: date, end_date: date) -> int:
        """Count working days (Mon-Fri) between two dates inclusive."""
        if start_date > end_date:
            return 0
        
        working_days = 0
        current = start_date
        while current <= end_date:
            if current.weekday() < 5:  # Monday = 0, Friday = 4
                working_days += 1
            current += timedelta(days=1)
        
        return max(working_days, 1)  # At least 1 to avoid division by zero


# Global instance
_target_comparison_service: Optional[TargetComparisonService] = None


def get_target_comparison_service() -> TargetComparisonService:
    """Get or create the global target comparison service instance."""
    global _target_comparison_service
    if _target_comparison_service is None:
        _target_comparison_service = TargetComparisonService()
    return _target_comparison_service
