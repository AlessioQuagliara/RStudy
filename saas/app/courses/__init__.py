"""Corsi, lezioni con appunti, generazione AI ed esercizi."""

import asyncio
import uuid
from datetime import date
from pathlib import PurePath

from quart import Blueprint, abort, current_app, flash, g, redirect, render_template, request, url_for
from sqlalchemy import func, select

from .. import ai
from ..ai.schemas import is_open_answer_correct
from ..db import db
from ..materials import MIME_BY_EXT, extract_text
from ..models import (
    COURSE_COLORS, COURSE_STATUSES, LESSON_STATUSES, MATERIAL_TYPES, AiJob, Course, Flashcard, Lesson, Material, utcnow,
)
from ..web import login_required, paginate

bp = Blueprint("courses", __name__, url_prefix="/courses")

NOTES_MAX = 200_000
COURSE_TABS = {"overview": "Panoramica", "lessons": "Lezioni", "materials": "Materiali", "flashcards": "Flashcard"}


@bp.app_context_processor
async def _labels():
    return {"statuses": COURSE_STATUSES, "lesson_statuses": LESSON_STATUSES, "colors": COURSE_COLORS}


class FormError(ValueError):
    pass


async def get_course(course_id: uuid.UUID) -> Course:
    """Corso dell'utente corrente, o 404: un id di un altro utente non si distingue da uno inesistente."""
    course = await db().scalar(select(Course).where(Course.id == course_id, Course.user_id == g.user.id))
    if course is None:
        abort(404)
    return course


async def get_lesson(course_id: uuid.UUID, lesson_id: uuid.UUID) -> Lesson:
    lesson = await db().scalar(
        select(Lesson).join(Course).where(Lesson.id == lesson_id, Lesson.course_id == course_id, Course.user_id == g.user.id)
    )
    if lesson is None:
        abort(404)
    return lesson


# ---------- campi dei form (usati anche da flashcards) ----------


def _text(form, name: str, max_len: int, required: bool = False, label: str = "") -> str | None:
    value = form.get(name, "").strip()
    if required and not value:
        raise FormError(f"{label} è obbligatorio.")
    if len(value) > max_len:
        raise FormError(f"{label} può avere al massimo {max_len} caratteri.")
    return value or None


def _int(form, name: str, lo: int, hi: int, label: str, default: int | None = None) -> int | None:
    raw = form.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise FormError(f"{label} deve essere un numero intero.") from None
    if not lo <= value <= hi:
        raise FormError(f"{label} deve essere tra {lo} e {hi}.")
    return value


