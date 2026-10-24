"""Corsi, lezioni con appunti, generazione AI ed esercizi."""

import asyncio
import re
import uuid
from datetime import date
from pathlib import PurePath

from quart import Blueprint, abort, current_app, flash, g, make_response, redirect, render_template, request, url_for
from sqlalchemy import func, select

from .. import ai, rag
from ..ai.schemas import is_open_answer_correct
from ..db import db
from ..materials import MIME_BY_EXT, extract_text
from ..models import (
    COURSE_COLORS, COURSE_STATUSES, LESSON_STATUSES, MATERIAL_TYPES, AiJob, Course, CourseQuestion, Flashcard, Lesson,
    Material, utcnow,
)
from ..web import login_required, paginate

bp = Blueprint("courses", __name__, url_prefix="/courses")

NOTES_MAX = 200_000
COURSE_TABS = {
    "overview": "Panoramica", "lessons": "Lezioni", "materials": "Materiali", "flashcards": "Flashcard", "ask": "Chiedi al corso",
}
QUESTION_MAX = 2000
QUESTIONS_SHOWN = 20


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
    flashcards = materials = questions = None
    if tab == "ask":
        recent = await db().scalars(
            select(CourseQuestion).where(CourseQuestion.course_id == course.id)
            .order_by(CourseQuestion.created_at.desc()).limit(QUESTIONS_SHOWN)
        )
        questions = list(reversed(recent.all()))
    elif tab == "flashcards":
        flashcards = await paginate(select(Flashcard).where(Flashcard.course_id == course.id).order_by(Flashcard.created_at.desc()))
    elif tab == "materials":
        materials = (await db().scalars(select(Material).where(Material.course_id == course.id).order_by(Material.created_at.desc()))).all()
    return await render_template(
        "courses/detail.html", course=course, tab=tab, tabs=COURSE_TABS, flashcards=flashcards, materials=materials,
        material_types=MATERIAL_TYPES, questions=questions, question_max=QUESTION_MAX, ai_label=ai.provider_label(),
    )


@bp.post("/<uuid:course_id>/ask")
@login_required
async def ask(course_id):
    """Porting di rag:query. Le domande restano nella cronologia della scheda, le fonti sotto ogni risposta."""
    course = await get_course(course_id)
    back = redirect(url_for("courses.detail", course_id=course.id, tab="ask"))
    question = (await request.form).get("question", "").strip()
    if not question or len(question) > QUESTION_MAX:
        await flash(f"Scrivi una domanda (al massimo {QUESTION_MAX} caratteri).", "error")
        return back
    try:
        await rag.ask(g.user, course, question)
    except rag.NoContext as e:
        await flash(str(e), "info")
    except ai.AiError as e:
        await flash(str(e), "error")
    return back


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
        db().add(material := Material(
            course_id=course.id, lesson_id=lesson_id, title=PurePath(name).stem[:255] or name,
            original_filename=name, mime_type=MIME_BY_EXT.get(PurePath(name).suffix.lower(), "application/octet-stream"),
            file_size=len(data), material_type=material_type, extracted_text=text, extraction_status=status,
        ))
        await db().flush()  # assegna l'id usato dai passaggi
        await rag.index_material(material)
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


LESSON_TABS = {"notes": "Appunti", "ai": "Studio AI", "path": "Studia passo passo", "maps": "Schemi"}
# Mermaid scrive <style> e attributi style nell'SVG: solo la scheda Schemi li permette, gli script restano 'self'.
MAPS_CSP = (
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)


async def _latest_ready(lesson: Lesson, kind: str) -> AiJob | None:
    # Durante una rigenerazione resta visibile l'ultimo risultato pronto.
    return await db().scalar(
        select(AiJob).where(AiJob.lesson_id == lesson.id, AiJob.kind == kind, AiJob.status == "ready")
        .order_by(AiJob.created_at.desc()).limit(1)
    )


def mindmap(root: str, outline: list[dict]) -> str:
    """Mappa concettuale Mermaid costruita dallo schema di studio: niente chiamata AI, sintassi sempre valida."""

    def clean(text: str) -> str:
        # Parentesi, virgolette e simili cambiano forma ai nodi o rompono il parsing: restano solo testo e punteggiatura.
        return " ".join(re.sub(r"[^\w\s.,;:'’+\-/=?!%]", " ", text).replace("::", ":").split()) or "…"

    lines = ["mindmap", f"  root(({clean(root)}))"]
    for topic in outline:
        lines.append(f"    {clean(topic['topic'])}")
        lines += [f"      {clean(sub)}" for sub in topic.get("subtopics", [])]
    return "\n".join(lines)


async def _render_lesson(lesson: Lesson, tab: str, status: int = 200):
    jobs = await ai.latest_jobs(lesson)
    path_job = await _latest_ready(lesson, "exercise_set")
    pack_job = await _latest_ready(lesson, "study_pack")
    topics = (path_job.result.get("topics") or []) if path_job else []
    topic = None
    if tab == "path" and request.args.get("topic", "").isdigit() and int(request.args["topic"]) < len(topics):
        topic = int(request.args["topic"])
    response = await make_response(await render_template(
        "courses/lesson.html",
        lesson=lesson,
        tab=tab,
        tabs=LESSON_TABS,
        jobs=jobs,
        ready_pack=pack_job,
        path_job=path_job,
        topics=topics,
        topic=topic,
        progress=(path_job.progress if path_job else None) or {},
        path_outdated=bool(path_job) and path_job.source_hash != ai.source_hash(lesson, "exercise_set"),
        concept_map=mindmap(f"Lezione {lesson.lesson_number}: {lesson.title}", pack_job.result["study_outline"]) if pack_job else None,
        ai_active=any(j.status in ("queued", "running") for j in jobs.values()),
        ai_label=ai.provider_label(),
        ai_remaining=max(current_app.config["AI_DAILY_LIMIT"] - await ai.used_today(g.user.id), 0),
    ), status)
    if tab == "maps":
        response.headers["Content-Security-Policy"] = MAPS_CSP
    return response


