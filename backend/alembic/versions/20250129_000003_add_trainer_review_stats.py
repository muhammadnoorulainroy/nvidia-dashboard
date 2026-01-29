"""Add trainer_review_stats table

Revision ID: 005_trainer_review_stats
Revises: 004_project_config
Create Date: 2025-01-29

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005_trainer_review_stats'
down_revision: Union[str, None] = '004_project_config'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create trainer_review_stats table for tracking individual review attributions."""
    op.create_table(
        'trainer_review_stats',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('review_id', sa.BigInteger(), nullable=True),
        sa.Column('task_id', sa.BigInteger(), nullable=True),
        sa.Column('trainer_email', sa.String(length=255), nullable=True),
        sa.Column('completion_time', sa.DateTime(), nullable=True),
        sa.Column('completion_number', sa.Integer(), nullable=True),
        sa.Column('review_time', sa.DateTime(), nullable=True),
        sa.Column('review_date', sa.Date(), nullable=True),
        sa.Column('score', sa.Float(), nullable=True),
        sa.Column('followup_required', sa.Integer(), nullable=True, default=0),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('last_synced', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('ix_trainer_review_stats_review_id', 'trainer_review_stats', ['review_id'], unique=True)
    op.create_index('ix_trainer_review_stats_task_id', 'trainer_review_stats', ['task_id'], unique=False)
    op.create_index('ix_trainer_review_stats_trainer_email', 'trainer_review_stats', ['trainer_email'], unique=False)
    op.create_index('ix_trainer_review_stats_review_date', 'trainer_review_stats', ['review_date'], unique=False)
    op.create_index('ix_trainer_review_stats_project_id', 'trainer_review_stats', ['project_id'], unique=False)
    
    # Composite indexes for common queries
    op.create_index('ix_trainer_review_trainer_project', 'trainer_review_stats', ['trainer_email', 'project_id'], unique=False)
    op.create_index('ix_trainer_review_trainer_date', 'trainer_review_stats', ['trainer_email', 'review_date'], unique=False)


def downgrade() -> None:
    """Drop trainer_review_stats table."""
    op.drop_index('ix_trainer_review_trainer_date', table_name='trainer_review_stats')
    op.drop_index('ix_trainer_review_trainer_project', table_name='trainer_review_stats')
    op.drop_index('ix_trainer_review_stats_project_id', table_name='trainer_review_stats')
    op.drop_index('ix_trainer_review_stats_review_date', table_name='trainer_review_stats')
    op.drop_index('ix_trainer_review_stats_trainer_email', table_name='trainer_review_stats')
    op.drop_index('ix_trainer_review_stats_task_id', table_name='trainer_review_stats')
    op.drop_index('ix_trainer_review_stats_review_id', table_name='trainer_review_stats')
    op.drop_table('trainer_review_stats')
