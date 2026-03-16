"""
Analytics service for time-series data aggregation.

Provides data for the Analytics page charts:
- Tasks group: unique_tasks, new_tasks, rework_tasks, delivered
- Quality group: avg_rating, human_avg_rating, agentic_avg_rating, rework_percent
- Time & Efficiency group: aht_avg, accounted_hours, jibble_hours
- Finance group: revenue, cost, work_cost, non_work_cost, margin, margin_percent
- People group: trainers_active, team_size

Data is aggregated by period (daily/weekly/monthly) across all or filtered projects.
"""

import logging
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Any
from collections import defaultdict

from sqlalchemy import func, case, distinct, extract, text, and_, or_, literal
from sqlalchemy.orm import Session

from app.models.db_models import (
    Task,
    TaskHistoryRaw,
    TaskRaw,
    ContributorDailyStats,
    Contributor,
    ReviewDetail,
    JibbleHours,
    ProjectRevenueWeekly,
    ProjectCostDaily,
    PodLeadMapping,
    TrainerReviewStats,
)
from app.constants import get_constants

logger = logging.getLogger(__name__)


# =============================================================================
# KPI DEFINITIONS
# =============================================================================

KPI_DEFINITIONS = [
    # Tasks group
    {"key": "unique_tasks", "label": "Unique Tasks", "group": "Tasks", "unit": "count", "color": "#4CAF50"},
    {"key": "new_tasks", "label": "New Tasks", "group": "Tasks", "unit": "count", "color": "#66BB6A"},
    {"key": "rework_tasks", "label": "Rework Tasks", "group": "Tasks", "unit": "count", "color": "#FF9800"},
    {"key": "delivered", "label": "Delivered", "group": "Tasks", "unit": "count", "color": "#2196F3"},
    {"key": "in_queue", "label": "In Queue", "group": "Tasks", "unit": "count", "color": "#9C27B0"},
    # Quality group
    {"key": "avg_rating", "label": "Avg Rating", "group": "Quality", "unit": "rating", "color": "#E91E63"},
    {"key": "human_avg_rating", "label": "Human Avg Rating", "group": "Quality", "unit": "rating", "color": "#9C27B0"},
    {"key": "agentic_avg_rating", "label": "Agentic Avg Rating", "group": "Quality", "unit": "rating", "color": "#FF9800"},
    {"key": "rework_percent", "label": "Rework %", "group": "Quality", "unit": "percent", "color": "#FF5722"},
    {"key": "reviewer_fpy_pct", "label": "Reviewer FPY %", "group": "Quality", "unit": "percent", "color": "#3B82F6"},
    {"key": "auditor_fpy_pct", "label": "Auditor FPY %", "group": "Quality", "unit": "percent", "color": "#8B5CF6"},
    {"key": "avg_rework_per_task", "label": "Avg Rework/Task", "group": "Quality", "unit": "ratio", "color": "#F97316"},
    # Time & Efficiency group
    {"key": "aht_avg", "label": "AHT (hrs/task)", "group": "Time & Efficiency", "unit": "hours", "color": "#009688"},
    {"key": "accounted_hours", "label": "Accounted Hours", "group": "Time & Efficiency", "unit": "hours", "color": "#00BCD4"},
    {"key": "jibble_hours", "label": "Jibble Hours", "group": "Time & Efficiency", "unit": "hours", "color": "#3F51B5"},
    {"key": "efficiency_percent", "label": "Efficiency %", "group": "Time & Efficiency", "unit": "percent", "color": "#8BC34A"},
    # Finance group
    {"key": "revenue", "label": "Revenue", "group": "Finance", "unit": "currency", "color": "#4CAF50"},
    {"key": "cost", "label": "Cost", "group": "Finance", "unit": "currency", "color": "#F44336"},
    {"key": "work_cost", "label": "Work Cost", "group": "Finance", "unit": "currency", "color": "#E57373"},
    {"key": "non_work_cost", "label": "Non-Work Cost", "group": "Finance", "unit": "currency", "color": "#FFCDD2"},
    {"key": "margin", "label": "Margin", "group": "Finance", "unit": "currency", "color": "#FFC107"},
    {"key": "margin_percent", "label": "Margin %", "group": "Finance", "unit": "percent", "color": "#FFD54F"},
    # People group
    {"key": "trainers_active", "label": "Active Trainers", "group": "People", "unit": "count", "color": "#7E57C2"},
    {"key": "team_size", "label": "Team Size", "group": "People", "unit": "count", "color": "#AB47BC"},
]


def _get_period_boundaries(start_date: date, end_date: date, granularity: str) -> List[Dict[str, date]]:
    """Generate period boundaries for the given date range and granularity."""
    periods = []
    
    if granularity == 'daily':
        current = start_date
        while current <= end_date:
            periods.append({
                'start': current,
                'end': current,
                'label': current.strftime('%b %d'),
            })
            current += timedelta(days=1)
    
    elif granularity == 'weekly':
        # Align to Monday
        current = start_date - timedelta(days=start_date.weekday())
        while current <= end_date:
            week_end = current + timedelta(days=6)
            periods.append({
                'start': current,
                'end': min(week_end, end_date),
                'label': f"{current.strftime('%b %d')} - {week_end.strftime('%b %d')}",
            })
            current += timedelta(days=7)
    
    elif granularity == 'monthly':
        # Start from the first day of start_date's month
        current_year = start_date.year
        current_month = start_date.month
        while date(current_year, current_month, 1) <= end_date:
            month_start = date(current_year, current_month, 1)
            if current_month == 12:
                month_end = date(current_year + 1, 1, 1) - timedelta(days=1)
            else:
                month_end = date(current_year, current_month + 1, 1) - timedelta(days=1)
            
            periods.append({
                'start': month_start,
                'end': min(month_end, end_date),
                'label': month_start.strftime('%b %Y'),
            })
            
            if current_month == 12:
                current_year += 1
                current_month = 1
            else:
                current_month += 1
    
    return periods


