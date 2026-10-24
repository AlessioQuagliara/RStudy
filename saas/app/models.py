import math
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Computed, DateTime, ForeignKey, Index, String, Text, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # Sempre salvata in minuscolo (vedi auth.normalize_email): l'unicità è su questo valore.
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Vuoti solo per gli account creati prima che la registrazione li chiedesse.
    university: Mapped[str | None] = mapped_column(String(200))
    faculty: Mapped[str | None] = mapped_column(String(200))
    trial_ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Copia dello stato Paddle, scritta solo dai webhook (billing.webhook).
    paddle_customer_id: Mapped[str | None] = mapped_column(String(64))
    paddle_subscription_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    subscription_status: Mapped[str | None] = mapped_column(String(20))
    subscription_plan: Mapped[str | None] = mapped_column(String(10))
    subscription_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    subscription_cancel_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # occurred_at dell'ultimo evento applicato: Paddle non garantisce l'ordine di consegna.
    subscription_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def is_subscribed(self) -> bool:
        # past_due: Paddle sta ritentando l'addebito, l'accesso resta finché non passa a canceled.
        return self.subscription_status in ("active", "trialing", "past_due")

    @property
    def has_access(self) -> bool:
        return self.is_subscribed or utcnow() < self.trial_ends_at

    @property
    def trial_days_left(self) -> int:
        return max(0, math.ceil((self.trial_ends_at - utcnow()).total_seconds() / 86400))


class AuthAttempt(Base):
    """Tentativi di autenticazione per il rate limit. `key_hash` è un HMAC di email o IP: nessun dato in chiaro."""

    __tablename__ = "auth_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    key_hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


COURSE_STATUSES = {"active": "Attivo", "completed": "Completato", "archived": "Archiviato"}
LESSON_STATUSES = {"draft": "Bozza", "completed": "Completata"}
# Stessa palette di CourseFormModal.tsx. Le classi sono scritte per intero: Tailwind le trova in questo file.
COURSE_COLORS = {
    "#6366f1": "bg-[#6366f1]",
    "#14b8a6": "bg-[#14b8a6]",
    "#f59e0b": "bg-[#f59e0b]",
    "#ef4444": "bg-[#ef4444]",
    "#8b5cf6": "bg-[#8b5cf6]",
    "#22c55e": "bg-[#22c55e]",
}


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    code: Mapped[str | None] = mapped_column(String(50))
    cfu: Mapped[int] = mapped_column(default=0)
    exam_date: Mapped[date | None]
    introduction: Mapped[str | None] = mapped_column(Text)
    objectives: Mapped[str | None] = mapped_column(Text)
    target_lessons: Mapped[int | None]
    status: Mapped[str] = mapped_column(String(20), default="active")
    color: Mapped[str] = mapped_column(String(20), default="#6366f1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # lazy="selectin": caricate insieme al corso, perché in async un accesso pigro (es. dal template) fallirebbe.
    lessons: Mapped[list["Lesson"]] = relationship(
        back_populates="course", order_by="Lesson.lesson_number", cascade="all, delete-orphan", passive_deletes=True,
        lazy="selectin",
    )

    @property
    def color_class(self) -> str:
        return COURSE_COLORS.get(self.color, "bg-primary")

    @property
    def progress(self) -> tuple[int, int, int]:
        """(completate, totale, percentuale), con totale = lezioni previste se impostate, come OverviewTab.tsx."""
        completed = sum(1 for lesson in self.lessons if lesson.status == "completed")
        total = self.target_lessons or len(self.lessons)
        return completed, total, round(completed / total * 100) if total else 0


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    lesson_number: Mapped[int]
    title: Mapped[str] = mapped_column(String(200))
    lesson_date: Mapped[date | None]
    status: Mapped[str] = mapped_column(String(20), default="draft")
    # shortcut: testo semplice invece del JSON TipTap del desktop; da estendere quando arriverà l'editor ricco.
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    course: Mapped[Course] = relationship(back_populates="lessons", lazy="selectin")


class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("lessons.id", ondelete="SET NULL"), index=True)
    front: Mapped[str] = mapped_column(String(1000))
    back: Mapped[str] = mapped_column(String(2000))
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    difficulty: Mapped[str] = mapped_column(String(10), default="medium")
    source: Mapped[str] = mapped_column(String(10), default="manual")
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    review_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    course: Mapped[Course] = relationship(lazy="selectin")


AI_JOB_KINDS = {"study_pack": "Studio AI", "exercise_set": "Esercizi"}


class AiJob(Base):
    """Una riga per generazione AI: coda del worker, cache (stesso hash appunti = stesso risultato) e conteggio del limite giornaliero."""

    __tablename__ = "ai_jobs"
    __table_args__ = (
        # Al più una generazione attiva per lezione e tipo, come l'indice parziale di lesson_ai_generations.
        Index("uq_ai_jobs_active", "lesson_id", "kind", unique=True, postgresql_where=text("status IN ('queued', 'running')")),
        Index("ix_ai_jobs_queue", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    lesson_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(10), default="queued")
    source_hash: Mapped[str] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(100))
    result: Mapped[dict | None] = mapped_column(JSONB)
    # Solo percorso di studio: {"studied": [indici argomenti], "last_result": {...}}. Un nuovo percorso riparte da zero.
    progress: Mapped[dict | None] = mapped_column(JSONB)
    # Solo messaggi sanificati per l'utente, mai l'errore grezzo del provider.
    error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


MATERIAL_TYPES = {"lecture": "Lezione", "notes": "Appunti", "exercise": "Esercizio", "deepening": "Approfondimento", "other": "Altro"}
EXTRACTION_STATUSES = {"pending", "done", "unsupported", "failed"}


class Material(Base):
    """File caricato in un corso. Come nel backup del desktop si conserva il testo estratto, non il file."""

    __tablename__ = "materials"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("lessons.id", ondelete="SET NULL"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    file_size: Mapped[int]
    material_type: Mapped[str] = mapped_column(String(20), default="other")
    extracted_text: Mapped[str | None] = mapped_column(Text)
    extraction_status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DocumentChunk(Base):
    """Passaggio di un materiale o degli appunti di una lezione, per "Chiedi al corso" (vedi app/rag.py)."""

    __tablename__ = "document_chunks"
    __table_args__ = (Index("ix_document_chunks_tsv", "tsv", postgresql_using="gin"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    # Uno solo dei due: appunti (lesson_id) o materiale (material_id). Eliminata la fonte, spariscono i suoi passaggi.
    lesson_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"), index=True)
    material_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("materials.id", ondelete="CASCADE"), index=True)
    source_label: Mapped[str] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text)
    # Calcolata da Postgres: ricerca full-text in italiano al posto dell'embedding a hash del desktop.
    tsv: Mapped[str] = mapped_column(TSVECTOR, Computed("to_tsvector('italian', content)", persisted=True))


class CourseQuestion(Base):
    """Domanda a "Chiedi al corso" con la risposta e le fonti: cronologia della scheda e conteggio del limite giornaliero."""

    __tablename__ = "course_questions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    question: Mapped[str] = mapped_column(String(2000))
    answer: Mapped[str] = mapped_column(Text)
    citations: Mapped[list] = mapped_column(JSONB, default=list)
    model: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
