"""Add review_type column to trainer_review_stats

Revision ID: 007_add_review_type
Revises: 006_jibble_api_integration
Create Date: 2025-02-05

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '007_add_review_type'
down_revision = '006_jibble_api_integration'
branch_labels = None
depends_on = None


def upgrade():
    # Add review_type column to trainer_review_stats table
    op.add_column('trainer_review_stats', 
        sa.Column('review_type', sa.String(50), nullable=True)
    )
    
    # Create index for the new column
    op.create_index('ix_trainer_review_stats_review_type', 'trainer_review_stats', ['review_type'])
    
    # Update existing records to have 'manual' as review_type (since previous sync only synced manual reviews)
    op.execute("UPDATE trainer_review_stats SET review_type = 'manual' WHERE review_type IS NULL")


def downgrade():
    op.drop_index('ix_trainer_review_stats_review_type', table_name='trainer_review_stats')
    op.drop_column('trainer_review_stats', 'review_type')
