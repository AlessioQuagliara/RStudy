"""progressi del percorso di studio

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("ai_jobs", sa.Column("progress", JSONB()))


def downgrade():
    op.drop_column("ai_jobs", "progress")
