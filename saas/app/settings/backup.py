"""Backup JSON nello stesso formato dell'app desktop (backupService.ts, versione 1).

L'import è un upsert per id come sul desktop, ma solo su righe dell'account corrente: un id che esiste
per un altro utente blocca l'intero import, così un file costruito ad arte non può sovrascrivere dati altrui.
"""

import json
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, ValidationError, field_validator
from sqlalchemy import select

from ..ai import source_hash
from ..db import db
from ..materials import TEXT_MAX
from ..models import COURSE_COLORS, EXTRACTION_STATUSES, MATERIAL_TYPES, AiJob, Course, Flashcard, Lesson, Material, utcnow

MAX_ITEMS = 20_000


class BackupError(Exception):
    """Messaggio già sicuro da mostrare all'utente."""


class _Row(BaseModel):
    id: uuid.UUID
    createdAt: AwareDatetime
    updatedAt: AwareDatetime


class CourseIn(_Row):
    title: str = Field(min_length=1, max_length=200)
    code: str | None = Field(None, max_length=50)
    cfu: int = Field(ge=0, le=60)
    examDate: date | None
    introduction: str | None = Field(None, max_length=5000)
    objectives: str | None = Field(None, max_length=5000)
    targetLessons: int | None = Field(None, ge=0, le=200)
    status: Literal["active", "completed", "archived"]
    color: str | None


class LessonIn(_Row):
    courseId: uuid.UUID
    lessonNumber: int = Field(ge=0, le=10_000)
    title: str = Field(min_length=1, max_length=200)
    lessonDate: date | None
    status: Literal["draft", "completed"]
    notesPlainText: str | None = Field(None, max_length=500_000)


class MaterialIn(BaseModel):
    # Come nel backup del desktop: senza il file e senza updatedAt.
    id: uuid.UUID
    courseId: uuid.UUID
    lessonId: uuid.UUID | None
    title: str = Field(min_length=1, max_length=255)
    originalFilename: str = Field(min_length=1, max_length=255)
    mimeType: str = Field(max_length=100)
    fileSize: int = Field(ge=0)
    materialType: Literal[tuple(MATERIAL_TYPES)]
    extractedText: str | None = Field(None, max_length=TEXT_MAX)
    extractionStatus: Literal[tuple(EXTRACTION_STATUSES)]
    createdAt: AwareDatetime


class FlashcardIn(_Row):
    courseId: uuid.UUID
    lessonId: uuid.UUID | None
    front: str = Field(min_length=1, max_length=1000)
    back: str = Field(min_length=1, max_length=2000)
    tagsJson: str
    difficulty: Literal["easy", "medium", "hard"]
    source: Literal["ai", "manual"]
    nextReviewAt: AwareDatetime | None
    reviewCount: int = Field(ge=0)

    @field_validator("tagsJson")
    @classmethod
    def _tags(cls, value):
        tags = json.loads(value)
        if not (isinstance(tags, list) and all(isinstance(t, str) for t in tags)):
            raise ValueError("tagsJson deve essere una lista di stringhe")
        return value


class LessonAiOutputIn(_Row):
    lessonId: uuid.UUID
    summaryMarkdown: str
    keyPointsJson: str
    studyOutlineJson: str
    mermaidDiagram: str
    selfCheckQuestionsJson: str
    model: str = Field(max_length=100)


class BackupIn(BaseModel):
    version: Literal[1]
    courses: list[CourseIn] = Field(max_length=MAX_ITEMS)
    lessons: list[LessonIn] = Field(max_length=MAX_ITEMS)
    flashcards: list[FlashcardIn] = Field(max_length=MAX_ITEMS)
    lessonAiOutputs: list[LessonAiOutputIn] = Field(max_length=MAX_ITEMS)
    materials: list[MaterialIn] = Field(default=[], max_length=MAX_ITEMS)
    # Non ancora nella versione web: contati per dirlo all'utente, non importati.
    courseAiOutputs: list[dict] = Field(default=[], max_length=MAX_ITEMS)


async def _existing(model, ids: list[uuid.UUID], owned) -> dict:
    """Righe già presenti con questi id; errore se anche una sola non è dell'utente."""
    rows = (await db().scalars(select(model).where(model.id.in_(ids)))).all() if ids else []
    if any(not owned(row) for row in rows):
        raise BackupError("Il file contiene dati che appartengono a un altro account: import annullato.")
    return {row.id: row for row in rows}


