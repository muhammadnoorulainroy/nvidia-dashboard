"""Router for quality rubrics data (Advanced Math EVAL Quality Report)."""
import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from app.services.quality_rubrics_service import get_quality_rubrics_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/quality-rubrics", tags=["Quality Rubrics"])


@router.get("/data", summary="Get quality rubrics data")
async def get_quality_rubrics_data(
    project_id: Optional[int] = Query(
        60,
        description="Project ID. Use 60 for live BigQuery data, omit for Google Sheet data.",
    ),
    refresh: bool = Query(False, description="Force refresh from data source"),
    start_date: Optional[str] = Query(None, description="Start date filter (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date filter (YYYY-MM-DD)"),
):
    try:
        service = get_quality_rubrics_service()
        data = service.get_data(
            project_id=project_id,
            force_refresh=refresh,
            start_date=start_date,
            end_date=end_date,
        )
        return data
    except Exception as e:
        logger.error(f"Error fetching quality rubrics data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch quality rubrics data: {str(e)}")