async def _generate(lesson: Lesson, kind: str):
    """Accoda una generazione sugli appunti salvati e porta alla scheda dove comparirà il risultato."""
    tab = "path" if kind == "exercise_set" else "ai"
    try:
        job = await ai.enqueue(g.user, lesson, kind)
    except ai.AiError as e:
        await flash(str(e), "error")
        return redirect(url_for("courses.lesson", course_id=lesson.course_id, lesson_id=lesson.id, tab=tab))
    if job.status == "ready":
        await flash("Già generato per questi appunti: mostro il risultato salvato.", "info")
    elif kind == "study_pack" and lesson.status != "completed":
        lesson.status = "completed"  # come handleSaveAndGenerate del desktop
        await db().commit()
    return redirect(url_for("courses.lesson", course_id=lesson.course_id, lesson_id=lesson.id, tab=tab))


@bp.route("/<uuid:course_id>/lessons/<uuid:lesson_id>", methods=["GET", "POST"])
@login_required
async def lesson(course_id, lesson_id):
    lesson = await get_lesson(course_id, lesson_id)
    if request.method == "GET":
        tab = request.args.get("tab", "notes")
        return await _render_lesson(lesson, tab if tab in LESSON_TABS else "notes")
    form = await request.form
    try:
        lesson.title = _text(form, "title", 200, required=True, label="Il titolo")
        lesson.lesson_date = _date(form, "lesson_date", "La data")
        lesson.status = _choice(form, "status", LESSON_STATUSES, "draft")
        notes = form.get("notes", "")
        if len(notes) > NOTES_MAX:
            raise FormError(f"Gli appunti possono avere al massimo {NOTES_MAX} caratteri.")
        lesson.notes = notes
        await rag.index_lesson_notes(lesson)
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
    return await _generate(lesson, kind)


@bp.post("/<uuid:course_id>/lessons/<uuid:lesson_id>/generate")
@login_required
async def generate(course_id, lesson_id):
    """Genera dagli appunti già salvati: pulsanti delle schede Studia passo passo e Schemi."""
    kind = (await request.form).get("kind")
    if kind not in ai.KINDS:
        abort(400)
    return await _generate(await get_lesson(course_id, lesson_id), kind)


@bp.post("/<uuid:course_id>/lessons/<uuid:lesson_id>/path/<int:topic>")
@login_required
async def topic_done(course_id, lesson_id, topic):
    """"Ho capito": segna l'argomento come studiato e passa al successivo, dopo l'ultimo al test."""
    lesson = await get_lesson(course_id, lesson_id)
    job = await _latest_ready(lesson, "exercise_set")
    topics = (job.result.get("topics") or []) if job else []
    if topic >= len(topics):
        abort(404)
    progress = job.progress or {}
    # Nuovo dizionario, non modifica sul posto: SQLAlchemy salva una colonna JSONB solo se viene riassegnata.
    job.progress = {**progress, "studied": sorted({*progress.get("studied", []), topic})}
    await db().commit()
    if topic + 1 < len(topics):
        return redirect(url_for("courses.lesson", course_id=course_id, lesson_id=lesson_id, tab="path", topic=topic + 1))
    return redirect(url_for("courses.exercises", course_id=course_id, lesson_id=lesson_id))


def topic_results(exercise_set: dict, graded: dict) -> tuple[list[int], list[int]]:
    """(capiti, da ripassare) come DuolingoQuiz.tsx: capito se tutte le sue domande sono corrette."""
    understood, to_review = [], []
    for i in range(len(exercise_set.get("topics") or [])):
        results = [graded[e["id"]]["correct"] for e in exercise_set["exercises"] if e.get("topicIndex") == i]
        if results:
            (understood if all(results) else to_review).append(i)
    return understood, to_review


@bp.route("/<uuid:course_id>/lessons/<uuid:lesson_id>/exercises", methods=["GET", "POST"])
@login_required
async def exercises(course_id, lesson_id):
    """Il test del percorso di studio ("Mettiti alla prova")."""
    lesson = await get_lesson(course_id, lesson_id)
    job = await _latest_ready(lesson, "exercise_set")
    if job is None:
        return redirect(url_for("courses.lesson", course_id=course_id, lesson_id=lesson_id, tab="path"))
    exercise_set = job.result
    graded = understood = to_review = None
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
        understood, to_review = topic_results(exercise_set, graded)
        right = sum(g["correct"] for g in graded.values())
        job.progress = {**(job.progress or {}), "last_result": {"correct": right, "total": len(graded), "to_review": to_review}}
        await db().commit()
    return await render_template(
        "courses/exercises.html", lesson=lesson, exercise_set=exercise_set, graded=graded, job=job,
        understood=understood, to_review=to_review,
    )


@bp.post("/<uuid:course_id>/lessons/<uuid:lesson_id>/delete")
@login_required
async def delete_lesson(course_id, lesson_id):
    await db().delete(await get_lesson(course_id, lesson_id))
    await db().commit()
    await flash("Lezione eliminata", "success")
    return redirect(url_for("courses.detail", course_id=course_id, tab="lessons"))
