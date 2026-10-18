"""courses e lessons

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-17
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "courses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50)),
        sa.Column("cfu", sa.Integer(), nullable=False),
        sa.Column("exam_date", sa.Date()),
        sa.Column("introduction", sa.Text()),
        sa.Column("objectives", sa.Text()),
        sa.Column("target_lessons", sa.Integer()),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("color", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_courses_user_id", "courses", ["user_id"])
    op.create_table(
        "lessons",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("course_id", sa.Uuid(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lesson_number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("lesson_date", sa.Date()),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_lessons_course_id", "lessons", ["course_id"])


def downgrade():
    op.drop_table("lessons")
    op.drop_table("courses")
