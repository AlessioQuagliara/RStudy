"""flashcards e ai_jobs

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-17
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "flashcards",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("course_id", sa.Uuid(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lesson_id", sa.Uuid(), sa.ForeignKey("lessons.id", ondelete="SET NULL")),
        sa.Column("front", sa.String(1000), nullable=False),
        sa.Column("back", sa.String(2000), nullable=False),
        sa.Column("tags", JSONB(), nullable=False),
        sa.Column("difficulty", sa.String(10), nullable=False),
        sa.Column("source", sa.String(10), nullable=False),
        sa.Column("next_review_at", sa.DateTime(timezone=True)),
        sa.Column("review_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_flashcards_course_id", "flashcards", ["course_id"])
    op.create_index("ix_flashcards_lesson_id", "flashcards", ["lesson_id"])
    op.create_index("ix_flashcards_next_review_at", "flashcards", ["next_review_at"])

    op.create_table(
        "ai_jobs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lesson_id", sa.Uuid(), sa.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("model", sa.String(100)),
        sa.Column("result", JSONB()),
        sa.Column("error", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ai_jobs_user_id", "ai_jobs", ["user_id"])
    op.create_index("ix_ai_jobs_lesson_id", "ai_jobs", ["lesson_id"])
    op.create_index("ix_ai_jobs_queue", "ai_jobs", ["status", "created_at"])
    op.create_index(
        "uq_ai_jobs_active", "ai_jobs", ["lesson_id", "kind"], unique=True,
        postgresql_where=sa.text("status IN ('queued', 'running')"),
    )


def downgrade():
    op.drop_table("ai_jobs")
    op.drop_table("flashcards")
