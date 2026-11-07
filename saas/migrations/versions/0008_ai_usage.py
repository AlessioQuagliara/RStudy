"""token consumati da generazioni e domande

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("ai_jobs", sa.Column("usage", JSONB()))
    op.add_column("course_questions", sa.Column("usage", JSONB()))


def downgrade():
    op.drop_column("course_questions", "usage")
    op.drop_column("ai_jobs", "usage")
