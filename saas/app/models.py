import math
import uuid
from datetime import date, datetime, timezone

from flask_login import UserMixin
from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .extensions import db


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(UserMixin, db.Model):
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


class AuthAttempt(db.Model):
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


class Course(db.Model):
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

    lessons: Mapped[list["Lesson"]] = relationship(
        back_populates="course", order_by="Lesson.lesson_number", cascade="all, delete-orphan", passive_deletes=True
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


class Lesson(db.Model):
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

    course: Mapped[Course] = relationship(back_populates="lessons")


class Flashcard(db.Model):
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

    course: Mapped[Course] = relationship()


AI_JOB_KINDS = {"study_pack": "Studio AI", "exercise_set": "Esercizi"}


class AiJob(db.Model):
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
    # Solo messaggi sanificati per l'utente, mai l'errore grezzo del provider.
    error: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