async def import_backup(user, raw: bytes) -> dict[str, int]:
    try:
        data = BackupIn.model_validate_json(raw)
    except ValidationError as exc:
        where = ".".join(str(p) for p in exc.errors()[0]["loc"])
        raise BackupError(f"Il file non è un backup RStudy valido (campo {where}).") from None

    owned_course_ids = set(await db().scalars(select(Course.id).where(Course.user_id == user.id)))
    courses = await _existing(Course, [c.id for c in data.courses], lambda r: r.user_id == user.id)
    course_ids = owned_course_ids | {c.id for c in data.courses}
    lessons = await _existing(Lesson, [x.id for x in data.lessons], lambda r: r.course_id in owned_course_ids)
    owned_lesson_ids = set(await db().scalars(select(Lesson.id).where(Lesson.course_id.in_(owned_course_ids))))
    lesson_ids = owned_lesson_ids | {x.id for x in data.lessons}
    cards = await _existing(Flashcard, [f.id for f in data.flashcards], lambda r: r.course_id in owned_course_ids)
    materials = await _existing(Material, [m.id for m in data.materials], lambda r: r.course_id in owned_course_ids)
    jobs = await _existing(AiJob, [a.id for a in data.lessonAiOutputs], lambda r: r.user_id == user.id)
    if any(x.courseId not in course_ids for x in data.lessons) or any(
        f.courseId not in course_ids or (f.lessonId and f.lessonId not in lesson_ids) for f in data.flashcards
    ) or any(a.lessonId not in lesson_ids for a in data.lessonAiOutputs) or any(
        m.courseId not in course_ids or (m.lessonId and m.lessonId not in lesson_ids) for m in data.materials
    ):
        raise BackupError("Il file fa riferimento a corsi o lezioni che non contiene: import annullato.")

    for c in data.courses:
        course = courses.get(c.id) or Course(id=c.id, user_id=user.id)
        course.title, course.code, course.cfu, course.exam_date = c.title, c.code, c.cfu, c.examDate
        course.introduction, course.objectives, course.target_lessons = c.introduction, c.objectives, c.targetLessons
        course.status, course.color = c.status, c.color if c.color in COURSE_COLORS else "#6366f1"
        course.created_at, course.updated_at = c.createdAt, c.updatedAt
        db().add(course)
    await db().flush()

    lesson_by_id = {}
    for x in data.lessons:
        lesson = lessons.get(x.id) or Lesson(id=x.id)
        lesson.course_id, lesson.lesson_number, lesson.title = x.courseId, x.lessonNumber, x.title
        lesson.lesson_date, lesson.status, lesson.notes = x.lessonDate, x.status, x.notesPlainText or ""
        lesson.created_at, lesson.updated_at = x.createdAt, x.updatedAt
        db().add(lesson)
        lesson_by_id[x.id] = lesson
    await db().flush()

    for f in data.flashcards:
        card = cards.get(f.id) or Flashcard(id=f.id)
        card.course_id, card.lesson_id, card.front, card.back = f.courseId, f.lessonId, f.front, f.back
        card.tags, card.difficulty, card.source = json.loads(f.tagsJson), f.difficulty, f.source
        card.next_review_at, card.review_count = f.nextReviewAt, f.reviewCount
        card.created_at, card.updated_at = f.createdAt, f.updatedAt
        db().add(card)

    for m in data.materials:
        material = materials.get(m.id) or Material(id=m.id)
        material.course_id, material.lesson_id, material.title = m.courseId, m.lessonId, m.title
        material.original_filename, material.mime_type, material.file_size = m.originalFilename, m.mimeType, m.fileSize
        material.material_type, material.created_at = m.materialType, m.createdAt
        # NUL rifiutato da Postgres, come in materials._normalize.
        material.extracted_text = m.extractedText.replace("\x00", "") if m.extractedText else None
        material.extraction_status = m.extractionStatus
        db().add(material)

    for a in data.lessonAiOutputs:
        lesson = lesson_by_id.get(a.lessonId) or await db().get(Lesson, a.lessonId)
        try:
            pack = {
                "summary_markdown": a.summaryMarkdown,
                "key_points": json.loads(a.keyPointsJson),
                "study_outline": json.loads(a.studyOutlineJson),
                "self_check_questions": json.loads(a.selfCheckQuestionsJson),
                # Conservato per quando la versione web mostrerà i diagrammi.
                "mermaid_diagram": a.mermaidDiagram,
                "flashcards": [
                    {"front": f.front, "back": f.back, "tags": json.loads(f.tagsJson), "difficulty": f.difficulty}
                    for f in data.flashcards if f.lessonId == a.lessonId and f.source == "ai"
                ],
            }
        except ValueError:
            raise BackupError("Il file contiene uno studio AI non leggibile: import annullato.") from None
        job = jobs.get(a.id) or AiJob(id=a.id, user_id=user.id)
        job.lesson_id, job.kind, job.status, job.model = a.lessonId, "study_pack", "ready", a.model
        # Stesso hash del worker: rigenerare con gli stessi appunti riusa questo risultato.
        job.source_hash, job.result = source_hash(lesson), pack
        job.created_at, job.updated_at = a.createdAt, a.updatedAt
        db().add(job)

    await db().commit()
    return {
        "courses": len(data.courses),
        "lessons": len(data.lessons),
        "flashcards": len(data.flashcards),
        "studies": len(data.lessonAiOutputs),
        "materials": len(data.materials),
        "skipped_course_summaries": len(data.courseAiOutputs),
    }


