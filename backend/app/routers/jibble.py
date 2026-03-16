"""
Jibble API endpoints for time tracking data
"""
import logging
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
from sqlalchemy import func

from app.services.db_service import get_db_session, get_db_service
from app.services.jibble_service import JibbleService, JibbleSyncService
from app.models.db_models import JibbleHours, TimeTheftExclusion, TaskHistoryRaw, TaskRaw
from app.constants import get_constants
from sqlalchemy import distinct

logger = logging.getLogger(__name__)

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
        raise HTTPException(status_code=500, detail=f"Error fetching trainer hours (daily): {str(e)}")


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
        raise HTTPException(status_code=500, detail=f"Error fetching trainer hours (summary): {str(e)}")


class JibbleUserHours(BaseModel):
    full_name: Optional[str] = None
    turing_email: Optional[str] = None
    jibble_email: Optional[str] = None
    member_code: Optional[str] = None
    total_hours: float
    project: str


@router.get("/project-hours", response_model=List[JibbleUserHours])
async def get_project_jibble_hours(
    project_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """
    Get aggregated Jibble hours per user for a project within a date range.
    Returns everyone who logged hours, regardless of team mapping.
    """
    try:
        constants = get_constants()
        jibble_config = constants.jibble
        db = get_db_service()

        jibble_project_names: List[str] = []
        if project_id:
            jibble_project_names = jibble_config.PROJECT_ID_TO_JIBBLE_NAMES.get(project_id, [])
        else:
            for names in jibble_config.PROJECT_ID_TO_JIBBLE_NAMES.values():
                jibble_project_names.extend(names)
            jibble_project_names = list(set(jibble_project_names))

        with db.get_session() as session:
            query = session.query(
                JibbleHours.full_name,
                JibbleHours.turing_email,
                JibbleHours.jibble_email,
                JibbleHours.member_code,
                JibbleHours.project,
                func.sum(JibbleHours.logged_hours).label('total_hours'),
            )

            if jibble_project_names:
                query = query.filter(JibbleHours.project.in_(jibble_project_names))

            if start_date:
                query = query.filter(JibbleHours.entry_date >= start_date)
            if end_date:
                query = query.filter(JibbleHours.entry_date <= end_date)

            query = query.group_by(
                JibbleHours.member_code,
                JibbleHours.full_name,
                JibbleHours.turing_email,
                JibbleHours.jibble_email,
                JibbleHours.project,
            ).order_by(func.sum(JibbleHours.logged_hours).desc())

            results = []
            for row in query.all():
                results.append(JibbleUserHours(
                    full_name=row.full_name,
                    turing_email=row.turing_email,
                    jibble_email=row.jibble_email,
                    member_code=row.member_code,
                    total_hours=round(float(row.total_hours or 0), 2),
                    project=row.project,
                ))

            return results

    except Exception as e:
        logger.error(f"Error fetching project jibble hours: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Time Theft
# ============================================================================

class TimeTheftEntry(BaseModel):
    full_name: Optional[str] = None
    turing_email: Optional[str] = None
    jibble_email: Optional[str] = None
    total_hours: float
    project: str
    excluded: bool = False


class ExcludeRequest(BaseModel):
    turing_email: str
    reason: Optional[str] = None


@router.get("/time-theft", response_model=List[TimeTheftEntry])
async def get_time_theft(
    project_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    show_excluded: bool = False,
):
    """
    People who logged Jibble hours but have ZERO labeling tool activity
    (no task completions, no reviews, no deliveries) for the given project/date range.
    """
    try:
        constants = get_constants()
        jibble_config = constants.jibble
        db = get_db_service()

        project_ids: List[int] = []
        jibble_project_names: List[str] = []
        if project_id:
            project_ids = [project_id]
            jibble_project_names = jibble_config.PROJECT_ID_TO_JIBBLE_NAMES.get(project_id, [])
        else:
            project_ids = constants.projects.PRIMARY_PROJECT_IDS
            for names in jibble_config.PROJECT_ID_TO_JIBBLE_NAMES.values():
                jibble_project_names.extend(names)
            jibble_project_names = list(set(jibble_project_names))

        with db.get_session() as session:
            # 1. Get all people with Jibble hours
            jibble_query = session.query(
                JibbleHours.full_name,
                JibbleHours.turing_email,
                JibbleHours.jibble_email,
                JibbleHours.project,
                func.sum(JibbleHours.logged_hours).label('total_hours'),
            )
            if jibble_project_names:
                jibble_query = jibble_query.filter(JibbleHours.project.in_(jibble_project_names))
            if start_date:
                jibble_query = jibble_query.filter(JibbleHours.entry_date >= start_date)
            if end_date:
                jibble_query = jibble_query.filter(JibbleHours.entry_date <= end_date)
            jibble_query = jibble_query.group_by(
                JibbleHours.turing_email, JibbleHours.full_name,
                JibbleHours.jibble_email, JibbleHours.project,
            )
            jibble_rows = jibble_query.all()

            # 2. Build set of labeling-tool-active emails
            active_emails: set = set()

            # Task creators — anyone who ever created a task, regardless of status
            author_q = session.query(distinct(func.lower(TaskHistoryRaw.author))).filter(
                TaskHistoryRaw.project_id.in_(project_ids),
                TaskHistoryRaw.author.isnot(None),
            )
            if start_date:
                author_q = author_q.filter(TaskHistoryRaw.date >= start_date)
            if end_date:
                author_q = author_q.filter(TaskHistoryRaw.date <= end_date)
            for row in author_q.all():
                if row[0]:
                    active_emails.add(row[0].lower().strip())

            # Reviewers — anyone who reviewed a task on the project
            reviewer_q = session.query(distinct(func.lower(TaskRaw.reviewer))).filter(
                TaskRaw.project_id.in_(project_ids),
                TaskRaw.reviewer.isnot(None),
            )
            for row in reviewer_q.all():
                if row[0]:
                    active_emails.add(row[0].lower().strip())

            logger.info(f"Time theft: {len(active_emails)} active emails (task creators + reviewers), {len(jibble_rows)} jibble rows")

            # 3. Get excluded emails
            excluded_set: set = set()
            for row in session.query(TimeTheftExclusion.turing_email).all():
                excluded_set.add(row.turing_email.lower().strip())

            # 4. Filter to people with Jibble hours but NOT in active_emails
            results = []
            for row in jibble_rows:
                email = (row.turing_email or '').lower().strip()
                if not email:
                    email = (row.jibble_email or '').lower().strip()
                if email in active_emails:
                    continue
                is_excluded = email in excluded_set
                if is_excluded and not show_excluded:
                    continue
                results.append(TimeTheftEntry(
                    full_name=row.full_name,
                    turing_email=row.turing_email,
                    jibble_email=row.jibble_email,
                    total_hours=round(float(row.total_hours or 0), 2),
                    project=row.project,
                    excluded=is_excluded,
                ))

            results.sort(key=lambda x: -x.total_hours)
            return results

    except Exception as e:
        logger.error(f"Error fetching time theft data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/time-theft/exclude")
async def exclude_from_time_theft(req: ExcludeRequest):
    """Mark a person as excluded from the time theft list (e.g., managers)."""
    try:
        db = get_db_service()
        with db.get_session() as session:
            existing = session.query(TimeTheftExclusion).filter(
                func.lower(TimeTheftExclusion.turing_email) == req.turing_email.lower().strip()
            ).first()
            if existing:
                return {"status": "already_excluded", "email": req.turing_email}
            session.add(TimeTheftExclusion(
                turing_email=req.turing_email.lower().strip(),
                reason=req.reason,
            ))
            session.commit()
            return {"status": "excluded", "email": req.turing_email}
    except Exception as e:
        logger.error(f"Error excluding from time theft: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/time-theft/exclude")
async def remove_time_theft_exclusion(turing_email: str):
    """Remove a person from the time theft exclusion list."""
    try:
        db = get_db_service()
        with db.get_session() as session:
            deleted = session.query(TimeTheftExclusion).filter(
                func.lower(TimeTheftExclusion.turing_email) == turing_email.lower().strip()
            ).delete(synchronize_session=False)
            session.commit()
            return {"status": "removed" if deleted else "not_found", "email": turing_email}
    except Exception as e:
        logger.error(f"Error removing time theft exclusion: {e}")
        raise HTTPException(status_code=500, detail=str(e))