def _get_project_ids_filter(project_id: Optional[int]) -> List[int]:
    """Get list of project IDs to filter on."""
    constants = get_constants()
    if project_id:
        return [project_id]
    return constants.projects.PRIMARY_PROJECT_IDS


def prefetch_fpy_data(
    session: Session,
    start_date: str,
    end_date: str,
) -> tuple:
    """
    Fetch ALL FPY review data from BigQuery in one call (all projects).
    Returns (fpy_reviews_by_date, fpy_role_map) to pass into get_analytics_time_series.
    """
    from datetime import datetime, date
    parsed_start = datetime.strptime(start_date, '%Y-%m-%d').date()
    parsed_end = datetime.strptime(end_date, '%Y-%m-%d').date()
    constants = get_constants()
    all_project_ids = constants.projects.ALL_PROJECT_IDS

    fpy_reviews_by_date: Dict[date, list] = defaultdict(list)
    fpy_role_map: dict = {}

    try:
        from app.config import get_settings
        settings = get_settings()
        from google.cloud import bigquery as bq_module
        bq_client = bq_module.Client(project=settings.gcp_project_id)
        gcp_p, gcp_d = settings.gcp_project_id, settings.bigquery_dataset
        pid_list = ','.join(str(i) for i in all_project_ids)

        fpy_query = f"""
        SELECT
            conv.project_id,
            r.conversation_id,
            cont.turing_email AS reviewer_email,
            JSON_EXTRACT_SCALAR(r.review_action, '$.type') AS action_type,
            DATE(r.submitted_at) AS review_date
        FROM `{gcp_p}.{gcp_d}.review` r
        JOIN `{gcp_p}.{gcp_d}.conversation` conv ON conv.id = r.conversation_id
        LEFT JOIN `{gcp_p}.{gcp_d}.contributor` cont ON cont.id = r.reviewer_id
        WHERE conv.project_id IN ({pid_list})
          AND r.review_type = 'manual'
          AND r.status = 'published'
          AND r.submitted_at IS NOT NULL
          AND DATE(r.submitted_at) >= '{parsed_start.isoformat()}'
          AND DATE(r.submitted_at) <= '{parsed_end.isoformat()}'
        ORDER BY r.conversation_id, r.submitted_at ASC
        """
        fpy_rows = list(bq_client.query(fpy_query).result())
        for row in fpy_rows:
            rd = row['review_date']
            if isinstance(rd, datetime):
                rd = rd.date()
            fpy_reviews_by_date[rd].append({
                'project_id': row['project_id'],
                'conversation_id': row['conversation_id'],
                'reviewer_email': (row['reviewer_email'] or '').lower().strip(),
                'action_type': (row['action_type'] or '').lower(),
            })

        pod_rows = session.query(PodLeadMapping.trainer_email, PodLeadMapping.role).all()
        for pr in pod_rows:
            if pr.trainer_email and pr.role:
                rl = pr.role.lower().strip()
                em = pr.trainer_email.lower().strip()
                if rl in ('pod lead', 'sub pod lead', 'pod_lead'):
                    fpy_role_map[em] = 'reviewer'
                elif rl in ('calibrator', 'auditor', 'team lead'):
                    fpy_role_map[em] = 'calibrator'
        try:
            from app.services.quality_rubrics_service import QualityRubricsService
            qr_svc = QualityRubricsService()
            for email, role in qr_svc._fetch_team_roles().items():
                fpy_role_map[email.lower().strip()] = role
        except Exception:
            pass

        logger.info(f"Prefetch FPY: Loaded {len(fpy_rows)} review rows for all projects")
    except Exception as e:
        logger.warning(f"Prefetch FPY failed (non-fatal): {e}")

    return fpy_reviews_by_date, fpy_role_map


