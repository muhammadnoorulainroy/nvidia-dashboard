"""
API endpoints for nvidia dashboard statistics.

All endpoints include:
- Input validation via Pydantic schemas
- Proper error handling
- Rate limiting (where applicable)
"""
from fastapi import APIRouter, HTTPException, Query, Depends, Request
from typing import List, Optional, Dict, Any
import logging
from datetime import datetime
import re

from app.schemas.response_schemas import (
    DomainAggregation,
    ReviewerAggregation,
    ReviewerWithTrainers,
    TrainerLevelAggregation,
    PodLeadAggregation,
    OverallAggregation,
    TaskLevelInfo
)
from app.schemas.request_schemas import (
    StatsFilterParams,
    DailyStatsQuery,
    RatingTrendsQuery,
    PodLeadStatsQuery,
    ProjectStatsQuery,
    PaginationParams
)
from app.services.query_service import get_query_service
from app.services.data_sync_service import get_data_sync_service
from app.services.db_service import get_db_service
from app.core.exceptions import ValidationError, ServiceError
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Statistics"])


# =============================================================================
# Input Validation Helpers
# =============================================================================

def validate_date_format(date_str: Optional[str], field_name: str) -> Optional[str]:
    """Validate date string format."""
    if date_str is None:
        return None
    date_pattern = r"^\d{4}-\d{2}-\d{2}$"
    if not re.match(date_pattern, date_str):
        raise ValidationError(f"{field_name} must be in YYYY-MM-DD format")
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise ValidationError(f"Invalid {field_name}: {date_str}")
    return date_str


def validate_integer_param(value: Optional[str], field_name: str) -> Optional[int]:
    """Validate and convert string to integer."""
    if value is None:
        return None
    try:
        int_value = int(value)
        if int_value <= 0:
            raise ValidationError(f"{field_name} must be a positive integer")
        return int_value
    except ValueError:
        raise ValidationError(f"{field_name} must be a valid integer")


def validate_timeframe(timeframe: str) -> str:
    """Validate timeframe parameter."""
    valid_timeframes = ["daily", "weekly", "monthly", "overall"]
    if timeframe not in valid_timeframes:
        raise ValidationError(f"timeframe must be one of: {valid_timeframes}")
    return timeframe


def validate_project_id(project_id: Optional[int]) -> Optional[int]:
    """Validate project ID against configured project IDs."""
    if project_id is None:
        return None
    settings = get_settings()
    valid_ids = settings.all_project_ids_list
    if project_id not in valid_ids:
        raise ValidationError(f"project_id must be one of: {valid_ids}")
    return project_id


@router.get(
    "/by-domain",
    response_model=List[DomainAggregation],
    summary="Get statistics aggregated by domain"
)
async def get_stats_by_domain(
    domain: Optional[str] = Query(None, description="Filter by domain", max_length=255),
    reviewer: Optional[str] = Query(None, description="Filter by reviewer ID"),
    trainer: Optional[str] = Query(None, description="Filter by trainer level ID")
) -> List[DomainAggregation]:
    """Get statistics aggregated by domain."""
    # Validate integer parameters
    reviewer_id = validate_integer_param(reviewer, "reviewer")
    trainer_id = validate_integer_param(trainer, "trainer")
    
    try:
        service = get_query_service()
        filters = {'domain': domain, 'reviewer': reviewer_id, 'trainer': trainer_id}
        result = service.get_domain_aggregation(filters)
        return [DomainAggregation(**item) for item in result]
    except ValidationError:
        raise
    except Exception as e:
        logger.error(f"Error getting domain stats: {e}")
        raise ServiceError(f"Failed to retrieve domain statistics: {str(e)}")


