"""Chiedi al corso: passaggi indicizzati e domande

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR

from app.rag import chunk_text

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    chunks = op.create_table(
        "document_chunks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("course_id", sa.Uuid(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lesson_id", sa.Uuid(), sa.ForeignKey("lessons.id", ondelete="CASCADE")),
        sa.Column("material_id", sa.Uuid(), sa.ForeignKey("materials.id", ondelete="CASCADE")),
        sa.Column("source_label", sa.String(500), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tsv", TSVECTOR(), sa.Computed("to_tsvector('italian', content)", persisted=True), nullable=False),
    )
    op.create_index("ix_document_chunks_course_id", "document_chunks", ["course_id"])
    op.create_index("ix_document_chunks_lesson_id", "document_chunks", ["lesson_id"])
    op.create_index("ix_document_chunks_material_id", "document_chunks", ["material_id"])
    op.create_index("ix_document_chunks_tsv", "document_chunks", ["tsv"], postgresql_using="gin")

    op.create_table(
        "course_questions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("course_id", sa.Uuid(), sa.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question", sa.String(2000), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("citations", JSONB(), nullable=False),
        sa.Column("model", sa.String(100)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_course_questions_user_id", "course_questions", ["user_id"])
    op.create_index("ix_course_questions_course_id", "course_questions", ["course_id"])

    # Indicizza appunti e materiali già presenti, con le stesse etichette di app/rag.py.
    conn = op.get_bind()
    for course_id, lesson_id, number, title, notes in conn.execute(
        sa.text("SELECT course_id, id, lesson_number, title, notes FROM lessons WHERE notes <> ''")
    ):
        label = f"Appunti — Lezione {number}: {title}"
        rows = [{"course_id": course_id, "lesson_id": lesson_id, "source_label": label, "content": c} for c in chunk_text(notes)]
        if rows:
            op.bulk_insert(chunks, rows)
    for course_id, material_id, title, number, lesson_title, text in conn.execute(sa.text(
        "SELECT m.course_id, m.id, m.title, l.lesson_number, l.title, m.extracted_text"
        " FROM materials m LEFT JOIN lessons l ON l.id = m.lesson_id WHERE m.extracted_text IS NOT NULL"
    )):
        label = f"{title} (Lezione {number}: {lesson_title})" if number is not None else title
        rows = [{"course_id": course_id, "material_id": material_id, "source_label": label[:500], "content": c} for c in chunk_text(text)]
        if rows:
            op.bulk_insert(chunks, rows)


def downgrade():
    op.drop_table("course_questions")
    op.drop_table("document_chunks")
