"""
API endpoints for the Analytics page.

Provides time-series data for interactive charts with filtering by:
- Granularity: daily, weekly, monthly
- Date range: start_date, end_date
- Project: optional project_id filter
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Optional, Dict, Any
import logging
from datetime import datetime, timedelta

from app.services.db_service import get_db_service
from app.services.analytics_service import get_analytics_time_series

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _validate_date(date_str: Optional[str], field_name: str) -> Optional[str]:
    """Validate date format (YYYY-MM-DD)."""
    if not date_str:
        return None
    try:
        datetime.strptime(date_str, '%Y-%m-%d')
        return date_str
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {field_name} format. Expected YYYY-MM-DD, got: {date_str}"
        )


@router.get("/time-series")
async def get_time_series(
    granularity: str = Query(
        default="weekly",
        regex="^(daily|weekly|monthly)$",
        description="Aggregation granularity"
    ),
    start_date: Optional[str] = Query(
        default=None,
        description="Start date (YYYY-MM-DD). Defaults to 12 weeks ago."
    ),
    end_date: Optional[str] = Query(
        default=None,
        description="End date (YYYY-MM-DD). Defaults to today."
    ),
    project_id: Optional[int] = Query(
        default=None,
        description="Filter by project ID. None = all projects."
    ),
) -> Dict[str, Any]:
    """
    Get time-series analytics data for charts.
    
    Returns KPI data aggregated by period (daily/weekly/monthly) with:
    - Task metrics (unique, new, rework, delivered)
    - Quality metrics (avg rating, rework %)
    - Efficiency metrics (AHT, accounted hours, jibble hours)
    - Financial metrics (revenue, cost, margin)
    - People metrics (active trainers, team size)
    - Summary cards with current totals
    """
    # Validate dates
    _validate_date(start_date, "start_date")
    _validate_date(end_date, "end_date")
    
    # Set defaults
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')
    if not start_date:
        # Default: 12 weeks back
        default_start = datetime.now() - timedelta(weeks=12)
        start_date = default_start.strftime('%Y-%m-%d')
    
    # Validate project_id
    if project_id is not None:
        from app.constants import get_constants
        constants = get_constants()
        valid_ids = constants.projects.ALL_PROJECT_IDS
        if project_id not in valid_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid project_id: {project_id}. Valid IDs: {valid_ids}"
            )
    
    try:
        db_service = get_db_service()
        session = db_service.SessionLocal()
        try:
            result = get_analytics_time_series(
                session=session,
                start_date=start_date,
                end_date=end_date,
                granularity=granularity,
                project_id=project_id,
            )
            return result
        finally:
            session.close()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analytics time-series error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch analytics data: {str(e)}"
        )
