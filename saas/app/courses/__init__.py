import uuid
from datetime import date

from flask import Blueprint, abort, current_app, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required
from sqlalchemy import func, select

from .. import ai
from ..ai.schemas import is_open_answer_correct
from ..extensions import db
from ..models import COURSE_COLORS, COURSE_STATUSES, LESSON_STATUSES, AiJob, Course, Flashcard, Lesson, utcnow

bp = Blueprint("courses", __name__, url_prefix="/courses")

NOTES_MAX = 200_000
PER_PAGE = 30
COURSE_TABS = {"overview": "Panoramica", "lessons": "Lezioni", "flashcards": "Flashcard"}


@bp.app_context_processor
def _labels():
    return {"statuses": COURSE_STATUSES, "lesson_statuses": LESSON_STATUSES, "colors": COURSE_COLORS}


class FormError(ValueError):
    pass


def get_course(course_id: uuid.UUID) -> Course:
    """Corso dell'utente corrente, o 404: un id di un altro utente non si distingue da uno inesistente."""
    course = db.session.scalar(select(Course).where(Course.id == course_id, Course.user_id == current_user.id))
    if course is None:
        abort(404)
    return course


def get_lesson(course_id: uuid.UUID, lesson_id: uuid.UUID) -> Lesson:
    lesson = db.session.scalar(
        select(Lesson)
        .join(Course)
        .where(Lesson.id == lesson_id, Lesson.course_id == course_id, Course.user_id == current_user.id)
    )
    if lesson is None:
        abort(404)
    return lesson


def _text(name: str, max_len: int, required: bool = False, label: str = "") -> str | None:
    value = request.form.get(name, "").strip()
    if required and not value:
        raise FormError(f"{label} è obbligatorio.")
    if len(value) > max_len:
        raise FormError(f"{label} può avere al massimo {max_len} caratteri.")
    return value or None


def _int(name: str, lo: int, hi: int, label: str, default: int | None = None) -> int | None:
    raw = request.form.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise FormError(f"{label} deve essere un numero intero.") from None
    if not lo <= value <= hi:
        raise FormError(f"{label} deve essere tra {lo} e {hi}.")
    return value


