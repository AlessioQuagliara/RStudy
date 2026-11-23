"""sospensione degli utenti dal pannello admin

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-23
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("banned_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("ban_reason", sa.String(200)))


def downgrade():
    op.drop_column("users", "ban_reason")
    op.drop_column("users", "banned_at")