@router.get(
    "/by-reviewer",
    response_model=List[ReviewerAggregation],
    summary="Get statistics aggregated by reviewer"
)
async def get_stats_by_reviewer(
    domain: Optional[str] = Query(None, description="Filter by domain"),
    reviewer: Optional[str] = Query(None, description="Filter by reviewer ID"),
    trainer: Optional[str] = Query(None, description="Filter by trainer level ID")
) -> List[ReviewerAggregation]:
    """Get statistics aggregated by reviewer"""
    try:
        service = get_query_service()
        filters = {'domain': domain, 'reviewer': reviewer, 'trainer': trainer}
        result = service.get_reviewer_aggregation(filters)
        return [ReviewerAggregation(**item) for item in result]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/reviewers-with-trainers",
    response_model=List[ReviewerWithTrainers],
    summary="Get reviewers with their trainers nested"
)
async def get_reviewers_with_trainers(
    domain: Optional[str] = Query(None, description="Filter by domain"),
    reviewer: Optional[str] = Query(None, description="Filter by reviewer ID")
) -> List[ReviewerWithTrainers]:
    """Get reviewers with their trainers as nested data"""
    try:
        service = get_query_service()
        filters = {'domain': domain, 'reviewer': reviewer}
        result = service.get_reviewers_with_trainers(filters)
        return [ReviewerWithTrainers(**item) for item in result]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/by-trainer-level",
    response_model=List[TrainerLevelAggregation],
    summary="Get statistics aggregated by trainer level"
)
async def get_stats_by_trainer_level(
    domain: Optional[str] = Query(None, description="Filter by domain"),
    reviewer: Optional[str] = Query(None, description="Filter by reviewer ID"),
    trainer: Optional[str] = Query(None, description="Filter by trainer level ID")
) -> List[TrainerLevelAggregation]:
    """Get statistics aggregated by trainer level"""
    try:
        service = get_query_service()
        filters = {'domain': domain, 'reviewer': reviewer, 'trainer': trainer}
        result = service.get_trainer_aggregation(filters)
        return [TrainerLevelAggregation(**item) for item in result]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/by-trainer-daily",
    summary="Get trainer statistics at date level (trainer x date)"
)
async def get_trainer_daily_stats(
    trainer: Optional[str] = Query(None, description="Filter by trainer ID")
):
    """Get trainer statistics at date level for time-series analysis"""
    try:
        service = get_query_service()
        filters = {'trainer': trainer}
        result = service.get_trainer_daily_stats(filters)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/by-trainer-overall",
    summary="Get overall trainer statistics with correct avg_rework"
)
async def get_trainer_overall_stats(
    trainer: Optional[str] = Query(None, description="Filter by trainer ID")
):
    """Get overall trainer statistics using ContributorTaskStats for accurate avg_rework"""
    try:
        service = get_query_service()
        filters = {'trainer': trainer}
        result = service.get_trainer_overall_stats(filters)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/by-reviewer-daily",
    summary="Get reviewer statistics at date level (reviewer x date)"
)
async def get_reviewer_daily_stats(
    reviewer: Optional[str] = Query(None, description="Filter by reviewer ID")
):
    """Get reviewer statistics at date level for time-series analysis"""
    try:
        service = get_query_service()
        filters = {'reviewer': reviewer}
        result = service.get_reviewer_daily_stats(filters)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/trainers-by-reviewer-date",
    summary="Get trainers reviewed by each reviewer on each date"
)
async def get_trainers_by_reviewer_date(
    reviewer: Optional[str] = Query(None, description="Filter by reviewer ID")
):
    """Get trainer details for each reviewer per date"""
    try:
        service = get_query_service()
        filters = {'reviewer': reviewer}
        result = service.get_trainers_by_reviewer_date(filters)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/by-pod-lead",
    response_model=List[PodLeadAggregation],
    summary="Get statistics aggregated by POD Lead with trainers"
)
async def get_stats_by_pod_lead(
    domain: Optional[str] = Query(None, description="Filter by domain")
) -> List[PodLeadAggregation]:
    """Get statistics aggregated by POD Lead with nested trainers"""
    try:
        service = get_query_service()
        filters = {'domain': domain}
        result = service.get_pod_lead_aggregation(filters)
        return [PodLeadAggregation(**item) for item in result]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/overall",
    response_model=OverallAggregation,
    summary="Get overall statistics"
)
async def get_overall_stats(
    domain: Optional[str] = Query(None, description="Filter by domain"),
    reviewer: Optional[str] = Query(None, description="Filter by reviewer ID"),
    trainer: Optional[str] = Query(None, description="Filter by trainer level ID")
) -> OverallAggregation:
    """Get overall aggregated statistics"""
    try:
        service = get_query_service()
        filters = {'domain': domain, 'reviewer': reviewer, 'trainer': trainer}
        result = service.get_overall_aggregation(filters)
        return OverallAggregation(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/task-level",
    response_model=List[TaskLevelInfo],
    summary="Get task-level information"
)
async def get_task_level_info(
    domain: Optional[str] = Query(None, description="Filter by domain"),
    reviewer: Optional[str] = Query(None, description="Filter by reviewer ID"),
    trainer: Optional[str] = Query(None, description="Filter by trainer level ID")
) -> List[TaskLevelInfo]:
    """Get task-level information"""
    try:
        service = get_query_service()
        filters = {'domain': domain, 'reviewer': reviewer, 'trainer': trainer}
        result = service.get_task_level_data(filters)
        return [TaskLevelInfo(**item) for item in result]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


