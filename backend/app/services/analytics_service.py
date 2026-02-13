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
    TaskHistoryRaw,
    TaskRaw,
    ContributorDailyStats,
    Contributor,
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


def get_analytics_time_series(
    session: Session,
    start_date: str,
    end_date: str,
    granularity: str = 'weekly',
    project_id: Optional[int] = None,
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
        task_rows = session.query(
            TaskHistoryRaw.date,
            func.count(distinct(TaskHistoryRaw.task_id)).label('unique_tasks'),
            func.sum(case(
                (TaskHistoryRaw.completed_status_count == 1, 1),
                else_=0
            )).label('new_tasks'),
            func.sum(case(
                (TaskHistoryRaw.completed_status_count > 1, 1),
                else_=0
            )).label('rework_tasks'),
        ).filter(
            TaskHistoryRaw.new_status == 'completed',
            TaskHistoryRaw.project_id.in_(project_ids),
            TaskHistoryRaw.date >= parsed_start,
            TaskHistoryRaw.date <= parsed_end,
        ).group_by(TaskHistoryRaw.date).all()
        
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
    # QUERY 6: Jibble hours
    # =========================================================================
    jibble_data = defaultdict(float)
    
    try:
        jibble_rows = session.query(
            JibbleHours.entry_date,
            func.sum(JibbleHours.logged_hours).label('total_hours'),
        ).filter(
            JibbleHours.entry_date >= parsed_start,
            JibbleHours.entry_date <= parsed_end,
        )
        
        # Filter by project if specific project selected
        if project_id:
            project_name = constants.projects.PROJECT_ID_TO_NAME.get(project_id, '')
            jibble_mapping = constants.jibble.JIBBLE_NAME_TO_PROJECT_ID
            jibble_names = [name for name, pid in jibble_mapping.items() if pid == project_id]
            if jibble_names:
                jibble_rows = jibble_rows.filter(JibbleHours.project.in_(jibble_names))
        else:
            # All nvidia projects
            all_jibble_names = list(constants.jibble.JIBBLE_NAME_TO_PROJECT_ID.keys())
            if all_jibble_names:
                jibble_rows = jibble_rows.filter(JibbleHours.project.in_(all_jibble_names))
        
        jibble_rows = jibble_rows.group_by(JibbleHours.entry_date).all()
        
        for row in jibble_rows:
            jibble_data[row.entry_date] = float(row.total_hours or 0)
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
    # QUERY 9: AHT config
    # =========================================================================
    aht_new = constants.aht.DEFAULT_NEW_TASK_AHT
    aht_rework = constants.aht.DEFAULT_REWORK_AHT
    
    try:
        from app.models.db_models import AHTConfiguration
        # Get average AHT across projects
        aht_rows = session.query(
            func.avg(AHTConfiguration.new_task_aht).label('avg_new'),
            func.avg(AHTConfiguration.rework_aht).label('avg_rework'),
        ).filter(
            AHTConfiguration.project_id.in_(project_ids)
        ).first()
        
        if aht_rows and aht_rows.avg_new:
            aht_new = float(aht_rows.avg_new)
        if aht_rows and aht_rows.avg_rework:
            aht_rework = float(aht_rows.avg_rework)
    except Exception as e:
        logger.warning(f"Analytics: Using default AHT values: {e}")
    
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
        
        # --- Jibble Hours ---
        period_jibble = round(sum(v for d, v in jibble_data.items() if p_start <= d <= p_end), 1)
        
        # --- AHT & Accounted Hours ---
        accounted = round(new * aht_new + rework * aht_rework, 1) if (new + rework) > 0 else 0
        aht_avg = round(accounted / unique, 1) if unique > 0 else None
        
        # --- Efficiency ---
        eff_pct = round((accounted / period_jibble) * 100, 1) if period_jibble > 0 and accounted > 0 else None
        
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