def _date(form, name: str, label: str) -> date | None:
    raw = form.get(name, "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise FormError(f"{label} non è una data valida.") from None


def _choice(form, name: str, choices, default: str) -> str:
    value = form.get(name, default)
    if value not in choices:
        raise FormError("Valore non valido.")
    return value


def _apply_course_form(course: Course, form) -> None:
    # Stessi limiti di createCourseInputSchema (studyforge/electron/shared/schemas.ts).
    course.title = _text(form, "title", 200, required=True, label="Il titolo")
    course.code = _text(form, "code", 50, label="Il codice")
    course.cfu = _int(form, "cfu", 0, 60, "CFU", default=0)
    course.exam_date = _date(form, "exam_date", "La data esame")
    course.introduction = _text(form, "introduction", 5000, label="L'introduzione")
    course.objectives = _text(form, "objectives", 5000, label="Gli obiettivi")
    course.target_lessons = _int(form, "target_lessons", 0, 200, "Lezioni previste")
    course.status = _choice(form, "status", COURSE_STATUSES, "active")
    course.color = _choice(form, "color", COURSE_COLORS, "#6366f1")


# ---------- corsi ----------


@bp.get("/")
@login_required
async def index():
    q = request.args.get("q", "").strip()
    status = request.args.get("status", "all")
    query = select(Course).where(Course.user_id == g.user.id).order_by(Course.updated_at.desc())
    if q:
        query = query.where(Course.title.icontains(q, autoescape=True))
    if status in COURSE_STATUSES:
        query = query.where(Course.status == status)
    courses = (await db().scalars(query)).all()
    has_any = bool(courses) or await db().scalar(select(Course.id).where(Course.user_id == g.user.id).limit(1))
    return await render_template("courses/index.html", courses=courses, q=q, status=status, has_any=has_any)


@bp.route("/new", methods=["GET", "POST"])
@login_required
async def new():
    # Corso non ancora in sessione: un errore nel form non lascia nulla nel database.
    course = Course(user_id=g.user.id, cfu=6, status="active", color="#6366f1")
    if request.method == "POST":
        try:
            _apply_course_form(course, await request.form)
        except FormError as e:
            await flash(str(e), "error")
            return await render_template("courses/form.html", course=course), 400
        db().add(course)
        await db().commit()
        await flash("Corso creato", "success")
        return redirect(url_for("courses.detail", course_id=course.id))
    return await render_template("courses/form.html", course=course)


@bp.get("/<uuid:course_id>")
@login_required
async def detail(course_id):
    course = await get_course(course_id)
    tab = request.args.get("tab", "overview")
    if tab not in COURSE_TABS:
        tab = "overview"
    flashcards = materials = None
    if tab == "flashcards":
        flashcards = await paginate(select(Flashcard).where(Flashcard.course_id == course.id).order_by(Flashcard.created_at.desc()))
    elif tab == "materials":
        materials = (await db().scalars(select(Material).where(Material.course_id == course.id).order_by(Material.created_at.desc()))).all()
    return await render_template(
        "courses/detail.html", course=course, tab=tab, tabs=COURSE_TABS, flashcards=flashcards, materials=materials,
        material_types=MATERIAL_TYPES,
    )


@bp.route("/<uuid:course_id>/edit", methods=["GET", "POST"])
@login_required
async def edit(course_id):
    course = await get_course(course_id)
    if request.method == "POST":
        try:
            _apply_course_form(course, await request.form)
        except FormError as e:
            # Nessun commit: la sessione viene scartata a fine richiesta, il form mostra i valori inseriti.
            await flash(str(e), "error")
            return await render_template("courses/form.html", course=course), 400
        await db().commit()
        await flash("Corso aggiornato", "success")
        return redirect(url_for("courses.detail", course_id=course.id))
    return await render_template("courses/form.html", course=course)


@bp.post("/<uuid:course_id>/delete")
@login_required
async def delete(course_id):
    await db().delete(await get_course(course_id))
    await db().commit()
    await flash("Corso eliminato", "success")
    return redirect(url_for("courses.index"))


# ---------- materiali ----------


@bp.post("/<uuid:course_id>/materials")
@login_required
async def upload_materials(course_id):
    """Porting di materials:import: uno o più file, testo estratto subito. Il limite è quello di MAX_CONTENT_LENGTH."""
    course = await get_course(course_id)
    form, files = await request.form, (await request.files).getlist("files")
    back = redirect(url_for("courses.detail", course_id=course.id, tab="materials"))
    files = [f for f in files if f.filename]
    if not files:
        await flash("Scegli almeno un file.", "error")
        return back
    try:
        material_type = _choice(form, "material_type", MATERIAL_TYPES, "other")
    except FormError as e:
        await flash(str(e), "error")
        return back
    lesson_id = None
    if raw := form.get("lesson_id"):
        lesson_id = next((x.id for x in course.lessons if str(x.id) == raw), None)
        if lesson_id is None:
            abort(404)
    for upload in files:
        # Solo il nome, senza percorso: il browser può mandare qualsiasi stringa.
        name = PurePath(upload.filename.replace("\\", "/")).name[:255]
        data = upload.read()
        status, text = await asyncio.to_thread(extract_text, name, data)
        db().add(Material(
            course_id=course.id, lesson_id=lesson_id, title=PurePath(name).stem[:255] or name,
            original_filename=name, mime_type=MIME_BY_EXT.get(PurePath(name).suffix.lower(), "application/octet-stream"),
            file_size=len(data), material_type=material_type, extracted_text=text, extraction_status=status,
        ))
    course.updated_at = utcnow()
    await db().commit()
    await flash(f"{len(files)} materiale/i importato/i", "success")
    return back


@bp.post("/<uuid:course_id>/materials/<uuid:material_id>/delete")
@login_required
async def delete_material(course_id, material_id):
    course = await get_course(course_id)
    material = await db().scalar(select(Material).where(Material.id == material_id, Material.course_id == course.id))
    if material is None:
        abort(404)
    await db().delete(material)
    await db().commit()
    await flash("Materiale eliminato", "success")
    return redirect(url_for("courses.detail", course_id=course.id, tab="materials"))


# ---------- lezioni ----------


@bp.post("/<uuid:course_id>/lessons")
@login_required
async def create_lesson(course_id):
    course = await get_course(course_id)
    try:
        title = _text(await request.form, "title", 200, required=True, label="Il titolo")
    except FormError as e:
        await flash(str(e), "error")
        return redirect(url_for("courses.detail", course_id=course.id, tab="lessons"))
    # max+1 e non count+1: dopo un'eliminazione il numero non si ripete.
    number = (await db().scalar(select(func.max(Lesson.lesson_number)).where(Lesson.course_id == course.id)) or 0) + 1
    lesson = Lesson(course=course, lesson_number=number, title=title, lesson_date=date.today(), status="draft", notes="")
    db().add(lesson)
    course.updated_at = utcnow()
    await db().commit()
    await flash("Lezione creata", "success")
    return redirect(url_for("courses.lesson", course_id=course.id, lesson_id=lesson.id))


async def _render_lesson(lesson: Lesson, tab: str, status: int = 200):
    jobs = await ai.latest_jobs(lesson)
    return await render_template(
        "courses/lesson.html",
        lesson=lesson,
        tab=tab,
        jobs=jobs,
        # Durante una rigenerazione resta visibile l'ultimo risultato pronto.
        ready_pack=await db().scalar(
            select(AiJob).where(AiJob.lesson_id == lesson.id, AiJob.kind == "study_pack", AiJob.status == "ready")
            .order_by(AiJob.created_at.desc()).limit(1)
        ),
        ai_active=any(j.status in ("queued", "running") for j in jobs.values()),
        ai_label=ai.provider_label(),
        ai_remaining=max(current_app.config["AI_DAILY_LIMIT"] - await ai.used_today(g.user.id), 0),
    ), status


@bp.route("/<uuid:course_id>/lessons/<uuid:lesson_id>", methods=["GET", "POST"])
@login_required
async def lesson(course_id, lesson_id):
    lesson = await get_lesson(course_id, lesson_id)
    if request.method == "GET":
        return await _render_lesson(lesson, "ai" if request.args.get("tab") == "ai" else "notes")
    form = await request.form
    try:
        lesson.title = _text(form, "title", 200, required=True, label="Il titolo")
        lesson.lesson_date = _date(form, "lesson_date", "La data")
        lesson.status = _choice(form, "status", LESSON_STATUSES, "draft")
        notes = form.get("notes", "")
        if len(notes) > NOTES_MAX:
            raise FormError(f"Gli appunti possono avere al massimo {NOTES_MAX} caratteri.")
        lesson.notes = notes
    except FormError as e:
        # Nessun commit: la sessione viene scartata a fine richiesta, il form mostra i valori inseriti.
        await flash(str(e), "error")
        return await _render_lesson(lesson, "notes", 400)
    lesson.course.updated_at = utcnow()
    await db().commit()

    # "Salva e genera": stesso pulsante del desktop, si genera sempre sugli appunti appena salvati.
    kind = form.get("generate")
    if kind not in ai.KINDS:
        await flash("Salvato", "success")
        return redirect(url_for("courses.lesson", course_id=course_id, lesson_id=lesson_id))
    try:
        job = await ai.enqueue(g.user, lesson, kind)
    except ai.AiError as e:
        await flash(str(e), "error")
        return redirect(url_for("courses.lesson", course_id=course_id, lesson_id=lesson_id))
    if job.status == "ready":
        await flash("Già generato per questi appunti: mostro il risultato salvato.", "info")
        if kind == "exercise_set":
            return redirect(url_for("courses.exercises", course_id=course_id, lesson_id=lesson_id))
    elif kind == "study_pack" and lesson.status != "completed":
        lesson.status = "completed"  # come handleSaveAndGenerate del desktop
        await db().commit()
    return redirect(url_for("courses.lesson", course_id=course_id, lesson_id=lesson_id, tab="ai"))


@bp.route("/<uuid:course_id>/lessons/<uuid:lesson_id>/exercises", methods=["GET", "POST"])
@login_required
async def exercises(course_id, lesson_id):
    lesson = await get_lesson(course_id, lesson_id)
    job = (await ai.latest_jobs(lesson)).get("exercise_set")
    if job is None or job.result is None:
        return redirect(url_for("courses.lesson", course_id=course_id, lesson_id=lesson_id, tab="ai"))
    exercise_set = job.result
    graded = None
    if request.method == "POST":
        form = await request.form
        graded = {}
        for ex in exercise_set["exercises"]:
            answer = form.get(f"answer-{ex['id']}", "")
            if ex["type"] == "multiple_choice":
                correct = answer == ex["correctAnswer"]
            else:
                correct = is_open_answer_correct(answer, ex["acceptedAnswers"])
            graded[ex["id"]] = {"answer": answer, "correct": correct}
    return await render_template("courses/exercises.html", lesson=lesson, exercise_set=exercise_set, graded=graded, job=job)


@bp.post("/<uuid:course_id>/lessons/<uuid:lesson_id>/delete")
@login_required
async def delete_lesson(course_id, lesson_id):
    await db().delete(await get_lesson(course_id, lesson_id))
    await db().commit()
    await flash("Lezione eliminata", "success")
    return redirect(url_for("courses.detail", course_id=course_id, tab="lessons"))
