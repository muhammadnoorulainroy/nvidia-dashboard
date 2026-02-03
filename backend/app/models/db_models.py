"""
SQLAlchemy database models for nvidia dashboard.

This module defines all database models with:
- Primary keys and indices for performance
- Foreign key constraints for data integrity
- Relationships for ORM navigation
- Proper type definitions

Note: Foreign keys use ondelete="SET NULL" or "CASCADE" depending on the relationship.
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Date, BigInteger, ForeignKey, Index
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


class Task(Base):
    """Task table - synced from BigQuery conversation table."""
    __tablename__ = 'task'
    
    id = Column(BigInteger, primary_key=True)
    created_at = Column(DateTime, index=True)
    updated_at = Column(DateTime, index=True)
    statement = Column(Text)
    status = Column(String(50), index=True)
    project_id = Column(Integer, index=True)
    batch_id = Column(Integer, index=True)
    current_user_id = Column(
        Integer, 
        ForeignKey('contributor.id', ondelete='SET NULL'),
        nullable=True,
        index=True
    )
    colab_link = Column(Text)
    is_delivered = Column(String(10), default='False', index=True)
    rework_count = Column(Integer, default=0)
    domain = Column(String(255), index=True)
    week_number = Column(Integer, index=True)
    number_of_turns = Column(Integer, default=0)
    last_completed_date = Column(Date, index=True)
    
    # Relationships
    current_user = relationship("Contributor", back_populates="tasks", foreign_keys=[current_user_id])
    reviews = relationship("ReviewDetail", back_populates="task", foreign_keys="[ReviewDetail.conversation_id]")


class ReviewDetail(Base):
    """Review detail table - synced from BigQuery CTE results."""
    __tablename__ = 'review_detail'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    quality_dimension_id = Column(Integer, index=True)
    domain = Column(String(255), index=True)
    human_role_id = Column(Integer)
    review_id = Column(Integer, index=True)
    reviewer_id = Column(
        Integer, 
        ForeignKey('contributor.id', ondelete='SET NULL'),
        nullable=True,
        index=True
    )
    conversation_id = Column(
        BigInteger, 
        ForeignKey('task.id', ondelete='CASCADE'),
        nullable=True,
        index=True
    )
    is_delivered = Column(String(10), default='False', index=True)
    name = Column(String(255))
    score_text = Column(String(50))
    score = Column(Float)
    task_score = Column(Float)
    updated_at = Column(Date, index=True)
    
    # Relationships
    reviewer = relationship("Contributor", back_populates="reviews", foreign_keys=[reviewer_id])
    task = relationship("Task", back_populates="reviews", foreign_keys=[conversation_id])


class Contributor(Base):
    """Contributor table - synced from BigQuery."""
    __tablename__ = 'contributor'
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), index=True)
    turing_email = Column(String(255), unique=True, index=True)
    type = Column(String(50), index=True)  # 'trainer', 'reviewer', 'pod_lead'
    status = Column(String(50), index=True)  # 'active', 'inactive'
    team_lead_id = Column(
        Integer,
        ForeignKey('contributor.id', ondelete='SET NULL'),
        nullable=True,
        index=True
    )  # Self-referential POD Lead ID
    
    # Relationships
    tasks = relationship("Task", back_populates="current_user", foreign_keys="[Task.current_user_id]")
    reviews = relationship("ReviewDetail", back_populates="reviewer", foreign_keys="[ReviewDetail.reviewer_id]")
    
    # Self-referential relationship for team lead hierarchy
    # team_lead: Many contributors can have one team lead (many-to-one)
    # team_members: One team lead can have many team members (one-to-many)
    team_lead = relationship(
        "Contributor",
        remote_side=[id],
        foreign_keys=[team_lead_id],
        back_populates="team_members"
    )
    team_members = relationship(
        "Contributor",
        foreign_keys=[team_lead_id],
        back_populates="team_lead"
    )


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


class WorkItem(Base):
    """Work item table for tracking delivered items"""
    __tablename__ = 'work_item'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    work_item_id = Column(String(255))
    task_id = Column(String(255))
    colab_link = Column(Text)
    json_filename = Column(String(255))
    delivery_date = Column(DateTime)
    annotator_id = Column(Integer)
    turing_status = Column(String(50))
    client_status = Column(String(50))
    task_level_feedback = Column(Text)
    error_categories = Column(Text)


class TaskAHT(Base):
    """Task AHT (Average Handle Time) - duration from pending->labeling to labeling->completed."""
    __tablename__ = 'task_aht'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(
        BigInteger, 
        ForeignKey('task.id', ondelete='CASCADE'),
        nullable=True,
        index=True
    )
    contributor_id = Column(
        Integer, 
        ForeignKey('contributor.id', ondelete='CASCADE'),
        nullable=True,
        index=True
    )
    contributor_name = Column(String(255))
    batch_id = Column(Integer, index=True)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    duration_seconds = Column(Integer)
    duration_minutes = Column(Float)


class ContributorTaskStats(Base):
    """Contributor task submission stats - new tasks vs rework."""
    __tablename__ = 'contributor_task_stats'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    contributor_id = Column(
        Integer, 
        ForeignKey('contributor.id', ondelete='CASCADE'),
        unique=True,
        index=True
    )
    new_tasks_submitted = Column(Integer, default=0)
    rework_submitted = Column(Integer, default=0)
    total_unique_tasks = Column(Integer, default=0)
    first_submission_date = Column(DateTime)
    last_submission_date = Column(DateTime)
    sum_number_of_turns = Column(Integer, default=0)  # For overall avg_rework calculation


class ContributorDailyStats(Base):
    """Daily contributor task submission stats - trainer x date level."""
    __tablename__ = 'contributor_daily_stats'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    contributor_id = Column(
        Integer, 
        ForeignKey('contributor.id', ondelete='CASCADE'),
        index=True
    )
    submission_date = Column(Date, index=True)
    new_tasks_submitted = Column(Integer, default=0)
    rework_submitted = Column(Integer, default=0)
    total_submissions = Column(Integer, default=0)
    unique_tasks = Column(Integer, default=0)
    tasks_ready_for_delivery = Column(Integer, default=0)  # Reviewed tasks with number_of_turns = 0
    sum_number_of_turns = Column(Integer, default=0)  # Sum of number_of_turns for avg_rework calculation
    sum_score = Column(Float, default=0)  # Sum of scores for avg_rating calculation
    sum_count_reviews = Column(Integer, default=0)  # Sum of count_reviews for avg_rating calculation
    
    # Composite index for common queries
    __table_args__ = (
        Index('ix_contributor_daily_stats_contributor_date', 'contributor_id', 'submission_date'),
    )


class ReviewerDailyStats(Base):
    """Daily reviewer stats - reviewer x date level (tasks reviewed)."""
    __tablename__ = 'reviewer_daily_stats'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    reviewer_id = Column(
        Integer, 
        ForeignKey('contributor.id', ondelete='CASCADE'),
        index=True
    )
    review_date = Column(Date, index=True)
    unique_tasks_reviewed = Column(Integer, default=0)  # Distinct tasks reviewed
    new_tasks_reviewed = Column(Integer, default=0)  # Tasks that were first-time completions
    rework_reviewed = Column(Integer, default=0)  # Tasks that were rework submissions
    total_reviews = Column(Integer, default=0)  # Total review actions
    tasks_ready_for_delivery = Column(Integer, default=0)  # Tasks reviewed ready for delivery
    sum_number_of_turns = Column(Integer, default=0)  # Sum of number_of_turns for avg_rework calculation
    sum_score = Column(Float, default=0)  # Sum of scores for avg_rating calculation
    sum_count_reviews = Column(Integer, default=0)  # Sum of count_reviews for avg_rating calculation
    
    # Composite index for common queries
    __table_args__ = (
        Index('ix_reviewer_daily_stats_reviewer_date', 'reviewer_id', 'review_date'),
    )


class ReviewerTrainerDailyStats(Base):
    """Reviewer x Trainer x Date level stats - breakdown of what each reviewer reviewed per trainer per date."""
    __tablename__ = 'reviewer_trainer_daily_stats'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    reviewer_id = Column(
        Integer, 
        ForeignKey('contributor.id', ondelete='CASCADE'),
        index=True
    )
    trainer_id = Column(
        Integer, 
        ForeignKey('contributor.id', ondelete='CASCADE'),
        index=True
    )
    review_date = Column(Date, index=True)
    tasks_reviewed = Column(Integer, default=0)  # Unique tasks reviewed for this trainer
    new_tasks_reviewed = Column(Integer, default=0)  # New tasks reviewed
    rework_reviewed = Column(Integer, default=0)  # Rework reviewed
    total_reviews = Column(Integer, default=0)  # Total review actions
    ready_for_delivery = Column(Integer, default=0)  # Tasks ready for delivery
    sum_number_of_turns = Column(Integer, default=0)  # For avg_rework
    
    # Composite index for common queries
    __table_args__ = (
        Index('ix_reviewer_trainer_daily_stats_all', 'reviewer_id', 'trainer_id', 'review_date'),
    )


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
    """Jibble time entry data - daily hours per person."""
    __tablename__ = 'jibble_time_entry'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    person_id = Column(
        String(100), 
        ForeignKey('jibble_person.jibble_id', ondelete='CASCADE'),
        index=True
    )  # Jibble person ID
    entry_date = Column(Date, index=True)
    total_hours = Column(Float, default=0)
    last_synced = Column(DateTime)
    created_at = Column(DateTime, server_default='now()')
    
    # Composite index for common queries
    __table_args__ = (
        Index('ix_jibble_time_entry_person_date', 'person_id', 'entry_date'),
    )


class JibbleEmailMapping(Base):
    """Mapping between Turing email and Jibble ID/email.
    
    Synced from Google Sheet: Jibble ID <> Turing Email mapping
    This table links BigQuery jibble_hours.member_code to turing emails.
    """
    __tablename__ = 'jibble_email_mapping'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    jibble_id = Column(String(50), unique=True, index=True)  # Maps to jibble_hours.member_code
    jibble_email = Column(String(255), index=True)
    jibble_name = Column(String(255))
    turing_email = Column(String(255), index=True)
    last_synced = Column(DateTime)
    created_at = Column(DateTime, server_default='now()')
    
    # Index for quick lookups
    __table_args__ = (
        Index('ix_jibble_email_mapping_turing', 'turing_email'),
    )


class JibbleHours(Base):
    """Jibble hours - synced from BigQuery OR Jibble API directly.
    
    Sources:
    - 'bigquery': From turing-230020.test.Jibblelogs (uses member_code as numeric ID)
    - 'jibble_api': From Jibble API directly (uses member_code as UUID)
    """
    __tablename__ = 'jibble_hours'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    member_code = Column(String(100), index=True)  # Numeric ID (BigQuery) or UUID (API)
    entry_date = Column(Date, index=True)
    project = Column(String(255), index=True)
    full_name = Column(String(255))
    logged_hours = Column(Float, default=0)
    jibble_email = Column(String(255), index=True)  # Personal email from Jibble
    turing_email = Column(String(255), index=True)  # Matched Turing email
    source = Column(String(50), default='bigquery', index=True)  # 'bigquery' or 'jibble_api'
    last_synced = Column(DateTime, server_default='now()')
    
    # Composite index for common queries
    __table_args__ = (
        Index('ix_jibble_hours_email_date', 'turing_email', 'entry_date'),
        Index('ix_jibble_hours_source_date', 'source', 'entry_date'),
    )


# ==================== Trainer Review Attribution ====================

class TrainerReviewStats(Base):
    """
    Individual reviews attributed to the trainer who did the specific work.
    
    Each row represents ONE review that has been attributed to the trainer
    who completed the task just before that review was submitted.
    
    This enables accurate per-trainer metrics:
    - Trainer A completes task -> rejected (3.3) -> Trainer A reworks -> approved (4.8)
      Result: Trainer A gets 2 reviews: 3.3 and 4.8, avg = 4.05
    
    - Trainer A completes task -> rejected (2.3) -> Trainer B completes rework -> approved (5.0)
      Result: Trainer A gets 1 review: 2.3
              Trainer B gets 1 review: 5.0
    """
    __tablename__ = 'trainer_review_stats'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Review identification
    review_id = Column(BigInteger, unique=True, index=True)  # BigQuery review.id
    task_id = Column(BigInteger, index=True)  # conversation_id
    
    # Trainer attribution - who did the work that was reviewed
    trainer_email = Column(String(255), index=True)  # The trainer who completed the work
    
    # Completion info - which completion triggered this review
    completion_time = Column(DateTime)  # When the trainer completed
    completion_number = Column(Integer)  # 1 = first completion (new task), >1 = rework
    
    # Review info
    review_time = Column(DateTime)
    review_date = Column(Date, index=True)
    score = Column(Float)
    followup_required = Column(Integer, default=0)  # 0 = approved, 1 = sent to rework
    
    # Project info for filtering
    project_id = Column(Integer, index=True)
    
    # Metadata
    last_synced = Column(DateTime, server_default='now()')
    
    # Composite indexes for common queries
    __table_args__ = (
        Index('ix_trainer_review_trainer_project', 'trainer_email', 'project_id'),
        Index('ix_trainer_review_trainer_date', 'trainer_email', 'review_date'),
    )


# ==================== AHT Configuration ====================

class AHTConfiguration(Base):
    """
    Project-wise AHT (Average Handling Time) configuration.
    
    Stores the expected hours for new tasks and rework tasks per project.
    These values are used to calculate Merged Exp. AHT:
    Formula: (New Tasks × new_task_aht + Rework × rework_aht) / Total Submissions
    
    Default values:
    - New Task AHT: 10 hours (fresh tasks require more research and initial work)
    - Rework AHT: 4 hours (fixing/revising existing tasks takes less time)
    """
    __tablename__ = 'aht_configuration'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Project identification
    project_id = Column(Integer, unique=True, index=True, nullable=False)
    project_name = Column(String(255), nullable=False)
    
    # AHT values in hours
    new_task_aht = Column(Float, nullable=False, default=10.0)  # Expected hours for new tasks
    rework_aht = Column(Float, nullable=False, default=4.0)     # Expected hours for rework tasks
    
    # Metadata
    created_at = Column(DateTime, server_default='now()')
    updated_at = Column(DateTime, server_default='now()', onupdate='now()')
    updated_by = Column(String(255))  # Email of user who last updated


# ==================== Generic Project Configuration ====================

class ProjectConfiguration(Base):
    """
    Generic, extensible configuration system for project-level settings.
    
    Supports multiple configuration types:
    - throughput_target: Daily throughput targets for trainers
    - review_target: Review throughput targets for reviewers/pod leads
    - performance_weights: Weighted scoring configuration
    - classification_threshold: A/B/C performer bucket thresholds
    - effort_threshold: Hours vs expected effort thresholds
    - color_coding: VMO color coding rules
    - general: General settings
    
    Features:
    - Per-project settings
    - Entity-level settings (trainer/reviewer specific)
    - Historical tracking with effective dates
    - JSON values for flexible data structures
    
    Example configurations:
    
    1. Trainer throughput target:
       {
           "project_id": 36,
           "config_type": "throughput_target",
           "config_key": "daily_tasks",
           "entity_type": "trainer",
           "entity_email": "trainer@turing.com",
           "config_value": {"target": 5, "unit": "tasks"}
       }
    
    2. Performance weights:
       {
           "project_id": 36,
           "config_type": "performance_weights",
           "config_key": "default",
           "config_value": {
               "throughput": 30,
               "avg_rating": 25,
               "rating_change": 10,
               "rework_rate": 20,
               "delivered": 15
           }
       }
    
    3. Classification thresholds:
       {
           "project_id": 36,
           "config_type": "classification_threshold",
           "config_key": "performer_buckets",
           "config_value": {
               "A": {"min_score": 80},
               "B": {"min_score": 50},
               "C": {"min_score": 0}
           }
       }
    """
    __tablename__ = 'project_configuration'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Project identification
    project_id = Column(Integer, nullable=False, index=True)
    
    # Configuration type and key
    config_type = Column(String(50), nullable=False, index=True)
    config_key = Column(String(100), nullable=False)
    
    # Entity-level configuration (optional)
    entity_type = Column(String(50), nullable=True)  # 'trainer', 'reviewer', 'pod_lead', null for project-level
    entity_id = Column(Integer, nullable=True)       # contributor.id or null
    entity_email = Column(String(255), nullable=True) # For easier lookups
    
    # Configuration value (JSON for flexibility)
    # Using Text with JSON serialization for compatibility
    config_value = Column(Text, nullable=False)  # Store as JSON string (or JSONB in PostgreSQL)
    
    # Effective date range (for historical tracking)
    effective_from = Column(Date, nullable=False, server_default='CURRENT_DATE')
    effective_to = Column(Date, nullable=True)  # null = currently active
    
    # Metadata
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default='now()', nullable=False)
    updated_at = Column(DateTime, server_default='now()', nullable=False)
    created_by = Column(String(255), nullable=True)
    updated_by = Column(String(255), nullable=True)
    
    # Composite indexes for common queries
    __table_args__ = (
        Index('ix_project_config_project_type', 'project_id', 'config_type'),
        Index('ix_project_config_entity', 'entity_type', 'entity_id'),
    )