# Import shared limiter for sync-specific rate limiting
# NOTE: Use get_sync_rate_limit function (not SYNC_RATE_LIMIT variable) because
# the decorator is evaluated at import time, before initialize_rate_limits() runs.
# Using a callable ensures the configured value is read at request time.
from app.core.rate_limiting import limiter, get_sync_rate_limit


@router.post(
    "/sync",
    response_model=Dict[str, Any],
    summary="Trigger data synchronization"
)
@limiter.limit(get_sync_rate_limit)
async def trigger_sync(request: Request) -> Dict[str, Any]:
    """
    Manually trigger data synchronization from BigQuery.
    
    This endpoint is rate-limited to protect BigQuery quotas.
    Rate limit is configured via RATE_LIMIT_SYNC_REQUESTS and RATE_LIMIT_SYNC_WINDOW
    environment variables (default: 5 requests per minute).
    
    The global rate limit from SlowAPIMiddleware also applies.
    """
    try:
        logger.info("Manual sync triggered")
        
        data_sync_service = get_data_sync_service()
        data_sync_service.initialize_bigquery_client()
        
        results = data_sync_service.sync_all_tables(sync_type='manual')
        
        db_service = get_db_service()
        row_counts = {}
        for table in ['task', 'review_detail', 'contributor']:
            row_counts[table] = db_service.get_table_row_count(table)
        
        return {
            "status": "completed",
            "tables_synced": results,
            "row_counts": row_counts,
            "success_count": sum(1 for v in results.values() if v),
            "total_tables": len(results)
        }
    except Exception as e:
        logger.error(f"Error during sync: {e}")
        raise ServiceError(f"Sync failed: {str(e)}")


