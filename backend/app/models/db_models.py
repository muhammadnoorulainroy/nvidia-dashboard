"""
SQLAlchemy database models for nvidia dashboard

Includes optimized indexes for common query patterns.
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Date, BigInteger, Index, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class Task(Base):
    """Task table - synced from BigQuery conversation table"""
    __tablename__ = 'task'
    __table_args__ = (
        Index('ix_task_status_domain', 'status', 'domain'),
        Index('ix_task_current_user_status', 'current_user_id', 'status'),
        Index('ix_task_project_batch', 'project_id', 'batch_id'),
        Index('ix_task_last_completed_date', 'last_completed_date'),
    )
    
    id = Column(BigInteger, primary_key=True)
    created_at = Column(DateTime, index=True)
    updated_at = Column(DateTime, index=True)
    statement = Column(Text)
    status = Column(String(50), index=True)
    project_id = Column(Integer, index=True)
    batch_id = Column(Integer)
    current_user_id = Column(Integer, index=True)
    colab_link = Column(Text)
    is_delivered = Column(String(10), default='False', index=True)
    rework_count = Column(Integer, default=0)
    domain = Column(String(255), index=True)
    week_number = Column(Integer)
    number_of_turns = Column(Integer, default=0)
    last_completed_date = Column(Date)


class ReviewDetail(Base):
    """Review detail table - synced from BigQuery CTE results"""
    __tablename__ = 'review_detail'
    __table_args__ = (
        Index('ix_review_detail_reviewer_domain', 'reviewer_id', 'domain'),
        Index('ix_review_detail_conversation_reviewer', 'conversation_id', 'reviewer_id'),
        Index('ix_review_detail_updated_at', 'updated_at'),
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    quality_dimension_id = Column(Integer)
    domain = Column(String(255), index=True)
    human_role_id = Column(Integer, index=True)
    review_id = Column(Integer, index=True)
    reviewer_id = Column(Integer, index=True)
    conversation_id = Column(BigInteger, index=True)
    is_delivered = Column(String(10), default='False', index=True)
    name = Column(String(255))
    score_text = Column(String(50))
    score = Column(Float)
    task_score = Column(Float)
    updated_at = Column(Date)


class Contributor(Base):
    """Contributor table - synced from BigQuery"""
    __tablename__ = 'contributor'
    __table_args__ = (
        Index('ix_contributor_team_lead_type', 'team_lead_id', 'type'),
        Index('ix_contributor_email', 'turing_email'),
    )
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), index=True)
    turing_email = Column(String(255))
    type = Column(String(50), index=True)
    status = Column(String(50), index=True)
    team_lead_id = Column(Integer, index=True)  # POD Lead ID


class DataSyncLog(Base):
    """Log table for tracking data sync operations"""
    __tablename__ = 'data_sync_log'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    table_name = Column(String(100))
    sync_started_at = Column(DateTime)
    sync_completed_at = Column(DateTime)
    records_synced = Column(Integer)
    sync_status = Column(String(50))
    sync_type = Column(String(50))
    error_message = Column(Text)


class TaskReviewedInfo(Base):
    """Task reviewed info table - synced from BigQuery CTE"""
    __tablename__ = 'task_reviewed_info'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    r_id = Column(BigInteger)
    delivered_id = Column(BigInteger)
    rlhf_link = Column(Text)
    is_delivered = Column(String(10))
    status = Column(String(50))
    task_score = Column(Float)
    updated_at = Column(Date)
    name = Column(String(255))
    annotation_date = Column(DateTime)  # Full timestamp for accurate completion time


class TaskAHT(Base):
    """Task AHT (Average Handle Time) - duration from pending→labeling to labeling→completed"""
    __tablename__ = 'task_aht'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(BigInteger, index=True)
    contributor_id = Column(Integer, index=True)
    contributor_name = Column(String(255))
    batch_id = Column(Integer)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    duration_seconds = Column(Integer)
    duration_minutes = Column(Float)


class ContributorTaskStats(Base):
    """Contributor task submission stats - new tasks vs rework"""
    __tablename__ = 'contributor_task_stats'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    contributor_id = Column(Integer, index=True, unique=True)
    new_tasks_submitted = Column(Integer, default=0)
    rework_submitted = Column(Integer, default=0)
    total_unique_tasks = Column(Integer, default=0)
    first_submission_date = Column(DateTime)
    last_submission_date = Column(DateTime)
    sum_number_of_turns = Column(Integer, default=0)  # For overall avg_rework calculation


class ContributorDailyStats(Base):
    """Daily contributor task submission stats - trainer x date level"""
    __tablename__ = 'contributor_daily_stats'
    __table_args__ = (
        # Composite index for common query pattern: filter by contributor, order by date
        Index('ix_contributor_daily_composite', 'contributor_id', 'submission_date'),
        # Unique constraint to prevent duplicate entries
        UniqueConstraint('contributor_id', 'submission_date', name='uq_contributor_daily_stats'),
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    contributor_id = Column(Integer, index=True)
    submission_date = Column(Date, index=True)
    new_tasks_submitted = Column(Integer, default=0)
    rework_submitted = Column(Integer, default=0)
    total_submissions = Column(Integer, default=0)
    unique_tasks = Column(Integer, default=0)
    tasks_ready_for_delivery = Column(Integer, default=0)  # Reviewed tasks with number_of_turns = 0
    sum_number_of_turns = Column(Integer, default=0)  # Sum of number_of_turns for avg_rework calculation
    sum_score = Column(Float, default=0)  # Sum of scores for avg_rating calculation
    sum_count_reviews = Column(Integer, default=0)  # Sum of count_reviews for avg_rating calculation


class ReviewerDailyStats(Base):
    """Daily reviewer stats - reviewer x date level (tasks reviewed)"""
    __tablename__ = 'reviewer_daily_stats'
    __table_args__ = (
        Index('ix_reviewer_daily_composite', 'reviewer_id', 'review_date'),
        UniqueConstraint('reviewer_id', 'review_date', name='uq_reviewer_daily_stats'),
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    reviewer_id = Column(Integer, index=True)
    review_date = Column(Date, index=True)
    unique_tasks_reviewed = Column(Integer, default=0)  # Distinct tasks reviewed
    new_tasks_reviewed = Column(Integer, default=0)  # Tasks that were first-time completions
    rework_reviewed = Column(Integer, default=0)  # Tasks that were rework submissions
    total_reviews = Column(Integer, default=0)  # Total review actions
    tasks_ready_for_delivery = Column(Integer, default=0)  # Tasks reviewed ready for delivery
    sum_number_of_turns = Column(Integer, default=0)  # Sum of number_of_turns for avg_rework calculation
    sum_score = Column(Float, default=0)  # Sum of scores for avg_rating calculation
    sum_count_reviews = Column(Integer, default=0)  # Sum of count_reviews for avg_rating calculation


class ReviewerTrainerDailyStats(Base):
    """Reviewer x Trainer x Date level stats - breakdown of what each reviewer reviewed per trainer per date"""
    __tablename__ = 'reviewer_trainer_daily_stats'
    __table_args__ = (
        Index('ix_reviewer_trainer_daily_composite', 'reviewer_id', 'trainer_id', 'review_date'),
        Index('ix_reviewer_trainer_date', 'reviewer_id', 'review_date'),
        UniqueConstraint('reviewer_id', 'trainer_id', 'review_date', name='uq_reviewer_trainer_daily_stats'),
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    reviewer_id = Column(Integer, index=True)
    trainer_id = Column(Integer, index=True)
    review_date = Column(Date, index=True)
    tasks_reviewed = Column(Integer, default=0)  # Unique tasks reviewed for this trainer
    new_tasks_reviewed = Column(Integer, default=0)  # New tasks reviewed
    rework_reviewed = Column(Integer, default=0)  # Rework reviewed
    total_reviews = Column(Integer, default=0)  # Total review actions
    ready_for_delivery = Column(Integer, default=0)  # Tasks ready for delivery
    sum_number_of_turns = Column(Integer, default=0)  # For avg_rework


class TaskHistoryRaw(Base):
    """
    Task history raw table - mirrors the spreadsheet's task_history_raw sheet.
    Used for calculating:
    - Unique tasks completed (COUNT DISTINCT task_id WHERE new_status='completed')
    - New Tasks Submitted (completed_status_count = 1)
    - Rework Submitted (completed_status_count > 1)
    """
    __tablename__ = 'task_history_raw'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(BigInteger, index=True)  # Column A - conversation_id
    time_stamp = Column(DateTime)  # Column B - th.created_at
    date = Column(Date, index=True)  # Column C - DATE(th.created_at)
    old_status = Column(String(50))  # Column D
    new_status = Column(String(50), index=True)  # Column E
    notes = Column(Text)  # Column F
    author = Column(String(255), index=True)  # Column M - turing_email
    completed_status_count = Column(Integer, default=0)  # Column H - running count of completed
    last_completed_date = Column(Date)  # Column I
    project_id = Column(Integer)  # Column J
    batch_name = Column(String(255))  # Column K


class TaskRaw(Base):
    """
    Task raw table - mirrors the spreadsheet's tasks_raw sheet exactly.
    Used for accurate avg_rework and other metric calculations.
    """
    __tablename__ = 'task_raw'
    
    # Primary key
    task_id = Column(BigInteger, primary_key=True)
    
    # Task basic info
    created_date = Column(Date)
    updated_at = Column(DateTime)
    last_completed_at = Column(DateTime)
    last_completed_date = Column(Date, index=True)  # Column E in spreadsheet
    trainer = Column(String(255), index=True)  # Column F - current_user email
    first_completion_date = Column(Date)
    first_completer = Column(String(255))
    colab_link = Column(Text)
    number_of_turns = Column(Integer, default=0)  # Column AS in spreadsheet
    task_status = Column(String(50), index=True)  # Column AP in spreadsheet
    batch_name = Column(String(255))
    task_duration = Column(Integer)
    project_id = Column(Integer)
    
    # Delivery info
    delivery_batch_name = Column(String(255))
    delivery_status = Column(String(50))
    delivery_batch_created_by = Column(String(255))
    db_open_date = Column(Date)
    db_close_date = Column(Date)
    
    # Review stats
    conversation_id_rs = Column(BigInteger)
    count_reviews = Column(Integer, default=0)
    sum_score = Column(Float)
    sum_ref_score = Column(Float)
    sum_duration = Column(Integer)
    sum_followup_required = Column(Integer, default=0)
    
    # Latest review info
    task_id_r = Column(BigInteger)
    r_created_at = Column(DateTime)
    r_updated_at = Column(DateTime)
    review_id = Column(BigInteger)
    reviewer = Column(String(255))
    score = Column(Float)
    reflected_score = Column(Float)
    review_action = Column(Text)
    review_action_type = Column(String(50))  # 'delivery', 'rework', etc.
    r_feedback = Column(Text)
    followup_required = Column(Integer, default=0)
    r_duration = Column(Integer)
    r_submitted_at = Column(DateTime)
    r_submitted_date = Column(Date)
    
    # Derived status (Column AP in spreadsheet) - calculated based on task_status and review info
    derived_status = Column(String(50), index=True)


class PodLeadMapping(Base):
    """POD Lead to Trainer mapping - loaded from static Excel file"""
    __tablename__ = 'pod_lead_mapping'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    trainer_email = Column(String(255), index=True)
    trainer_name = Column(String(255))
    pod_lead_email = Column(String(255), index=True)
    role = Column(String(50))
    current_status = Column(String(50))
    jibble_project = Column(String(255))
    jibble_id = Column(String(50), index=True)  # Jibble person ID for direct mapping
    jibble_name = Column(String(255))  # Name as shown in Jibble


# ==================== Jibble Models ====================

class JibblePerson(Base):
    """Jibble person data - synced from Jibble API"""
    __tablename__ = 'jibble_person'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    jibble_id = Column(String(100), unique=True, index=True)
    full_name = Column(String(255))
    first_name = Column(String(100))
    last_name = Column(String(100))
    personal_email = Column(String(255), index=True)  # Jibble login email
    work_email = Column(String(255), index=True)      # Work email if different
    status = Column(String(50))                       # Active, Inactive, etc.
    latest_time_entry = Column(DateTime)
    last_synced = Column(DateTime)
    created_at = Column(DateTime, server_default='now()')


class JibbleTimeEntry(Base):
    """Jibble time entry data - daily hours per person"""
    __tablename__ = 'jibble_time_entry'
    __table_args__ = (
        Index('ix_jibble_time_person_date', 'person_id', 'entry_date'),
        UniqueConstraint('person_id', 'entry_date', name='uq_jibble_time_entry'),
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    person_id = Column(String(100), index=True)  # Jibble person ID
    entry_date = Column(Date, index=True)
    total_hours = Column(Float, default=0)
    last_synced = Column(DateTime)
    created_at = Column(DateTime, server_default='now()')


class JibbleEmailMapping(Base):
    """Mapping between Turing email and Jibble email"""
    __tablename__ = 'jibble_email_mapping'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    turing_email = Column(String(255), unique=True, index=True)
    jibble_email = Column(String(255), index=True)
    last_synced = Column(DateTime)
    created_at = Column(DateTime, server_default='now()')