def _iso(value: datetime | date | None) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat().replace("+00:00", "Z")
    return value.isoformat() if value else None


def _tiptap(text: str) -> str:
    # Il desktop salva gli appunti come documento TipTap: un paragrafo per riga, formattazione persa.
    paragraphs = [{"type": "paragraph", "content": [{"type": "text", "text": line}]} if line else {"type": "paragraph"} for line in text.split("\n")]
    return json.dumps({"type": "doc", "content": paragraphs}, ensure_ascii=False)


async def export_backup(user) -> dict:
    courses = (await db().scalars(select(Course).where(Course.user_id == user.id).order_by(Course.created_at))).all()
    course_ids = [c.id for c in courses]
    lessons = (await db().scalars(select(Lesson).where(Lesson.course_id.in_(course_ids)).order_by(Lesson.created_at))).all()
    cards = (await db().scalars(select(Flashcard).where(Flashcard.course_id.in_(course_ids)).order_by(Flashcard.created_at))).all()
    materials = (await db().scalars(select(Material).where(Material.course_id.in_(course_ids)).order_by(Material.created_at))).all()
    # Ultimo studio AI pronto per lezione, come lesson_ai_outputs del desktop (uno per lezione).
    packs = {}
    for job in await db().scalars(
        select(AiJob).where(AiJob.user_id == user.id, AiJob.kind == "study_pack", AiJob.status == "ready").order_by(AiJob.created_at)
    ):
        packs[job.lesson_id] = job
    return {
        "version": 1,
        "exportedAt": _iso(utcnow()),
        "courses": [
            {"id": str(c.id), "title": c.title, "code": c.code, "cfu": c.cfu, "examDate": _iso(c.exam_date),
             "introduction": c.introduction, "objectives": c.objectives, "targetLessons": c.target_lessons,
             "status": c.status, "color": c.color, "createdAt": _iso(c.created_at), "updatedAt": _iso(c.updated_at)}
            for c in courses
        ],
        "lessons": [
            {"id": str(x.id), "courseId": str(x.course_id), "lessonNumber": x.lesson_number, "title": x.title,
             "lessonDate": _iso(x.lesson_date), "status": x.status, "notesJson": _tiptap(x.notes),
             "notesPlainText": x.notes, "aiStatus": "completed" if x.id in packs else "idle",
             "createdAt": _iso(x.created_at), "updatedAt": _iso(x.updated_at)}
            for x in lessons
        ],
        "materials": [
            {"id": str(m.id), "courseId": str(m.course_id), "lessonId": str(m.lesson_id) if m.lesson_id else None,
             "title": m.title, "originalFilename": m.original_filename, "mimeType": m.mime_type, "fileSize": m.file_size,
             "materialType": m.material_type, "extractedText": m.extracted_text, "extractionStatus": m.extraction_status,
             "createdAt": _iso(m.created_at)}
            for m in materials
        ],
        "flashcards": [
            {"id": str(f.id), "courseId": str(f.course_id), "lessonId": str(f.lesson_id) if f.lesson_id else None,
             "front": f.front, "back": f.back, "tagsJson": json.dumps(f.tags, ensure_ascii=False),
             "difficulty": f.difficulty, "source": f.source, "nextReviewAt": _iso(f.next_review_at),
             "reviewCount": f.review_count, "createdAt": _iso(f.created_at), "updatedAt": _iso(f.updated_at)}
            for f in cards
        ],
        "lessonAiOutputs": [
            {"id": str(job.id), "lessonId": str(job.lesson_id), "summaryMarkdown": job.result["summary_markdown"],
             "keyPointsJson": json.dumps(job.result["key_points"], ensure_ascii=False),
             "studyOutlineJson": json.dumps(job.result["study_outline"], ensure_ascii=False),
             "mermaidDiagram": job.result.get("mermaid_diagram", ""),
             "selfCheckQuestionsJson": json.dumps(job.result["self_check_questions"], ensure_ascii=False),
             "model": job.model or "", "promptVersion": "web", "createdAt": _iso(job.created_at), "updatedAt": _iso(job.updated_at)}
            for job in packs.values()
        ],
        "courseAiOutputs": [],
    }
