"""Add delivery_date column to task_raw table

Revision ID: 008_add_delivery_date
Revises: 007_add_review_type
Create Date: 2026-02-12

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '008_add_delivery_date'
down_revision = '007_add_review_type'
branch_labels = None
depends_on = None


def upgrade():
    # Add delivery_date column to task_raw table
    # This stores the date when the delivery batch was marked as 'delivered'
    op.add_column('task_raw', sa.Column('delivery_date', sa.Date(), nullable=True))
    
    # Create index for faster filtering by delivery_date
    op.create_index('ix_task_raw_delivery_date', 'task_raw', ['delivery_date'])


def downgrade():
    op.drop_index('ix_task_raw_delivery_date', table_name='task_raw')
    op.drop_column('task_raw', 'delivery_date')