def get_analytics_time_series(
    session: Session,
    start_date: str,
    end_date: str,
    granularity: str = 'weekly',
    project_id: Optional[int] = None,
    skip_bigquery_fpy: bool = False,
    prefetched_fpy_reviews: Optional[Dict] = None,
    prefetched_fpy_role_map: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Get time-series data for the Analytics page.
    
    Returns all KPIs aggregated by period for the given date range.
    """
    try:
        parsed_start = datetime.strptime(start_date, '%Y-%m-%d').date()
        parsed_end = datetime.strptime(end_date, '%Y-%m-%d').date()
    except (ValueError, TypeError) as e:
        logger.error(f"Invalid date format: {e}")
        return {"data": [], "available_kpis": KPI_DEFINITIONS}
    
    project_ids = _get_project_ids_filter(project_id)
    periods = _get_period_boundaries(parsed_start, parsed_end, granularity)
    constants = get_constants()
    
    if not periods:
        return {"data": [], "available_kpis": KPI_DEFINITIONS}
    
    logger.info(
        f"Analytics: {granularity} from {start_date} to {end_date}, "
        f"projects={project_ids}, periods={len(periods)}"
    )
    
    # =========================================================================
    # QUERY 1: Task metrics from task_history_raw
    # (unique_tasks, new_tasks, rework_tasks per period)
    # =========================================================================
    task_data = defaultdict(lambda: {
        'unique_tasks': 0, 'new_tasks': 0, 'rework_tasks': 0,
    })
    
    try:
        # Count DISTINCT tasks per day, split into new (first completion) vs rework
        # Use a subquery to get per-task max completed_status_count per day,
        # then count distinct tasks by category
        from sqlalchemy import and_
        task_sub = session.query(
            TaskHistoryRaw.date,
            TaskHistoryRaw.task_id,
            func.max(TaskHistoryRaw.completed_status_count).label('max_csc'),
        ).filter(
            TaskHistoryRaw.new_status == 'completed',
            TaskHistoryRaw.project_id.in_(project_ids),
            TaskHistoryRaw.date >= parsed_start,
            TaskHistoryRaw.date <= parsed_end,
        ).group_by(TaskHistoryRaw.date, TaskHistoryRaw.task_id).subquery()

        task_rows = session.query(
            task_sub.c.date,
            func.count(task_sub.c.task_id).label('unique_tasks'),
            func.sum(case(
                (task_sub.c.max_csc == 1, 1),
                else_=0
            )).label('new_tasks'),
            func.sum(case(
                (task_sub.c.max_csc > 1, 1),
                else_=0
            )).label('rework_tasks'),
        ).group_by(task_sub.c.date).all()
        
        for row in task_rows:
            key = row.date
            task_data[key]['unique_tasks'] = int(row.unique_tasks or 0)
            task_data[key]['new_tasks'] = int(row.new_tasks or 0)
            task_data[key]['rework_tasks'] = int(row.rework_tasks or 0)
    except Exception as e:
        logger.error(f"Analytics: Error querying task metrics: {e}")
    
    # =========================================================================
    # QUERY 2: Delivered tasks from task_raw (by delivery_date)
    # =========================================================================
    delivery_data = defaultdict(int)
    queue_data = defaultdict(int)
    
    try:
        # Delivered tasks
        delivered_rows = session.query(
            TaskRaw.delivery_date,
            func.count(distinct(TaskRaw.task_id)).label('delivered'),
        ).filter(
            TaskRaw.project_id.in_(project_ids),
            TaskRaw.delivery_date.isnot(None),
            TaskRaw.delivery_date >= parsed_start,
            TaskRaw.delivery_date <= parsed_end,
            TaskRaw.delivery_status == 'delivered',
        ).group_by(TaskRaw.delivery_date).all()
        
        for row in delivered_rows:
            delivery_data[row.delivery_date] = int(row.delivered or 0)
        
        # In-queue tasks (approved but not yet delivered) - by last_completed_date
        queue_rows = session.query(
            TaskRaw.last_completed_date,
            func.count(distinct(TaskRaw.task_id)).label('in_queue'),
        ).filter(
            TaskRaw.project_id.in_(project_ids),
            TaskRaw.last_completed_date.isnot(None),
            TaskRaw.last_completed_date >= parsed_start,
            TaskRaw.last_completed_date <= parsed_end,
            TaskRaw.derived_status == 'In Queue',
        ).group_by(TaskRaw.last_completed_date).all()
        
        for row in queue_rows:
            queue_data[row.last_completed_date] = int(row.in_queue or 0)
    except Exception as e:
        logger.error(f"Analytics: Error querying delivery metrics: {e}")
    
    # =========================================================================
    # QUERY 3: Quality metrics from trainer_review_stats
    # Split into: overall, human (manual/null), agentic (auto)
    # =========================================================================
    quality_data = defaultdict(lambda: {'sum_score': 0.0, 'count_reviews': 0})
    human_quality_data = defaultdict(lambda: {'sum_score': 0.0, 'count_reviews': 0})
    agentic_quality_data = defaultdict(lambda: {'sum_score': 0.0, 'count_reviews': 0})
    
    try:
        # Query all reviews with review_type so we can split
        review_rows = session.query(
            TrainerReviewStats.review_date,
            TrainerReviewStats.review_type,
            func.sum(TrainerReviewStats.score).label('sum_score'),
            func.count(TrainerReviewStats.id).label('count_reviews'),
        ).filter(
            TrainerReviewStats.project_id.in_(project_ids),
            TrainerReviewStats.review_date >= parsed_start,
            TrainerReviewStats.review_date <= parsed_end,
            TrainerReviewStats.score.isnot(None),
        ).group_by(TrainerReviewStats.review_date, TrainerReviewStats.review_type).all()
        
        for row in review_rows:
            d = row.review_date
            score = float(row.sum_score or 0)
            count = int(row.count_reviews or 0)
            
            # Overall (all review types)
            quality_data[d]['sum_score'] += score
            quality_data[d]['count_reviews'] += count
            
            # Split by type
            if row.review_type == 'auto':
                agentic_quality_data[d]['sum_score'] += score
                agentic_quality_data[d]['count_reviews'] += count
            else:
                # 'manual' or None = human review
                human_quality_data[d]['sum_score'] += score
                human_quality_data[d]['count_reviews'] += count
    except Exception as e:
        logger.error(f"Analytics: Error querying quality metrics: {e}")
    
    # =========================================================================
    # QUERY 4: People metrics - active trainers
    # Stores trainer emails per day so we can compute DISTINCT trainers
    # across any period (not just peak daily count).
    # Source: task_history_raw (directly counts who completed tasks)
    # =========================================================================
    people_data_by_day: Dict[date, set] = defaultdict(set)
    
    try:
        people_rows = session.query(
            TaskHistoryRaw.date,
            TaskHistoryRaw.author,
        ).filter(
            TaskHistoryRaw.new_status == 'completed',
            TaskHistoryRaw.project_id.in_(project_ids),
            TaskHistoryRaw.date >= parsed_start,
            TaskHistoryRaw.date <= parsed_end,
            TaskHistoryRaw.author.isnot(None),
        ).all()
        
        for row in people_rows:
            people_data_by_day[row.date].add(row.author)
    except Exception as e:
        logger.error(f"Analytics: Error querying people metrics: {e}")
    
    # =========================================================================
    # QUERY 5: Team size (distinct trainers mapped to projects)
    # =========================================================================
    team_size = 0
    try:
        team_size = session.query(
            func.count(distinct(PodLeadMapping.trainer_email))
        ).filter(
            PodLeadMapping.jibble_project.in_(
                [constants.projects.PROJECT_ID_TO_NAME.get(pid, '') for pid in project_ids]
            )
        ).scalar() or 0
    except Exception as e:
        logger.error(f"Analytics: Error querying team size: {e}")
    
    # =========================================================================
    # QUERY 6: Labeling-tool-active emails (for filtering Jibble hours)
    # Only sum Jibble hours for people who created tasks OR reviewed tasks.
    # Excludes managers/delivery leads with Jibble hours but zero tool activity.
    # =========================================================================
    labeling_active_emails: set = set()
    
    try:
        # Task creators: anyone who completed tasks (from people_data_by_day)
        for emails in people_data_by_day.values():
            labeling_active_emails.update(e.lower().strip() for e in emails if e)
        
        # Task creators: anyone who has tasks assigned (any status) from TaskRaw
        task_author_rows = session.query(
            distinct(func.lower(TaskRaw.trainer))
        ).filter(
            TaskRaw.project_id.in_(project_ids),
            TaskRaw.trainer.isnot(None),
        ).all()
        for row in task_author_rows:
            if row[0]:
                labeling_active_emails.add(row[0].lower().strip())
        
        # Reviewers: people from ReviewDetail who actually reviewed tasks
        reviewer_rows = session.query(
            distinct(func.lower(Contributor.turing_email))
        ).join(
            ReviewDetail, ReviewDetail.reviewer_id == Contributor.id
        ).join(
            Task, ReviewDetail.conversation_id == Task.id
        ).filter(
            Task.project_id.in_(project_ids),
            Contributor.turing_email.isnot(None),
            ReviewDetail.updated_at >= parsed_start,
            ReviewDetail.updated_at <= parsed_end,
        ).all()
        for row in reviewer_rows:
            if row[0]:
                labeling_active_emails.add(row[0].lower().strip())
        
        logger.info(f"Analytics: {len(labeling_active_emails)} labeling-active emails for Jibble filter")
    except Exception as e:
        logger.warning(f"Analytics: Could not build active-emails set: {e}")

    # =========================================================================
    # QUERY 6a-ii: Reviewers active per day (from ReviewDetail)
    # =========================================================================
    reviewer_emails_by_day: Dict[date, set] = defaultdict(set)
    try:
        rev_activity_rows = session.query(
            func.date(ReviewDetail.updated_at).label('rev_date'),
            func.lower(Contributor.turing_email).label('email'),
        ).join(
            Contributor, ReviewDetail.reviewer_id == Contributor.id
        ).join(
            Task, ReviewDetail.conversation_id == Task.id
        ).filter(
            Task.project_id.in_(project_ids),
            Contributor.turing_email.isnot(None),
            ReviewDetail.updated_at >= parsed_start,
            ReviewDetail.updated_at <= parsed_end,
        ).all()
        for row in rev_activity_rows:
            if row.email and row.rev_date:
                d = row.rev_date if isinstance(row.rev_date, date) else row.rev_date.date() if hasattr(row.rev_date, 'date') else row.rev_date
                reviewer_emails_by_day[d].add(row.email.strip())
    except Exception as e:
        logger.warning(f"Analytics: Error querying daily reviewer activity: {e}")

    # =========================================================================
    # QUERY 6a-iii: Jibble people per day (distinct people who logged hours)
    # =========================================================================
    jibble_people_by_day: Dict[date, set] = defaultdict(set)

    # =========================================================================
    # QUERY 6a-iv: Completed & Reviewed counts per day from task_raw
    # =========================================================================
    reviewed_by_day: Dict[date, int] = defaultdict(int)
    try:
        reviewed_rows = session.query(
            func.date(TaskRaw.r_updated_at).label('rev_date'),
            func.count(distinct(TaskRaw.task_id)).label('cnt'),
        ).filter(
            TaskRaw.project_id.in_(project_ids),
            TaskRaw.r_updated_at.isnot(None),
            func.date(TaskRaw.r_updated_at) >= parsed_start,
            func.date(TaskRaw.r_updated_at) <= parsed_end,
            TaskRaw.count_reviews > 0,
        ).group_by(func.date(TaskRaw.r_updated_at)).all()
        for row in reviewed_rows:
            reviewed_by_day[row.rev_date] = int(row.cnt or 0)
    except Exception as e:
        logger.warning(f"Analytics: Error querying reviewed daily: {e}")

    # =========================================================================
    # QUERY 6b: Jibble hours (filtered to labeling-tool-active people)
    #           Also split into reviewer vs trainer hours for target calc.
    # =========================================================================
    jibble_data = defaultdict(float)
    reviewer_jibble_data = defaultdict(float)

    # Build reviewer/calibrator email set, scoped to the current project(s)
    review_role_emails: set = set()
    try:
        pod_q = session.query(PodLeadMapping.trainer_email, PodLeadMapping.role)
        if project_id:
            proj_jibble_names = constants.jibble.PROJECT_ID_TO_JIBBLE_NAMES.get(project_id, [])
            if proj_jibble_names:
                pod_q = pod_q.filter(PodLeadMapping.jibble_project.in_(proj_jibble_names))
        for pr in pod_q.all():
            if pr.trainer_email and pr.role:
                rl = pr.role.lower().strip()
                if rl in ('pod lead', 'sub pod lead', 'pod_lead', 'calibrator', 'auditor', 'team lead'):
                    review_role_emails.add(pr.trainer_email.lower().strip())
        # Team sheet roles are specific to Math Proof Eval projects (59, 60)
        if not project_id or project_id in (59, 60):
            try:
                from app.services.quality_rubrics_service import QualityRubricsService
                qr_svc_roles = QualityRubricsService()
                for email, role in qr_svc_roles._fetch_team_roles().items():
                    review_role_emails.add(email.lower().strip())
            except Exception:
                pass
    except Exception:
        pass

    def _build_jibble_base_filter(q):
        """Apply common project + active-email filters to a Jibble query."""
        if project_id:
            jn = constants.jibble.PROJECT_ID_TO_JIBBLE_NAMES.get(project_id, [])
            if jn:
                q = q.filter(JibbleHours.project.in_(jn))
        else:
            all_jn = list(constants.jibble.JIBBLE_NAME_TO_PROJECT_ID.keys())
            if all_jn:
                q = q.filter(JibbleHours.project.in_(all_jn))
        if labeling_active_emails:
            q = q.filter(func.lower(JibbleHours.turing_email).in_(labeling_active_emails))
        return q

    try:
        # Total Jibble hours per day
        jibble_rows = session.query(
            JibbleHours.entry_date,
            func.sum(JibbleHours.logged_hours).label('total_hours'),
        ).filter(
            JibbleHours.entry_date >= parsed_start,
            JibbleHours.entry_date <= parsed_end,
        )
        jibble_rows = _build_jibble_base_filter(jibble_rows)
        jibble_rows = jibble_rows.group_by(JibbleHours.entry_date).all()

        for row in jibble_rows:
            jibble_data[row.entry_date] = float(row.total_hours or 0)

        # Reviewer-role Jibble hours per day (for subtracting from target calc)
        if review_role_emails:
            rev_jibble_rows = session.query(
                JibbleHours.entry_date,
                func.sum(JibbleHours.logged_hours).label('total_hours'),
            ).filter(
                JibbleHours.entry_date >= parsed_start,
                JibbleHours.entry_date <= parsed_end,
                func.lower(JibbleHours.turing_email).in_(review_role_emails),
            )
            rev_jibble_rows = _build_jibble_base_filter(rev_jibble_rows)
            rev_jibble_rows = rev_jibble_rows.group_by(JibbleHours.entry_date).all()
            for row in rev_jibble_rows:
                reviewer_jibble_data[row.entry_date] = float(row.total_hours or 0)

        # Also track distinct Jibble people per day
        jibble_people_q = session.query(
            JibbleHours.entry_date,
            func.lower(JibbleHours.turing_email).label('email'),
        ).filter(
            JibbleHours.entry_date >= parsed_start,
            JibbleHours.entry_date <= parsed_end,
            JibbleHours.turing_email.isnot(None),
        )
        if project_id:
            jibble_names2 = constants.jibble.PROJECT_ID_TO_JIBBLE_NAMES.get(project_id, [])
            if jibble_names2:
                jibble_people_q = jibble_people_q.filter(JibbleHours.project.in_(jibble_names2))
        else:
            all_jn = list(constants.jibble.JIBBLE_NAME_TO_PROJECT_ID.keys())
            if all_jn:
                jibble_people_q = jibble_people_q.filter(JibbleHours.project.in_(all_jn))
        if labeling_active_emails:
            jibble_people_q = jibble_people_q.filter(
                func.lower(JibbleHours.turing_email).in_(labeling_active_emails)
            )
        for row in jibble_people_q.all():
            if row.email and row.entry_date:
                jibble_people_by_day[row.entry_date].add(row.email.strip())
    except Exception as e:
        logger.error(f"Analytics: Error querying jibble hours: {e}")
    
    # =========================================================================
    # QUERY 7: Revenue (weekly only)
    # =========================================================================
    revenue_data = []  # list of (week_start, week_end, midpoint, revenue)
    
    try:
        revenue_rows = session.query(
            ProjectRevenueWeekly.week_start_date,
            ProjectRevenueWeekly.week_end_date,
            func.sum(ProjectRevenueWeekly.actual_revenue).label('revenue'),
        ).filter(
            ProjectRevenueWeekly.project_id.isnot(None),
            ProjectRevenueWeekly.project_id.in_(project_ids),
            ProjectRevenueWeekly.week_start_date >= parsed_start - timedelta(days=7),
            ProjectRevenueWeekly.week_start_date <= parsed_end,
        ).group_by(
            ProjectRevenueWeekly.week_start_date,
            ProjectRevenueWeekly.week_end_date,
        ).all()
        
        for row in revenue_rows:
            ws = row.week_start_date
            we = row.week_end_date or (ws + timedelta(days=6))
            midpoint = ws + timedelta(days=3)
            revenue_data.append({
                'start': ws, 'end': we, 'midpoint': midpoint,
                'revenue': float(row.revenue or 0),
            })
    except Exception as e:
        logger.error(f"Analytics: Error querying revenue: {e}")
    
    # =========================================================================
    # QUERY 8: Cost (daily)
    # =========================================================================
    cost_data = defaultdict(lambda: {'work': 0.0, 'non_work': 0.0})
    
    try:
        cost_rows = session.query(
            ProjectCostDaily.date,
            ProjectCostDaily.activity_type,
            func.sum(ProjectCostDaily.total_cost).label('total_cost'),
        ).filter(
            ProjectCostDaily.project_id.isnot(None),
            ProjectCostDaily.project_id.in_(project_ids),
            ProjectCostDaily.date >= parsed_start,
            ProjectCostDaily.date <= parsed_end,
        ).group_by(
            ProjectCostDaily.date,
            ProjectCostDaily.activity_type,
        ).all()
        
        for row in cost_rows:
            d = row.date
            cost = float(row.total_cost or 0)
            if 'non' in (row.activity_type or '').lower():
                cost_data[d]['non_work'] += cost
            else:
                cost_data[d]['work'] += cost
    except Exception as e:
        logger.error(f"Analytics: Error querying cost data: {e}")
    
    # =========================================================================
    # QUERY 9: AHT config — use constants (same source as main dashboard)
    # =========================================================================
    if project_id:
        proj_aht = constants.daily_targets.get_aht(project_id)
        aht_new = proj_aht.get('new_task_aht', constants.daily_targets.DEFAULT_NEW_TASK_AHT)
        aht_rework = proj_aht.get('rework_aht', constants.daily_targets.DEFAULT_REWORK_AHT)
    else:
        aht_new = constants.daily_targets.DEFAULT_NEW_TASK_AHT
        aht_rework = constants.daily_targets.DEFAULT_REWORK_AHT
    
    # =========================================================================
    # QUERY 10: FPY from BigQuery reviews (reviewer & auditor, per date)
    # =========================================================================
    fpy_reviews_by_date: Dict[date, list] = defaultdict(list)
    fpy_role_map: dict = {}

    if prefetched_fpy_reviews is not None and prefetched_fpy_role_map is not None:
        # Use pre-fetched data — filter to this project's IDs
        for d, revs in prefetched_fpy_reviews.items():
            for rev in revs:
                if rev['project_id'] in project_ids:
                    fpy_reviews_by_date[d].append(rev)
        fpy_role_map = prefetched_fpy_role_map
    elif not skip_bigquery_fpy:
        try:
            from app.config import get_settings
            settings = get_settings()
            from google.cloud import bigquery as bq_module
            bq_client = bq_module.Client(project=settings.gcp_project_id)
            gcp_p, gcp_d = settings.gcp_project_id, settings.bigquery_dataset
            pid_list = ','.join(str(i) for i in project_ids)

            fpy_query = f"""
            SELECT
                conv.project_id,
                r.conversation_id,
                cont.turing_email AS reviewer_email,
                JSON_EXTRACT_SCALAR(r.review_action, '$.type') AS action_type,
                DATE(r.submitted_at) AS review_date
            FROM `{gcp_p}.{gcp_d}.review` r
            JOIN `{gcp_p}.{gcp_d}.conversation` conv ON conv.id = r.conversation_id
            LEFT JOIN `{gcp_p}.{gcp_d}.contributor` cont ON cont.id = r.reviewer_id
            WHERE conv.project_id IN ({pid_list})
              AND r.review_type = 'manual'
              AND r.status = 'published'
              AND r.submitted_at IS NOT NULL
              AND DATE(r.submitted_at) >= '{parsed_start.isoformat()}'
              AND DATE(r.submitted_at) <= '{parsed_end.isoformat()}'
            ORDER BY r.conversation_id, r.submitted_at ASC
            """
            fpy_rows = list(bq_client.query(fpy_query).result())
            for row in fpy_rows:
                rd = row['review_date']
                if isinstance(rd, datetime):
                    rd = rd.date()
                fpy_reviews_by_date[rd].append({
                    'project_id': row['project_id'],
                    'conversation_id': row['conversation_id'],
                    'reviewer_email': (row['reviewer_email'] or '').lower().strip(),
                    'action_type': (row['action_type'] or '').lower(),
                })

            # Build role map
            pod_rows = session.query(PodLeadMapping.trainer_email, PodLeadMapping.role).all()
            for pr in pod_rows:
                if pr.trainer_email and pr.role:
                    rl = pr.role.lower().strip()
                    em = pr.trainer_email.lower().strip()
                    if rl in ('pod lead', 'sub pod lead', 'pod_lead'):
                        fpy_role_map[em] = 'reviewer'
                    elif rl in ('calibrator', 'auditor', 'team lead'):
                        fpy_role_map[em] = 'calibrator'
            try:
                from app.services.quality_rubrics_service import QualityRubricsService
                qr_svc = QualityRubricsService()
                for email, role in qr_svc._fetch_team_roles().items():
                    fpy_role_map[email.lower().strip()] = role
            except Exception:
                pass

            logger.info(f"Analytics: Loaded {len(fpy_rows)} FPY review rows for time-series")
        except Exception as e:
            logger.warning(f"Analytics: FPY query failed (non-fatal): {e}")

    # =========================================================================
    # AGGREGATE BY PERIOD
    # =========================================================================
    result_data = []
    
    for period in periods:
        p_start = period['start']
        p_end = period['end']
        
        # --- Tasks ---
        unique = 0
        new = 0
        rework = 0
        for d, vals in task_data.items():
            if p_start <= d <= p_end:
                unique += vals['unique_tasks']
                new += vals['new_tasks']
                rework += vals['rework_tasks']
        
        # --- Delivered & In Queue ---
        delivered = sum(v for d, v in delivery_data.items() if p_start <= d <= p_end)
        in_queue = sum(v for d, v in queue_data.items() if p_start <= d <= p_end)
        
        # --- Quality ---
        total_score = 0.0
        total_reviews = 0
        human_score = 0.0
        human_reviews = 0
        agentic_score = 0.0
        agentic_reviews = 0
        for d, vals in quality_data.items():
            if p_start <= d <= p_end:
                total_score += vals['sum_score']
                total_reviews += vals['count_reviews']
        for d, vals in human_quality_data.items():
            if p_start <= d <= p_end:
                human_score += vals['sum_score']
                human_reviews += vals['count_reviews']
        for d, vals in agentic_quality_data.items():
            if p_start <= d <= p_end:
                agentic_score += vals['sum_score']
                agentic_reviews += vals['count_reviews']
        
        avg_rating = round(total_score / total_reviews, 2) if total_reviews > 0 else None
        human_avg_rating = round(human_score / human_reviews, 2) if human_reviews > 0 else None
        agentic_avg_rating = round(agentic_score / agentic_reviews, 2) if agentic_reviews > 0 else None
        # Rework % = rework / (rework + new_tasks) * 100  (caps at 100%)
        # Consistent with query_service.py formula
        submissions = new + rework
        rework_pct = round((rework / submissions) * 100, 1) if submissions > 0 else None
        
        # --- People (distinct trainers across the whole period) ---
        period_trainers: set = set()
        for d, emails in people_data_by_day.items():
            if p_start <= d <= p_end:
                period_trainers.update(emails)
        active_trainers = len(period_trainers)

        # --- Reviewers active in period ---
        period_reviewers: set = set()
        for d, emails in reviewer_emails_by_day.items():
            if p_start <= d <= p_end:
                period_reviewers.update(emails)

        # Labeling tool people = trainers + reviewers (union)
        labeling_tool_people = len(period_trainers | period_reviewers)

        # --- Jibble people in period ---
        period_jibble_people: set = set()
        for d, emails in jibble_people_by_day.items():
            if p_start <= d <= p_end:
                period_jibble_people.update(emails)
        jibble_people = len(period_jibble_people)

        # --- Completed (= unique tasks from task_history_raw, consistent with accounted) ---
        period_completed = unique
        # --- Reviewed ---
        period_reviewed = sum(v for d, v in reviewed_by_day.items() if p_start <= d <= p_end)

        # --- Jibble Hours ---
        period_jibble = round(sum(v for d, v in jibble_data.items() if p_start <= d <= p_end), 1)
        
        # --- AHT & Accounted Hours ---
        accounted = round(new * aht_new + rework * aht_rework, 1) if (new + rework) > 0 else 0
        aht_avg = round(accounted / unique, 1) if unique > 0 else None
        
        # --- Efficiency ---
        eff_pct = round((accounted / period_jibble) * 100, 1) if period_jibble > 0 and accounted > 0 else None

        # --- Target (trainer hours only / new_task_aht) ---
        period_reviewer_jibble = round(sum(v for d, v in reviewer_jibble_data.items() if p_start <= d <= p_end), 1)
        trainer_only_jibble = max(period_jibble - period_reviewer_jibble, 0)
        target = round(trainer_only_jibble / aht_new, 1) if trainer_only_jibble > 0 and aht_new > 0 else 0
        
        # --- Revenue (use midpoint matching) ---
        period_revenue = 0.0
        for rv in revenue_data:
            if p_start <= rv['midpoint'] <= p_end:
                period_revenue += rv['revenue']
        
        # --- Cost ---
        period_work_cost = 0.0
        period_non_work_cost = 0.0
        for d, vals in cost_data.items():
            if p_start <= d <= p_end:
                period_work_cost += vals['work']
                period_non_work_cost += vals['non_work']
        period_cost = round(period_work_cost + period_non_work_cost, 2)
        period_work_cost = round(period_work_cost, 2)
        period_non_work_cost = round(period_non_work_cost, 2)
        
        # --- Margin ---
        period_margin = round(period_revenue - period_cost, 2) if period_revenue > 0 else None
        period_margin_pct = round(((period_revenue - period_cost) / period_revenue) * 100, 1) if period_revenue > 0 else None
        
        # --- FPY (Reviewer & Auditor) ---
        period_reviews: list = []
        for d, revs in fpy_reviews_by_date.items():
            if p_start <= d <= p_end:
                period_reviews.extend(revs)

        r_total, r_pass, a_total, a_pass = 0, 0, 0, 0
        seen_fpy: dict = {}  # conv_id → {reviewer: bool, calibrator: bool}
        for rev in period_reviews:
            cid = rev['conversation_id']
            email = rev['reviewer_email']
            action = rev['action_type']
            role = fpy_role_map.get(email, 'reviewer')

            if cid not in seen_fpy:
                seen_fpy[cid] = {}
            if role == 'reviewer' and 'reviewer' not in seen_fpy[cid]:
                seen_fpy[cid]['reviewer'] = True
                r_total += 1
                if action != 'rework':
                    r_pass += 1
            elif role == 'calibrator' and 'calibrator' not in seen_fpy[cid]:
                seen_fpy[cid]['calibrator'] = True
                a_total += 1
                if action != 'rework':
                    a_pass += 1

        reviewer_fpy_pct = round(r_pass / r_total * 100, 1) if r_total > 0 else None
        auditor_fpy_pct = round(a_pass / a_total * 100, 1) if a_total > 0 else None

        # --- Avg Rework Per Task ---
        avg_rework_per_task = round(rework / unique, 2) if unique > 0 else None
        
        result_data.append({
            'period': p_start.isoformat(),
            'period_end': p_end.isoformat(),
            'period_label': period['label'],
            # Tasks
            'unique_tasks': unique,
            'new_tasks': new,
            'rework_tasks': rework,
            'delivered': delivered,
            'in_queue': in_queue,
            # Quality
            'avg_rating': avg_rating,
            'human_avg_rating': human_avg_rating,
            'agentic_avg_rating': agentic_avg_rating,
            'rework_percent': rework_pct,
            'reviewer_fpy_pct': reviewer_fpy_pct,
            'auditor_fpy_pct': auditor_fpy_pct,
            'avg_rework_per_task': avg_rework_per_task,
            # Time & Efficiency
            'aht_avg': aht_avg,
            'accounted_hours': accounted,
            'jibble_hours': period_jibble,
            'efficiency_percent': eff_pct,
            # Finance
            'revenue': round(period_revenue, 2),
            'cost': period_cost,
            'work_cost': period_work_cost,
            'non_work_cost': period_non_work_cost,
            'margin': period_margin,
            'margin_percent': period_margin_pct,
            # People
            'trainers_active': active_trainers,
            'team_size': team_size,
            'labeling_tool_people': labeling_tool_people,
            'jibble_people': jibble_people,
            # Additional delivery
            'completed': period_completed,
            'reviewed': period_reviewed,
            'target': target,
        })
    
    # =========================================================================
    # COMPUTE SUMMARY CARDS (current period vs previous period)
    # =========================================================================
    # Total distinct trainers across the entire date range (union of all days)
    all_trainers: set = set()
    for emails in people_data_by_day.values():
        all_trainers.update(emails)
    total_distinct_trainers = len(all_trainers)
    
    summary = _compute_summary_cards(result_data, parsed_start, parsed_end, granularity, total_distinct_trainers)
    
    return {
        "data": result_data,
        "summary": summary,
        "available_kpis": KPI_DEFINITIONS,
        "granularity": granularity,
        "revenue_available": granularity in ('weekly', 'monthly'),
    }


def _compute_summary_cards(
    data: List[Dict],
    start_date: date,
    end_date: date,
    granularity: str,
    total_distinct_trainers: int = 0,
) -> List[Dict[str, Any]]:
    """Compute summary KPI cards with trend vs previous period."""
    if not data:
        return []
    
    # Current period totals
    current = {
        'unique_tasks': sum(d['unique_tasks'] for d in data),
        'delivered': sum(d['delivered'] for d in data),
        'trainers_active': total_distinct_trainers,
        'revenue': sum(d['revenue'] for d in data),
        'cost': sum(d['cost'] for d in data),
    }
    
    # Average metrics
    rated = [d for d in data if d['avg_rating'] is not None]
    current['avg_rating'] = round(sum(d['avg_rating'] for d in rated) / len(rated), 2) if rated else None
    
    human_rated = [d for d in data if d.get('human_avg_rating') is not None]
    current['human_avg_rating'] = round(sum(d['human_avg_rating'] for d in human_rated) / len(human_rated), 2) if human_rated else None
    
    agentic_rated = [d for d in data if d.get('agentic_avg_rating') is not None]
    current['agentic_avg_rating'] = round(sum(d['agentic_avg_rating'] for d in agentic_rated) / len(agentic_rated), 2) if agentic_rated else None
    
    total_new = sum(d['new_tasks'] for d in data)
    total_rework = sum(d['rework_tasks'] for d in data)
    total_submissions = total_new + total_rework
    current['rework_percent'] = round((total_rework / total_submissions) * 100, 1) if total_submissions > 0 else None
    
    total_unique = current['unique_tasks']
    accounted = sum(d['accounted_hours'] for d in data)
    current['aht_avg'] = round(accounted / total_unique, 1) if total_unique > 0 else None
    current['jibble_hours'] = round(sum(d['jibble_hours'] for d in data), 1)
    
    margin_rev = current['revenue']
    margin_cost = current['cost']
    current['margin_percent'] = round(((margin_rev - margin_cost) / margin_rev) * 100, 1) if margin_rev > 0 else None
    
    # Build summary cards
    cards = [
        {
            'key': 'unique_tasks', 'label': 'Unique Tasks',
            'value': current['unique_tasks'], 'unit': 'count',
            'color': '#4CAF50',
        },
        {
            'key': 'delivered', 'label': 'Delivered',
            'value': current['delivered'], 'unit': 'count',
            'color': '#2196F3',
        },
        {
            'key': 'trainers_active', 'label': 'Active Trainers',
            'value': current['trainers_active'], 'unit': 'count',
            'color': '#7E57C2',
        },
        {
            'key': 'avg_rating', 'label': 'Avg Rating',
            'value': current['avg_rating'], 'unit': 'rating',
            'color': '#E91E63',
        },
        {
            'key': 'revenue', 'label': 'Revenue',
            'value': current['revenue'], 'unit': 'currency',
            'color': '#4CAF50',
        },
        {
            'key': 'margin_percent', 'label': 'Margin %',
            'value': current['margin_percent'], 'unit': 'percent',
            'color': '#FFC107',
        },
    ]
    
    return cards
