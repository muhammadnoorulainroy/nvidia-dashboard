"""Add AHT Configuration table

Revision ID: 003_aht_config
Revises: 002_foreign_keys
Create Date: 2025-01-29

This migration adds the aht_configuration table for storing
project-wise AHT (Average Handling Time) settings.

Note: If this table already exists (created by ad-hoc script),
the migration will detect this and skip creation.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '003_aht_config'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(table_name: str) -> bool:
    """Check if a table already exists in the database."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    """Create aht_configuration table if it doesn't exist."""
    
    if table_exists('aht_configuration'):
        print("Table 'aht_configuration' already exists, skipping creation.")
        return
    
    op.create_table(
        'aht_configuration',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('project_name', sa.String(255), nullable=False),
        sa.Column('new_task_aht', sa.Float(), nullable=False, server_default='10.0'),
        sa.Column('rework_aht', sa.Float(), nullable=False, server_default='4.0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()')),
        sa.Column('updated_by', sa.String(255), nullable=True),
    )
    
    # Create unique constraint on project_id
    op.create_index('ix_aht_configuration_project_id', 'aht_configuration', ['project_id'], unique=True)


def downgrade() -> None:
    """Drop aht_configuration table."""
    op.drop_index('ix_aht_configuration_project_id', table_name='aht_configuration')
    op.drop_table('aht_configuration')
