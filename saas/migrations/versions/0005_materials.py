"""materiali dei corsi

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "materials",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("course_id", sa.Uuid(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lesson_id", sa.Uuid(), sa.ForeignKey("lessons.id", ondelete="SET NULL")),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("material_type", sa.String(20), nullable=False),
        sa.Column("extracted_text", sa.Text()),
        sa.Column("extraction_status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_materials_course_id", "materials", ["course_id"])
    op.create_index("ix_materials_lesson_id", "materials", ["lesson_id"])


def downgrade():
    op.drop_table("materials")
