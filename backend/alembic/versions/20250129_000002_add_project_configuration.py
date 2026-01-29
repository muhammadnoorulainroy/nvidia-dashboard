"""Add generic project_configuration table

Revision ID: 004_project_config
Revises: 003_aht_config
Create Date: 2025-01-29

This migration adds a generic, extensible configuration system that supports:
- Multiple configuration types (targets, weights, thresholds, etc.)
- Per-project settings
- Historical tracking with effective dates
- JSON values for flexible data structures

This replaces the need for separate tables for each config type.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = '004_project_config'
down_revision: Union[str, None] = '003_aht_config'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create project_configuration table."""
    
    # Create enum type for config types
    config_type_enum = sa.Enum(
        'throughput_target',      # Daily throughput targets
        'review_target',          # Review throughput targets
        'performance_weights',    # Weighted scoring configuration
        'classification_threshold', # A/B/C performer thresholds
        'effort_threshold',       # Hours vs expected effort thresholds
        'color_coding',           # VMO color coding rules
        'general',                # General settings
        name='config_type_enum'
    )
    
    op.create_table(
        'project_configuration',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        
        # Project identification
        sa.Column('project_id', sa.Integer(), nullable=False, index=True),
        
        # Configuration type and key
        sa.Column('config_type', config_type_enum, nullable=False, index=True),
        sa.Column('config_key', sa.String(100), nullable=False),
        
        # Entity-level configuration (optional - for trainer/reviewer specific targets)
        sa.Column('entity_type', sa.String(50), nullable=True),  # 'trainer', 'reviewer', 'pod_lead', null for project-level
        sa.Column('entity_id', sa.Integer(), nullable=True),     # contributor.id or null
        sa.Column('entity_email', sa.String(255), nullable=True), # For easier lookups
        
        # Configuration value (JSON for flexibility)
        sa.Column('config_value', JSONB, nullable=False),
        
        # Effective date range (for historical tracking)
        sa.Column('effective_from', sa.Date(), nullable=False, server_default=sa.text("CURRENT_DATE")),
        sa.Column('effective_to', sa.Date(), nullable=True),  # null = currently active
        
        # Metadata
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_by', sa.String(255), nullable=True),
        sa.Column('updated_by', sa.String(255), nullable=True),
    )
    
    # Indexes for common query patterns
    op.create_index(
        'ix_project_config_project_type',
        'project_configuration',
        ['project_id', 'config_type']
    )
    
    op.create_index(
        'ix_project_config_active',
        'project_configuration',
        ['project_id', 'config_type', 'config_key'],
        postgresql_where=sa.text('effective_to IS NULL')
    )
    
    op.create_index(
        'ix_project_config_entity',
        'project_configuration',
        ['entity_type', 'entity_id'],
        postgresql_where=sa.text('entity_id IS NOT NULL')
    )
    
    # Unique constraint for active configurations
    # Only one active config per project/type/key/entity combination
    op.create_index(
        'ix_project_config_unique_active',
        'project_configuration',
        ['project_id', 'config_type', 'config_key', 'entity_type', 'entity_id'],
        unique=True,
        postgresql_where=sa.text('effective_to IS NULL')
    )


def downgrade() -> None:
    """Drop project_configuration table."""
    op.drop_index('ix_project_config_unique_active', table_name='project_configuration')
    op.drop_index('ix_project_config_entity', table_name='project_configuration')
    op.drop_index('ix_project_config_active', table_name='project_configuration')
    op.drop_index('ix_project_config_project_type', table_name='project_configuration')
    op.drop_table('project_configuration')
    
    # Drop the enum type
    op.execute('DROP TYPE IF EXISTS config_type_enum')