def _date(name: str, label: str) -> date | None:
    raw = request.form.get(name, "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise FormError(f"{label} non è una data valida.") from None


def _choice(name: str, choices, default: str) -> str:
    value = request.form.get(name, default)
    if value not in choices:
        raise FormError("Valore non valido.")
    return value


def paginate(query):
    """Pagina ?page=N; oltre l'ultima (es. dopo aver eliminato l'ultima carta) mostra l'ultima invece di una pagina vuota."""
    page = db.paginate(query, page=request.args.get("page", 1, type=int), per_page=PER_PAGE, error_out=False)
    if page.page > page.pages > 0:
        page = db.paginate(query, page=page.pages, per_page=PER_PAGE, error_out=False)
    return page


def _apply_course_form(course: Course) -> None:
    # Stessi limiti di createCourseInputSchema (studyforge/electron/shared/schemas.ts).
    course.title = _text("title", 200, required=True, label="Il titolo")
    course.code = _text("code", 50, label="Il codice")
    course.cfu = _int("cfu", 0, 60, "CFU", default=0)
    course.exam_date = _date("exam_date", "La data esame")
    course.introduction = _text("introduction", 5000, label="L'introduzione")
    course.objectives = _text("objectives", 5000, label="Gli obiettivi")
    course.target_lessons = _int("target_lessons", 0, 200, "Lezioni previste")
    course.status = _choice("status", COURSE_STATUSES, "active")
    course.color = _choice("color", COURSE_COLORS, "#6366f1")


@bp.get("/")
@login_required
def index():
    q = request.args.get("q", "").strip()
    status = request.args.get("status", "all")
    query = select(Course).where(Course.user_id == current_user.id).order_by(Course.updated_at.desc())
    if q:
        query = query.where(Course.title.icontains(q, autoescape=True))
    if status in COURSE_STATUSES:
        query = query.where(Course.status == status)
    courses = db.session.scalars(query).all()
    has_any = bool(courses) or db.session.scalar(select(Course.id).where(Course.user_id == current_user.id).limit(1))
    return render_template("courses/index.html", courses=courses, q=q, status=status, has_any=has_any)


@bp.route("/new", methods=["GET", "POST"])
@login_required
def new():
    course = Course(user_id=current_user.id, cfu=6, status="active", color="#6366f1")
    if request.method == "POST":
        try:
            _apply_course_form(course)
        except FormError as e:
            flash(str(e), "error")
            return render_template("courses/form.html", course=course), 400
        db.session.add(course)
        db.session.commit()
        flash("Corso creato", "success")
        return redirect(url_for("courses.detail", course_id=course.id))
    return render_template("courses/form.html", course=course)


@bp.get("/<uuid:course_id>")
@login_required
def detail(course_id):
    course = get_course(course_id)
    tab = request.args.get("tab", "overview")
    if tab not in COURSE_TABS:
        tab = "overview"
    flashcards = None
    if tab == "flashcards":
        flashcards = paginate(select(Flashcard).where(Flashcard.course_id == course.id).order_by(Flashcard.created_at.desc()))
    return render_template("courses/detail.html", course=course, tab=tab, tabs=COURSE_TABS, flashcards=flashcards)


@bp.route("/<uuid:course_id>/edit", methods=["GET", "POST"])
@login_required
def edit(course_id):
    course = get_course(course_id)
    if request.method == "POST":
        try:
            _apply_course_form(course)
        except FormError as e:
            # Nessun commit: la sessione viene scartata a fine richiesta, il form mostra i valori inseriti.
            flash(str(e), "error")
            return render_template("courses/form.html", course=course), 400
        db.session.commit()
        flash("Corso aggiornato", "success")
        return redirect(url_for("courses.detail", course_id=course.id))
    return render_template("courses/form.html", course=course)


@bp.post("/<uuid:course_id>/delete")
@login_required
def delete(course_id):
    db.session.delete(get_course(course_id))
    db.session.commit()
    flash("Corso eliminato", "success")
    return redirect(url_for("courses.index"))


@bp.post("/<uuid:course_id>/lessons")
@login_required
def create_lesson(course_id):
    course = get_course(course_id)
    try:
        title = _text("title", 200, required=True, label="Il titolo")
    except FormError as e:
        flash(str(e), "error")
        return redirect(url_for("courses.detail", course_id=course.id, tab="lessons"))
    # max+1 e non count+1: dopo un'eliminazione il numero non si ripete.
    number = (db.session.scalar(select(func.max(Lesson.lesson_number)).where(Lesson.course_id == course.id)) or 0) + 1
    lesson = Lesson(course=course, lesson_number=number, title=title, lesson_date=date.today(), status="draft", notes="")
    db.session.add(lesson)
    course.updated_at = utcnow()
    db.session.commit()
    flash("Lezione creata", "success")
    return redirect(url_for("courses.lesson", course_id=course.id, lesson_id=lesson.id))


def _render_lesson(lesson: Lesson, tab: str, status: int = 200):
    jobs = ai.latest_jobs(lesson)
    return render_template(
        "courses/lesson.html",
        lesson=lesson,
        tab=tab,
        jobs=jobs,
        # Durante una rigenerazione resta visibile l'ultimo risultato pronto.
        ready_pack=db.session.scalar(
            select(AiJob).where(AiJob.lesson_id == lesson.id, AiJob.kind == "study_pack", AiJob.status == "ready")
            .order_by(AiJob.created_at.desc()).limit(1)
        ),
        ai_active=any(j.status in ("queued", "running") for j in jobs.values()),
        ai_label=ai.provider_label(),
        ai_remaining=max(current_app.config["AI_DAILY_LIMIT"] - ai.used_today(current_user.id), 0),
    ), status


@bp.route("/<uuid:course_id>/lessons/<uuid:lesson_id>", methods=["GET", "POST"])
@login_required
def lesson(course_id, lesson_id):
    lesson = get_lesson(course_id, lesson_id)
    if request.method == "GET":
        return _render_lesson(lesson, "ai" if request.args.get("tab") == "ai" else "notes")
    try:
        lesson.title = _text("title", 200, required=True, label="Il titolo")
        lesson.lesson_date = _date("lesson_date", "La data")
        lesson.status = _choice("status", LESSON_STATUSES, "draft")
        notes = request.form.get("notes", "")
        if len(notes) > NOTES_MAX:
            raise FormError(f"Gli appunti possono avere al massimo {NOTES_MAX} caratteri.")
        lesson.notes = notes
    except FormError as e:
        # Nessun commit: la sessione viene scartata a fine richiesta, il form mostra i valori inseriti.
        flash(str(e), "error")
        return _render_lesson(lesson, "notes", 400)
    lesson.course.updated_at = utcnow()
    db.session.commit()

    # "Salva e genera": stesso pulsante del desktop, si genera sempre sugli appunti appena salvati.
    kind = request.form.get("generate")
    if kind not in ai.KINDS:
        flash("Salvato", "success")
        return redirect(url_for("courses.lesson", course_id=course_id, lesson_id=lesson_id))
    try:
        job = ai.enqueue(current_user, lesson, kind)
    except ai.AiError as e:
        flash(str(e), "error")
        return redirect(url_for("courses.lesson", course_id=course_id, lesson_id=lesson_id))
    if job.status == "ready":
        flash("Già generato per questi appunti: mostro il risultato salvato.", "info")
        if kind == "exercise_set":
            return redirect(url_for("courses.exercises", course_id=course_id, lesson_id=lesson_id))
    elif kind == "study_pack" and lesson.status != "completed":
        lesson.status = "completed"  # come handleSaveAndGenerate del desktop
        db.session.commit()
    return redirect(url_for("courses.lesson", course_id=course_id, lesson_id=lesson_id, tab="ai"))


@bp.route("/<uuid:course_id>/lessons/<uuid:lesson_id>/exercises", methods=["GET", "POST"])
@login_required
def exercises(course_id, lesson_id):
    lesson = get_lesson(course_id, lesson_id)
    job = ai.latest_jobs(lesson).get("exercise_set")
    if job is None or job.result is None:
        return redirect(url_for("courses.lesson", course_id=course_id, lesson_id=lesson_id, tab="ai"))
    exercise_set = job.result
    graded = None
    if request.method == "POST":
        graded = {}
        for ex in exercise_set["exercises"]:
            answer = request.form.get(f"answer-{ex['id']}", "")
            if ex["type"] == "multiple_choice":
                correct = answer == ex["correctAnswer"]
            else:
                correct = is_open_answer_correct(answer, ex["acceptedAnswers"])
            graded[ex["id"]] = {"answer": answer, "correct": correct}
    return render_template("courses/exercises.html", lesson=lesson, exercise_set=exercise_set, graded=graded, job=job)


@bp.post("/<uuid:course_id>/lessons/<uuid:lesson_id>/delete")
@login_required
def delete_lesson(course_id, lesson_id):
    db.session.delete(get_lesson(course_id, lesson_id))
    db.session.commit()
    flash("Lezione eliminata", "success")
    return redirect(url_for("courses.detail", course_id=course_id, tab="lessons"))
