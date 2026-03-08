"""Router for quality rubrics data (Advanced Math EVAL Quality Report)."""
import logging
from fastapi import APIRouter, HTTPException, Query

from app.services.quality_rubrics_service import get_quality_rubrics_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/quality-rubrics", tags=["Quality Rubrics"])


@router.get("/data", summary="Get all quality rubrics data from Google Sheet")
async def get_quality_rubrics_data(refresh: bool = Query(False, description="Force refresh from Google Sheet")):
    try:
        service = get_quality_rubrics_service()
        data = service.get_data(force_refresh=refresh)
        return data
    except Exception as e:
        logger.error(f"Error fetching quality rubrics data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch quality rubrics data: {str(e)}")
