"""Initial schema - baseline for existing database

Revision ID: 001_initial
Revises: 
Create Date: 2025-01-22

This migration represents the baseline schema for the Nvidia Dashboard.
It captures all existing tables as they were before Alembic was introduced.

For existing databases: Run `alembic stamp head` to mark as up-to-date without running migrations.
For new databases: This migration will create all tables from scratch.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all initial tables."""
    
    # Task table
    op.create_table(
        'task',
        sa.Column('id', sa.BigInteger(), primary_key=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('statement', sa.Text(), nullable=True),
        sa.Column('status', sa.String(50), nullable=True),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('batch_id', sa.Integer(), nullable=True),
        sa.Column('current_user_id', sa.Integer(), nullable=True),
        sa.Column('colab_link', sa.Text(), nullable=True),
        sa.Column('is_delivered', sa.String(10), nullable=True, default='False'),
        sa.Column('rework_count', sa.Integer(), nullable=True, default=0),
        sa.Column('domain', sa.String(255), nullable=True),
        sa.Column('week_number', sa.Integer(), nullable=True),
        sa.Column('number_of_turns', sa.Integer(), nullable=True, default=0),
        sa.Column('last_completed_date', sa.Date(), nullable=True),
    )
    
    # Review Detail table
    op.create_table(
        'review_detail',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('quality_dimension_id', sa.Integer(), nullable=True),
        sa.Column('domain', sa.String(255), nullable=True),
        sa.Column('human_role_id', sa.Integer(), nullable=True),
        sa.Column('review_id', sa.Integer(), nullable=True),
        sa.Column('reviewer_id', sa.Integer(), nullable=True),
        sa.Column('conversation_id', sa.BigInteger(), nullable=True),
        sa.Column('is_delivered', sa.String(10), nullable=True, default='False'),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('score_text', sa.String(50), nullable=True),
        sa.Column('score', sa.Float(), nullable=True),
        sa.Column('task_score', sa.Float(), nullable=True),
        sa.Column('updated_at', sa.Date(), nullable=True),
    )
    
    # Contributor table
    op.create_table(
        'contributor',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('turing_email', sa.String(255), nullable=True),
        sa.Column('type', sa.String(50), nullable=True),
        sa.Column('status', sa.String(50), nullable=True),
        sa.Column('team_lead_id', sa.Integer(), nullable=True),
    )
    
    # Data Sync Log table
    op.create_table(
        'data_sync_log',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('table_name', sa.String(100), nullable=True),
        sa.Column('sync_started_at', sa.DateTime(), nullable=True),
        sa.Column('sync_completed_at', sa.DateTime(), nullable=True),
        sa.Column('records_synced', sa.Integer(), nullable=True),
        sa.Column('sync_status', sa.String(50), nullable=True),
        sa.Column('sync_type', sa.String(50), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
    )
    
    # Work Item table
    op.create_table(
        'work_item',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('work_item_id', sa.String(255), nullable=True),
        sa.Column('task_id', sa.String(255), nullable=True),
        sa.Column('colab_link', sa.Text(), nullable=True),
        sa.Column('json_filename', sa.String(255), nullable=True),
        sa.Column('delivery_date', sa.DateTime(), nullable=True),
        sa.Column('annotator_id', sa.Integer(), nullable=True),
        sa.Column('turing_status', sa.String(50), nullable=True),
        sa.Column('client_status', sa.String(50), nullable=True),
        sa.Column('task_level_feedback', sa.Text(), nullable=True),
        sa.Column('error_categories', sa.Text(), nullable=True),
    )
    
    # Task Reviewed Info table
    op.create_table(
        'task_reviewed_info',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('r_id', sa.BigInteger(), nullable=True),
        sa.Column('delivered_id', sa.BigInteger(), nullable=True),
        sa.Column('rlhf_link', sa.Text(), nullable=True),
        sa.Column('is_delivered', sa.String(10), nullable=True),
        sa.Column('status', sa.String(50), nullable=True),
        sa.Column('task_score', sa.Float(), nullable=True),
        sa.Column('updated_at', sa.Date(), nullable=True),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('annotation_date', sa.DateTime(), nullable=True),
    )
    
    # Task AHT table
    op.create_table(
        'task_aht',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('task_id', sa.BigInteger(), nullable=True, index=True),
        sa.Column('contributor_id', sa.Integer(), nullable=True, index=True),
        sa.Column('contributor_name', sa.String(255), nullable=True),
        sa.Column('batch_id', sa.Integer(), nullable=True),
        sa.Column('start_time', sa.DateTime(), nullable=True),
        sa.Column('end_time', sa.DateTime(), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('duration_minutes', sa.Float(), nullable=True),
    )
    
    # Contributor Task Stats table
    op.create_table(
        'contributor_task_stats',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('contributor_id', sa.Integer(), nullable=True, unique=True, index=True),
        sa.Column('new_tasks_submitted', sa.Integer(), nullable=True, default=0),
        sa.Column('rework_submitted', sa.Integer(), nullable=True, default=0),
        sa.Column('total_unique_tasks', sa.Integer(), nullable=True, default=0),
        sa.Column('first_submission_date', sa.DateTime(), nullable=True),
        sa.Column('last_submission_date', sa.DateTime(), nullable=True),
        sa.Column('sum_number_of_turns', sa.Integer(), nullable=True, default=0),
    )
    
    # Contributor Daily Stats table
    op.create_table(
        'contributor_daily_stats',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('contributor_id', sa.Integer(), nullable=True, index=True),
        sa.Column('submission_date', sa.Date(), nullable=True, index=True),
        sa.Column('new_tasks_submitted', sa.Integer(), nullable=True, default=0),
        sa.Column('rework_submitted', sa.Integer(), nullable=True, default=0),
        sa.Column('total_submissions', sa.Integer(), nullable=True, default=0),
        sa.Column('unique_tasks', sa.Integer(), nullable=True, default=0),
        sa.Column('tasks_ready_for_delivery', sa.Integer(), nullable=True, default=0),
        sa.Column('sum_number_of_turns', sa.Integer(), nullable=True, default=0),
        sa.Column('sum_score', sa.Float(), nullable=True, default=0),
        sa.Column('sum_count_reviews', sa.Integer(), nullable=True, default=0),
    )
    
    # Reviewer Daily Stats table
    op.create_table(
        'reviewer_daily_stats',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('reviewer_id', sa.Integer(), nullable=True, index=True),
        sa.Column('review_date', sa.Date(), nullable=True, index=True),
        sa.Column('unique_tasks_reviewed', sa.Integer(), nullable=True, default=0),
        sa.Column('new_tasks_reviewed', sa.Integer(), nullable=True, default=0),
        sa.Column('rework_reviewed', sa.Integer(), nullable=True, default=0),
        sa.Column('total_reviews', sa.Integer(), nullable=True, default=0),
        sa.Column('tasks_ready_for_delivery', sa.Integer(), nullable=True, default=0),
        sa.Column('sum_number_of_turns', sa.Integer(), nullable=True, default=0),
        sa.Column('sum_score', sa.Float(), nullable=True, default=0),
        sa.Column('sum_count_reviews', sa.Integer(), nullable=True, default=0),
    )
    
    # Reviewer Trainer Daily Stats table
    op.create_table(
        'reviewer_trainer_daily_stats',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('reviewer_id', sa.Integer(), nullable=True, index=True),
        sa.Column('trainer_id', sa.Integer(), nullable=True, index=True),
        sa.Column('review_date', sa.Date(), nullable=True, index=True),
        sa.Column('tasks_reviewed', sa.Integer(), nullable=True, default=0),
        sa.Column('new_tasks_reviewed', sa.Integer(), nullable=True, default=0),
        sa.Column('rework_reviewed', sa.Integer(), nullable=True, default=0),
        sa.Column('total_reviews', sa.Integer(), nullable=True, default=0),
        sa.Column('ready_for_delivery', sa.Integer(), nullable=True, default=0),
        sa.Column('sum_number_of_turns', sa.Integer(), nullable=True, default=0),
    )
    
    # Task History Raw table
    op.create_table(
        'task_history_raw',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('task_id', sa.BigInteger(), nullable=True, index=True),
        sa.Column('time_stamp', sa.DateTime(), nullable=True),
        sa.Column('date', sa.Date(), nullable=True, index=True),
        sa.Column('old_status', sa.String(50), nullable=True),
        sa.Column('new_status', sa.String(50), nullable=True, index=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('author', sa.String(255), nullable=True, index=True),
        sa.Column('completed_status_count', sa.Integer(), nullable=True, default=0),
        sa.Column('last_completed_date', sa.Date(), nullable=True),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('batch_name', sa.String(255), nullable=True),
    )
    
    # Task Raw table
    op.create_table(
        'task_raw',
        sa.Column('task_id', sa.BigInteger(), primary_key=True),
        sa.Column('created_date', sa.Date(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('last_completed_at', sa.DateTime(), nullable=True),
        sa.Column('last_completed_date', sa.Date(), nullable=True, index=True),
        sa.Column('trainer', sa.String(255), nullable=True, index=True),
        sa.Column('first_completion_date', sa.Date(), nullable=True),
        sa.Column('first_completer', sa.String(255), nullable=True),
        sa.Column('colab_link', sa.Text(), nullable=True),
        sa.Column('number_of_turns', sa.Integer(), nullable=True, default=0),
        sa.Column('task_status', sa.String(50), nullable=True, index=True),
        sa.Column('batch_name', sa.String(255), nullable=True),
        sa.Column('task_duration', sa.Integer(), nullable=True),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('delivery_batch_name', sa.String(255), nullable=True),
        sa.Column('delivery_status', sa.String(50), nullable=True),
        sa.Column('delivery_batch_created_by', sa.String(255), nullable=True),
        sa.Column('db_open_date', sa.Date(), nullable=True),
        sa.Column('db_close_date', sa.Date(), nullable=True),
        sa.Column('conversation_id_rs', sa.BigInteger(), nullable=True),
        sa.Column('count_reviews', sa.Integer(), nullable=True, default=0),
        sa.Column('sum_score', sa.Float(), nullable=True),
        sa.Column('sum_ref_score', sa.Float(), nullable=True),
        sa.Column('sum_duration', sa.Integer(), nullable=True),
        sa.Column('sum_followup_required', sa.Integer(), nullable=True, default=0),
        sa.Column('task_id_r', sa.BigInteger(), nullable=True),
        sa.Column('r_created_at', sa.DateTime(), nullable=True),
        sa.Column('r_updated_at', sa.DateTime(), nullable=True),
        sa.Column('review_id', sa.BigInteger(), nullable=True),
        sa.Column('reviewer', sa.String(255), nullable=True),
        sa.Column('score', sa.Float(), nullable=True),
        sa.Column('reflected_score', sa.Float(), nullable=True),
        sa.Column('review_action', sa.Text(), nullable=True),
        sa.Column('review_action_type', sa.String(50), nullable=True),
        sa.Column('r_feedback', sa.Text(), nullable=True),
        sa.Column('followup_required', sa.Integer(), nullable=True, default=0),
        sa.Column('r_duration', sa.Integer(), nullable=True),
        sa.Column('r_submitted_at', sa.DateTime(), nullable=True),
        sa.Column('r_submitted_date', sa.Date(), nullable=True),
        sa.Column('derived_status', sa.String(50), nullable=True, index=True),
    )
    
    # POD Lead Mapping table
    op.create_table(
        'pod_lead_mapping',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('trainer_email', sa.String(255), nullable=True, index=True),
        sa.Column('trainer_name', sa.String(255), nullable=True),
        sa.Column('pod_lead_email', sa.String(255), nullable=True, index=True),
        sa.Column('role', sa.String(50), nullable=True),
        sa.Column('current_status', sa.String(50), nullable=True),
        sa.Column('jibble_project', sa.String(255), nullable=True),
        sa.Column('jibble_id', sa.String(50), nullable=True, index=True),
        sa.Column('jibble_name', sa.String(255), nullable=True),
    )
    
    # Jibble Person table
    op.create_table(
        'jibble_person',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('jibble_id', sa.String(100), nullable=True, unique=True, index=True),
        sa.Column('full_name', sa.String(255), nullable=True),
        sa.Column('first_name', sa.String(100), nullable=True),
        sa.Column('last_name', sa.String(100), nullable=True),
        sa.Column('personal_email', sa.String(255), nullable=True, index=True),
        sa.Column('work_email', sa.String(255), nullable=True, index=True),
        sa.Column('status', sa.String(50), nullable=True),
        sa.Column('latest_time_entry', sa.DateTime(), nullable=True),
        sa.Column('last_synced', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
    )
    
    # Jibble Time Entry table
    op.create_table(
        'jibble_time_entry',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('person_id', sa.String(100), nullable=True, index=True),
        sa.Column('entry_date', sa.Date(), nullable=True, index=True),
        sa.Column('total_hours', sa.Float(), nullable=True, default=0),
        sa.Column('last_synced', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
    )
    
    # Jibble Email Mapping table
    op.create_table(
        'jibble_email_mapping',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('turing_email', sa.String(255), nullable=True, unique=True, index=True),
        sa.Column('jibble_email', sa.String(255), nullable=True, index=True),
        sa.Column('last_synced', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
    )
    
    # Jibble Hours table
    op.create_table(
        'jibble_hours',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('member_code', sa.String(50), nullable=True, index=True),
        sa.Column('entry_date', sa.Date(), nullable=True, index=True),
        sa.Column('project', sa.String(255), nullable=True, index=True),
        sa.Column('full_name', sa.String(255), nullable=True),
        sa.Column('logged_hours', sa.Float(), nullable=True, default=0),
        sa.Column('last_synced', sa.DateTime(), server_default=sa.text('now()')),
    )


def downgrade() -> None:
    """Drop all tables."""
    op.drop_table('jibble_hours')
    op.drop_table('jibble_email_mapping')
    op.drop_table('jibble_time_entry')
    op.drop_table('jibble_person')
    op.drop_table('pod_lead_mapping')
    op.drop_table('task_raw')
    op.drop_table('task_history_raw')
    op.drop_table('reviewer_trainer_daily_stats')
    op.drop_table('reviewer_daily_stats')
    op.drop_table('contributor_daily_stats')
    op.drop_table('contributor_task_stats')
    op.drop_table('task_aht')
    op.drop_table('task_reviewed_info')
    op.drop_table('work_item')
    op.drop_table('data_sync_log')
    op.drop_table('contributor')
    op.drop_table('review_detail')
    op.drop_table('task')