@router.get(
    "/health",
    response_model=Dict[str, Any],
    summary="Check database health"
)
async def check_health() -> Dict[str, Any]:
    """Check database health and return table counts"""
    try:
        db_service = get_db_service()
        
        table_status = db_service.check_tables_exist()
        
        row_counts = {}
        for table in ['task', 'review_detail', 'contributor', 'work_item']:
            row_counts[table] = db_service.get_table_row_count(table)
        
        from app.config import get_settings
        settings = get_settings()
        
        return {
            'status': 'healthy',
            'database': settings.postgres_db,
            'bigquery_dataset': settings.bigquery_dataset,
            'project_id_filter': settings.project_id_filter,
            'tables_exist': table_status,
            'row_counts': row_counts
        }
    except Exception as e:
        logger.error(f"Error checking health: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/sync-info",
    response_model=Dict[str, Any],
    summary="Get data sync information"
)
async def get_sync_info() -> Dict[str, Any]:
    """Get data synchronization information"""
    try:
        from datetime import datetime, timezone
        from app.models.db_models import DataSyncLog
        from sqlalchemy import desc
        
        db_service = get_db_service()
        
        with db_service.get_session() as session:
            last_sync = session.query(DataSyncLog).filter(
                DataSyncLog.sync_status == 'completed'
            ).order_by(
                desc(DataSyncLog.sync_completed_at)
            ).first()
            
            current_utc = datetime.now(timezone.utc)
            
            sync_info = {
                'current_utc_time': current_utc.isoformat(),
                'last_sync_time': last_sync.sync_completed_at.isoformat() if last_sync and last_sync.sync_completed_at else None,
                'last_sync_type': last_sync.sync_type if last_sync else None,
                'tables_synced': []
            }
            
            if last_sync:
                recent_syncs = session.query(DataSyncLog).filter(
                    DataSyncLog.sync_completed_at == last_sync.sync_completed_at,
                    DataSyncLog.sync_status == 'completed'
                ).all()
                
                sync_info['tables_synced'] = [
                    {
                        'table_name': sync.table_name,
                        'records_synced': sync.records_synced,
                        'sync_started_at': sync.sync_started_at.isoformat() if sync.sync_started_at else None
                    }
                    for sync in recent_syncs
                ]
            
            return sync_info
            
    except Exception as e:
        logger.error(f"Error getting sync info: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/rating-trends",
    summary="Get rating trends over time for trainers"
)
async def get_rating_trends(
    trainer_email: Optional[str] = Query(None, description="Filter by trainer email"),
    granularity: str = Query("weekly", description="Granularity: daily, weekly, monthly")
) -> Dict[str, Any]:
    """Get rating trends showing how ratings have improved over time"""
    try:
        service = get_query_service()
        result = service.get_rating_trends(trainer_email=trainer_email, granularity=granularity)
        return result
    except Exception as e:
        logger.error(f"Error getting rating trends: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get(
    "/rating-comparison",
    summary="Get rating comparison between time periods"
)
async def get_rating_comparison(
    period1_start: str = Query(..., description="Start date for period 1 (YYYY-MM-DD)"),
    period1_end: str = Query(..., description="End date for period 1 (YYYY-MM-DD)"),
    period2_start: str = Query(..., description="Start date for period 2 (YYYY-MM-DD)"),
    period2_end: str = Query(..., description="End date for period 2 (YYYY-MM-DD)"),
    trainer_email: Optional[str] = Query(None, description="Filter by trainer email", max_length=255)
) -> Dict[str, Any]:
    """Compare ratings between two time periods to show improvement."""
    # Validate all date parameters
    period1_start = validate_date_format(period1_start, "period1_start")
    period1_end = validate_date_format(period1_end, "period1_end")
    period2_start = validate_date_format(period2_start, "period2_start")
    period2_end = validate_date_format(period2_end, "period2_end")
    
    # Validate date ranges
    if datetime.strptime(period1_start, "%Y-%m-%d") > datetime.strptime(period1_end, "%Y-%m-%d"):
        raise ValidationError("period1_start must be before period1_end")
    if datetime.strptime(period2_start, "%Y-%m-%d") > datetime.strptime(period2_end, "%Y-%m-%d"):
        raise ValidationError("period2_start must be before period2_end")
    
    try:
        service = get_query_service()
        result = service.get_rating_comparison(
            period1_start=period1_start,
            period1_end=period1_end,
            period2_start=period2_start,
            period2_end=period2_end,
            trainer_email=trainer_email
        )
        return result
    except ValidationError:
        raise
    except Exception as e:
        logger.error(f"Error getting rating comparison: {e}")
        raise ServiceError(f"Failed to retrieve rating comparison: {str(e)}")


@router.get(
    "/pod-lead-stats",
    summary="Get POD Lead stats with trainers under each POD"
)
async def get_pod_lead_stats(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    timeframe: str = Query("overall", description="Timeframe: daily, weekly, overall"),
    project_id: Optional[int] = Query(None, description="Filter by project ID (36, 37, 38, 39). None = all projects")
) -> List[Dict[str, Any]]:
    """Get POD Lead stats with trainers aggregated under each POD Lead."""
    # Validate parameters
    start_date = validate_date_format(start_date, "start_date")
    end_date = validate_date_format(end_date, "end_date")
    timeframe = validate_timeframe(timeframe)
    project_id = validate_project_id(project_id)
    
    # Validate date range if both provided
    if start_date and end_date:
        if datetime.strptime(start_date, "%Y-%m-%d") > datetime.strptime(end_date, "%Y-%m-%d"):
            raise ValidationError("start_date must be before end_date")
    
    try:
        service = get_query_service()
        result = service.get_pod_lead_stats_with_trainers(
            start_date=start_date,
            end_date=end_date,
            timeframe=timeframe,
            project_id=project_id
        )
        return result
    except ValidationError:
        raise
    except Exception as e:
        logger.error(f"Error getting POD lead stats: {e}")
        raise ServiceError(f"Failed to retrieve POD lead stats: {str(e)}")


@router.get(
    "/project-stats",
    summary="Get Project stats with POD Leads under each project"
)
async def get_project_stats(
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)")
) -> List[Dict[str, Any]]:
    """Get Project stats with POD Leads aggregated under each project"""
    try:
        service = get_query_service()
        result = service.get_project_stats_with_pod_leads(
            start_date=start_date,
            end_date=end_date
        )
        return result
    except Exception as e:
        logger.error(f"Error getting project stats: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
