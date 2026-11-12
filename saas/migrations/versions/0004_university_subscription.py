"""università, facoltà, prova e abbonamento Paddle

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("university", sa.String(200)))
    op.add_column("users", sa.Column("faculty", sa.String(200)))
    op.add_column("users", sa.Column("trial_ends_at", sa.DateTime(timezone=True)))
    # Gli account esistenti ricevono 15 giorni da oggi, non dalla registrazione: nessuno resta chiuso fuori subito.
    op.execute("UPDATE users SET trial_ends_at = now() + interval '15 days'")
    op.alter_column("users", "trial_ends_at", nullable=False)
    op.add_column("users", sa.Column("paddle_customer_id", sa.String(64)))
    op.add_column("users", sa.Column("paddle_subscription_id", sa.String(64), unique=True))
    op.add_column("users", sa.Column("subscription_status", sa.String(20)))
    op.add_column("users", sa.Column("subscription_plan", sa.String(10)))
    op.add_column("users", sa.Column("subscription_period_end", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("subscription_cancel_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("subscription_updated_at", sa.DateTime(timezone=True)))


def downgrade():
    for column in (
        "subscription_updated_at",
        "subscription_cancel_at",
        "subscription_period_end",
        "subscription_plan",
        "subscription_status",
        "paddle_subscription_id",
        "paddle_customer_id",
        "trial_ends_at",
        "faculty",
        "university",
    ):
        op.drop_column("users", column)
