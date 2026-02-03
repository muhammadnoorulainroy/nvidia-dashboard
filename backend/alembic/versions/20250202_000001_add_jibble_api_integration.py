"""Add Jibble API integration tables and columns

Revision ID: 006_jibble_api_integration
Revises: 005_trainer_review_stats
Create Date: 2025-02-02

This migration adds:
1. jibble_email_mapping table - Maps Jibble IDs/emails to Turing emails
2. New columns on jibble_hours for API integration (jibble_email, turing_email, source)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '006_jibble_api_integration'
down_revision: Union[str, None] = '005_trainer_review_stats'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add Jibble API integration support."""
    
    # 1. Create jibble_email_mapping table
    op.create_table(
        'jibble_email_mapping',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('jibble_id', sa.String(length=50), nullable=True),
        sa.Column('jibble_email', sa.String(length=255), nullable=True),
        sa.Column('jibble_name', sa.String(length=255), nullable=True),
        sa.Column('turing_email', sa.String(length=255), nullable=True),
        sa.Column('last_synced', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for jibble_email_mapping
    op.create_index('ix_jibble_email_mapping_jibble_id', 'jibble_email_mapping', ['jibble_id'], unique=True)
    op.create_index('ix_jibble_email_mapping_jibble_email', 'jibble_email_mapping', ['jibble_email'], unique=False)
    op.create_index('ix_jibble_email_mapping_turing', 'jibble_email_mapping', ['turing_email'], unique=False)
    
    # 2. Add new columns to jibble_hours table for API integration
    # These allow storing data from both BigQuery and Jibble API sources
    op.add_column('jibble_hours', sa.Column('jibble_email', sa.String(length=255), nullable=True))
    op.add_column('jibble_hours', sa.Column('turing_email', sa.String(length=255), nullable=True))
    op.add_column('jibble_hours', sa.Column('source', sa.String(length=50), server_default='bigquery', nullable=True))
    
    # Create indexes for new columns
    op.create_index('ix_jibble_hours_jibble_email', 'jibble_hours', ['jibble_email'], unique=False)
    op.create_index('ix_jibble_hours_turing_email', 'jibble_hours', ['turing_email'], unique=False)
    op.create_index('ix_jibble_hours_source', 'jibble_hours', ['source'], unique=False)
    
    # Composite indexes for common queries
    op.create_index('ix_jibble_hours_email_date', 'jibble_hours', ['turing_email', 'entry_date'], unique=False)
    op.create_index('ix_jibble_hours_source_date', 'jibble_hours', ['source', 'entry_date'], unique=False)


def downgrade() -> None:
    """Remove Jibble API integration support."""
    
    # Drop indexes on jibble_hours
    op.drop_index('ix_jibble_hours_source_date', table_name='jibble_hours')
    op.drop_index('ix_jibble_hours_email_date', table_name='jibble_hours')
    op.drop_index('ix_jibble_hours_source', table_name='jibble_hours')
    op.drop_index('ix_jibble_hours_turing_email', table_name='jibble_hours')
    op.drop_index('ix_jibble_hours_jibble_email', table_name='jibble_hours')
    
    # Drop columns from jibble_hours
    op.drop_column('jibble_hours', 'source')
    op.drop_column('jibble_hours', 'turing_email')
    op.drop_column('jibble_hours', 'jibble_email')
    
    # Drop jibble_email_mapping table
    op.drop_index('ix_jibble_email_mapping_turing', table_name='jibble_email_mapping')
    op.drop_index('ix_jibble_email_mapping_jibble_email', table_name='jibble_email_mapping')
    op.drop_index('ix_jibble_email_mapping_jibble_id', table_name='jibble_email_mapping')
    op.drop_table('jibble_email_mapping')
