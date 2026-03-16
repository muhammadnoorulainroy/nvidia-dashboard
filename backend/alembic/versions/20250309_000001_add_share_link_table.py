"""Add share_link table for secure external sharing

Revision ID: 010_add_share_link
Revises: 009_add_financial_tables
Create Date: 2026-03-09
"""
from alembic import op
import sqlalchemy as sa


revision = '010_add_share_link'
down_revision = '009_add_financial_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'share_link',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('token', sa.String(64), nullable=False, unique=True, index=True),
        sa.Column('page', sa.String(100), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('label', sa.String(255), nullable=True),
        sa.Column('created_by', sa.String(255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('share_link')
