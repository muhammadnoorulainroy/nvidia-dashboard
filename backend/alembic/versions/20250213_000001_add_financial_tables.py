"""Add financial data tables (project_revenue_weekly, project_cost_daily)

Revision ID: 009_add_financial_tables
Revises: 008_add_delivery_date
Create Date: 2026-02-13

These tables store financial metrics for the dashboard:
- project_revenue_weekly: Actual Revenue from Google Sheets (weekly granularity)
- project_cost_daily: Cost/Billings from BigQuery Jibblelogs (daily granularity)
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '009_add_financial_tables'
down_revision = '008_add_delivery_date'
branch_labels = None
depends_on = None


def upgrade():
    # =========================================================================
    # Table 1: project_revenue_weekly
    # Source: Google Sheet "Projects WoW Revenue" tab
    # =========================================================================
    op.create_table(
        'project_revenue_weekly',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('week_start_date', sa.Date(), nullable=False, index=True),
        sa.Column('week_end_date', sa.Date(), nullable=True),
        sa.Column('jibble_project_name', sa.String(255), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=True, index=True),
        sa.Column('project_status', sa.String(50), nullable=True),
        sa.Column('weekly_expected_volume', sa.Integer(), nullable=True),
        sa.Column('weekly_delivered_volume', sa.Integer(), nullable=True),
        sa.Column('bill_rate_task', sa.Float(), nullable=True),
        sa.Column('bill_rate_hour', sa.Float(), nullable=True),
        sa.Column('expected_revenue', sa.Float(), nullable=True, server_default='0'),
        sa.Column('actual_revenue', sa.Float(), nullable=True, server_default='0'),
        sa.Column('last_synced', sa.DateTime(), nullable=True),
    )
    op.create_index(
        'ix_project_revenue_week_project',
        'project_revenue_weekly',
        ['week_start_date', 'project_id']
    )
    op.create_index(
        'ix_project_revenue_jibble',
        'project_revenue_weekly',
        ['week_start_date', 'jibble_project_name']
    )

    # =========================================================================
    # Table 2: project_cost_daily
    # Source: BigQuery turing-230020.test.Jibblelogs
    # =========================================================================
    op.create_table(
        'project_cost_daily',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('date', sa.Date(), nullable=False, index=True),
        sa.Column('jibble_project_name', sa.String(255), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=True, index=True),
        sa.Column('activity', sa.String(255), nullable=True),
        sa.Column('activity_type', sa.String(50), nullable=False),
        sa.Column('logged_hours', sa.Float(), nullable=True, server_default='0'),
        sa.Column('total_cost', sa.Float(), nullable=True, server_default='0'),
        sa.Column('last_synced', sa.DateTime(), nullable=True),
    )
    op.create_index(
        'ix_project_cost_date_project',
        'project_cost_daily',
        ['date', 'project_id']
    )
    op.create_index(
        'ix_project_cost_date_jibble',
        'project_cost_daily',
        ['date', 'jibble_project_name']
    )


def downgrade():
    op.drop_index('ix_project_cost_date_jibble', table_name='project_cost_daily')
    op.drop_index('ix_project_cost_date_project', table_name='project_cost_daily')
    op.drop_table('project_cost_daily')
    
    op.drop_index('ix_project_revenue_jibble', table_name='project_revenue_weekly')
    op.drop_index('ix_project_revenue_week_project', table_name='project_revenue_weekly')
    op.drop_table('project_revenue_weekly')
