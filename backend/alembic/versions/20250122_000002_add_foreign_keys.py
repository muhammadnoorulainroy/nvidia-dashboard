"""Add foreign key constraints and indices

Revision ID: 002
Revises: 001
Create Date: 2025-01-22

This migration adds:
- Foreign key constraints between related tables
- Additional indices for common query patterns
- Composite indices for multi-column queries

Note: Foreign keys use ondelete='SET NULL' or 'CASCADE' to maintain data integrity.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None


def upgrade():
    """Add foreign key constraints and indices."""
    
    # Note: These operations may fail if data violates constraints.
    # In production, validate data before running.
    
    # ==========================================================================
    # Task table - Add foreign key to contributor
    # ==========================================================================
    with op.batch_alter_table('task', schema=None) as batch_op:
        batch_op.create_index('ix_task_current_user_id', ['current_user_id'])
        batch_op.create_index('ix_task_status', ['status'])
        batch_op.create_index('ix_task_project_id', ['project_id'])
        batch_op.create_index('ix_task_domain', ['domain'])
        batch_op.create_index('ix_task_is_delivered', ['is_delivered'])
        batch_op.create_foreign_key(
            'fk_task_current_user_id',
            'contributor',
            ['current_user_id'],
            ['id'],
            ondelete='SET NULL'
        )
    
    # ==========================================================================
    # ReviewDetail table - Add foreign keys
    # ==========================================================================
    with op.batch_alter_table('review_detail', schema=None) as batch_op:
        batch_op.create_index('ix_review_detail_reviewer_id', ['reviewer_id'])
        batch_op.create_index('ix_review_detail_conversation_id', ['conversation_id'])
        batch_op.create_index('ix_review_detail_domain', ['domain'])
        batch_op.create_foreign_key(
            'fk_review_detail_reviewer_id',
            'contributor',
            ['reviewer_id'],
            ['id'],
            ondelete='SET NULL'
        )
        batch_op.create_foreign_key(
            'fk_review_detail_conversation_id',
            'task',
            ['conversation_id'],
            ['id'],
            ondelete='CASCADE'
        )
    
    # ==========================================================================
    # Contributor table - Self-referential foreign key for team_lead
    # ==========================================================================
    with op.batch_alter_table('contributor', schema=None) as batch_op:
        batch_op.create_index('ix_contributor_team_lead_id', ['team_lead_id'])
        batch_op.create_index('ix_contributor_type', ['type'])
        batch_op.create_foreign_key(
            'fk_contributor_team_lead_id',
            'contributor',
            ['team_lead_id'],
            ['id'],
            ondelete='SET NULL'
        )
    
    # ==========================================================================
    # TaskAHT table - Add foreign keys
    # ==========================================================================
    with op.batch_alter_table('task_aht', schema=None) as batch_op:
        batch_op.create_foreign_key(
            'fk_task_aht_task_id',
            'task',
            ['task_id'],
            ['id'],
            ondelete='CASCADE'
        )
        batch_op.create_foreign_key(
            'fk_task_aht_contributor_id',
            'contributor',
            ['contributor_id'],
            ['id'],
            ondelete='CASCADE'
        )
    
    # ==========================================================================
    # ContributorTaskStats table - Add foreign key
    # ==========================================================================
    with op.batch_alter_table('contributor_task_stats', schema=None) as batch_op:
        batch_op.create_foreign_key(
            'fk_contributor_task_stats_contributor_id',
            'contributor',
            ['contributor_id'],
            ['id'],
            ondelete='CASCADE'
        )
    
    # ==========================================================================
    # ContributorDailyStats table - Add foreign key and composite index
    # ==========================================================================
    with op.batch_alter_table('contributor_daily_stats', schema=None) as batch_op:
        batch_op.create_index(
            'ix_contributor_daily_stats_contributor_date',
            ['contributor_id', 'submission_date']
        )
        batch_op.create_foreign_key(
            'fk_contributor_daily_stats_contributor_id',
            'contributor',
            ['contributor_id'],
            ['id'],
            ondelete='CASCADE'
        )
    
    # ==========================================================================
    # ReviewerDailyStats table - Add foreign key and composite index
    # ==========================================================================
    with op.batch_alter_table('reviewer_daily_stats', schema=None) as batch_op:
        batch_op.create_index(
            'ix_reviewer_daily_stats_reviewer_date',
            ['reviewer_id', 'review_date']
        )
        batch_op.create_foreign_key(
            'fk_reviewer_daily_stats_reviewer_id',
            'contributor',
            ['reviewer_id'],
            ['id'],
            ondelete='CASCADE'
        )
    
    # ==========================================================================
    # ReviewerTrainerDailyStats table - Add foreign keys and composite index
    # ==========================================================================
    with op.batch_alter_table('reviewer_trainer_daily_stats', schema=None) as batch_op:
        batch_op.create_index(
            'ix_reviewer_trainer_daily_stats_all',
            ['reviewer_id', 'trainer_id', 'review_date']
        )
        batch_op.create_foreign_key(
            'fk_reviewer_trainer_daily_stats_reviewer_id',
            'contributor',
            ['reviewer_id'],
            ['id'],
            ondelete='CASCADE'
        )
        batch_op.create_foreign_key(
            'fk_reviewer_trainer_daily_stats_trainer_id',
            'contributor',
            ['trainer_id'],
            ['id'],
            ondelete='CASCADE'
        )
    
    # ==========================================================================
    # JibbleTimeEntry table - Add foreign key and composite index
    # ==========================================================================
    with op.batch_alter_table('jibble_time_entry', schema=None) as batch_op:
        batch_op.create_index(
            'ix_jibble_time_entry_person_date',
            ['person_id', 'entry_date']
        )
        batch_op.create_foreign_key(
            'fk_jibble_time_entry_person_id',
            'jibble_person',
            ['person_id'],
            ['jibble_id'],
            ondelete='CASCADE'
        )


def downgrade():
    """Remove foreign key constraints and indices."""
    
    # JibbleTimeEntry
    with op.batch_alter_table('jibble_time_entry', schema=None) as batch_op:
        batch_op.drop_constraint('fk_jibble_time_entry_person_id', type_='foreignkey')
        batch_op.drop_index('ix_jibble_time_entry_person_date')
    
    # ReviewerTrainerDailyStats
    with op.batch_alter_table('reviewer_trainer_daily_stats', schema=None) as batch_op:
        batch_op.drop_constraint('fk_reviewer_trainer_daily_stats_trainer_id', type_='foreignkey')
        batch_op.drop_constraint('fk_reviewer_trainer_daily_stats_reviewer_id', type_='foreignkey')
        batch_op.drop_index('ix_reviewer_trainer_daily_stats_all')
    
    # ReviewerDailyStats
    with op.batch_alter_table('reviewer_daily_stats', schema=None) as batch_op:
        batch_op.drop_constraint('fk_reviewer_daily_stats_reviewer_id', type_='foreignkey')
        batch_op.drop_index('ix_reviewer_daily_stats_reviewer_date')
    
    # ContributorDailyStats
    with op.batch_alter_table('contributor_daily_stats', schema=None) as batch_op:
        batch_op.drop_constraint('fk_contributor_daily_stats_contributor_id', type_='foreignkey')
        batch_op.drop_index('ix_contributor_daily_stats_contributor_date')
    
    # ContributorTaskStats
    with op.batch_alter_table('contributor_task_stats', schema=None) as batch_op:
        batch_op.drop_constraint('fk_contributor_task_stats_contributor_id', type_='foreignkey')
    
    # TaskAHT
    with op.batch_alter_table('task_aht', schema=None) as batch_op:
        batch_op.drop_constraint('fk_task_aht_contributor_id', type_='foreignkey')
        batch_op.drop_constraint('fk_task_aht_task_id', type_='foreignkey')
    
    # Contributor
    with op.batch_alter_table('contributor', schema=None) as batch_op:
        batch_op.drop_constraint('fk_contributor_team_lead_id', type_='foreignkey')
        batch_op.drop_index('ix_contributor_type')
        batch_op.drop_index('ix_contributor_team_lead_id')
    
    # ReviewDetail
    with op.batch_alter_table('review_detail', schema=None) as batch_op:
        batch_op.drop_constraint('fk_review_detail_conversation_id', type_='foreignkey')
        batch_op.drop_constraint('fk_review_detail_reviewer_id', type_='foreignkey')
        batch_op.drop_index('ix_review_detail_domain')
        batch_op.drop_index('ix_review_detail_conversation_id')
        batch_op.drop_index('ix_review_detail_reviewer_id')
    
    # Task
    with op.batch_alter_table('task', schema=None) as batch_op:
        batch_op.drop_constraint('fk_task_current_user_id', type_='foreignkey')
        batch_op.drop_index('ix_task_is_delivered')
        batch_op.drop_index('ix_task_domain')
        batch_op.drop_index('ix_task_project_id')
        batch_op.drop_index('ix_task_status')
        batch_op.drop_index('ix_task_current_user_id')
