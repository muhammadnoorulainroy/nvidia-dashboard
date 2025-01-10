"""
Jibble API endpoints for time tracking data
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel

from app.services.db_service import get_db_session
from app.services.jibble_service import JibbleService, JibbleSyncService

router = APIRouter(prefix="/jibble", tags=["jibble"])


class JibbleTestResponse(BaseModel):
    success: bool
    message: str
    has_token: bool
    sample_people: Optional[int] = None


class JibbleSyncResponse(BaseModel):
    success: bool
    people_synced: int
    time_entries_synced: int
    month_synced: Optional[dict] = None
    error: Optional[str] = None


class TrainerHoursEntry(BaseModel):
    trainer_email: str
    trainer_name: Optional[str] = None
    date: Optional[str] = None
    hours: float
    pod_lead: Optional[str] = None
    status: Optional[str] = None


class TrainerHoursSummary(BaseModel):
    trainer_email: str
    trainer_name: Optional[str] = None
    total_hours: float
    pod_lead: Optional[str] = None
    status: Optional[str] = None
    daily_hours: List[dict] = []


@router.get("/test", response_model=JibbleTestResponse)
async def test_jibble_connection():
    """Test the Jibble API connection"""
    try:
        jibble = JibbleService()
        result = jibble.test_connection()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error testing Jibble: {str(e)}")


@router.post("/sync", response_model=JibbleSyncResponse)
async def sync_jibble_data():
    """Sync all Jibble data (people + time entries for current month)"""
    try:
        with get_db_session() as session:
            sync_service = JibbleSyncService(session)
            result = sync_service.full_sync()
            return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error syncing Jibble: {str(e)}")


@router.get("/trainer-hours", response_model=List[TrainerHoursEntry])
async def get_trainer_hours(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Get daily hours for all trainers from Nvidia project.
    
    Query params:
    - start_date: YYYY-MM-DD (defaults to start of current month)
    - end_date: YYYY-MM-DD (defaults to today)
    """
    try:
        # Parse dates
        if start_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        else:
            today = datetime.now()
            start_dt = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        if end_date:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        else:
            end_dt = datetime.now()
        
        with get_db_session() as session:
            sync_service = JibbleSyncService(session)
            results = sync_service.get_trainer_hours(start_dt, end_dt)
            return results
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching trainer hours: {str(e)}")


@router.get("/trainer-hours-summary", response_model=List[TrainerHoursSummary])
async def get_trainer_hours_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """
    Get aggregated hours per trainer with daily breakdown.
    
    Query params:
    - start_date: YYYY-MM-DD (defaults to start of current month)
    - end_date: YYYY-MM-DD (defaults to today)
    """
    try:
        # Parse dates
        if start_date:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        else:
            today = datetime.now()
            start_dt = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        if end_date:
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        else:
            end_dt = datetime.now()
        
        with get_db_session() as session:
            sync_service = JibbleSyncService(session)
            entries = sync_service.get_trainer_hours(start_dt, end_dt)
            
            # Aggregate by trainer
            trainer_data = {}
            for entry in entries:
                email = entry["trainer_email"]
                if email not in trainer_data:
                    trainer_data[email] = {
                        "trainer_email": email,
                        "trainer_name": entry.get("trainer_name"),
                        "total_hours": 0,
                        "pod_lead": entry.get("pod_lead"),
                        "status": entry.get("status"),
                        "daily_hours": [],
                    }
                
                trainer_data[email]["total_hours"] += entry.get("hours", 0)
                trainer_data[email]["daily_hours"].append({
                    "date": entry.get("date"),
                    "hours": entry.get("hours", 0),
                })
            
            # Round total hours
            for data in trainer_data.values():
                data["total_hours"] = round(data["total_hours"], 2)
                # Sort daily hours by date
                data["daily_hours"].sort(key=lambda x: x["date"] if x["date"] else "")
            
            return list(trainer_data.values())
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching trainer hours: {str(e)}")
