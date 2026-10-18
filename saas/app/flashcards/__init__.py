import uuid
from datetime import datetime, timedelta

from flask import Blueprint, abort, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required
from sqlalchemy import func, or_, select

from ..ai import ROME
from ..courses import FormError, _choice, _text, get_course, paginate
from ..extensions import db
from ..models import Course, Flashcard, utcnow

bp = Blueprint("flashcards", __name__, url_prefix="/flashcards")

DIFFICULTIES = {"easy": "Facile", "medium": "Media", "hard": "Difficile"}
# Stessi intervalli di SRS_INTERVAL_DAYS (studyforge/electron/db/repositories.ts).
SRS_INTERVAL_DAYS = {"easy": 7, "medium": 3, "hard": 1}


@bp.app_context_processor
def _labels():
    return {"difficulties": DIFFICULTIES}


def _owned():
    return select(Flashcard).join(Course).where(Course.user_id == current_user.id)


def due_query(course_id: uuid.UUID | None = None):
    """Carte mai ripassate o con scadenza entro la fine di oggi (ora di Roma), come FlashcardsRepo.dueToday."""
    end_of_today = datetime.now(ROME).replace(hour=23, minute=59, second=59, microsecond=999999)
    query = _owned().where(or_(Flashcard.next_review_at.is_(None), Flashcard.next_review_at <= end_of_today))
    if course_id:
        query = query.where(Flashcard.course_id == course_id)
    return query.order_by(Flashcard.next_review_at.asc().nulls_first(), Flashcard.created_at)


def _get(card_id: uuid.UUID) -> Flashcard:
    card = db.session.scalar(_owned().where(Flashcard.id == card_id))
    if card is None:
        abort(404)
    return card


def _course_arg() -> uuid.UUID | None:
    try:
        return uuid.UUID(request.args.get("course", ""))
    except ValueError:
        return None


def _apply_form(card: Flashcard) -> None:
    card.front = _text("front", 1000, required=True, label="Il fronte")
    card.back = _text("back", 2000, required=True, label="Il retro")
    card.difficulty = _choice("difficulty", DIFFICULTIES, "medium")
    tags = [t.strip() for t in request.form.get("tags", "").split(",") if t.strip()]
    if len(tags) > 20 or any(len(t) > 50 for t in tags):
        raise FormError("Massimo 20 tag di 50 caratteri ciascuno.")
    card.tags = tags


def _back_url(card: Flashcard) -> str:
    target = request.form.get("next", "")
    # Solo percorsi interni: niente redirect verso altri domini ("//evil", "https://...", "/\\evil").
    if target.startswith("/") and not target.startswith(("//", "/\\")):
        return target
    return url_for("courses.detail", course_id=card.course_id, tab="flashcards")


@bp.get("/")
@login_required
def index():
    course_id = _course_arg()
    difficulty = request.args.get("difficulty", "all")
    tag = request.args.get("tag", "").strip().lower()
    query = _owned().order_by(Flashcard.created_at.desc())
    if course_id:
        query = query.where(Flashcard.course_id == course_id)
    if difficulty in DIFFICULTIES:
        query = query.where(Flashcard.difficulty == difficulty)
    if tag:
        # Sottostringa di almeno un tag, senza distinzione di maiuscole; % e _ dell'utente valgono come testo.
        escaped = tag.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        tags = func.jsonb_array_elements_text(Flashcard.tags).table_valued("value").alias("t")
        query = query.where(select(1).select_from(tags).where(tags.c.value.ilike(f"%{escaped}%", escape="\\")).exists())
    courses = db.session.scalars(select(Course).where(Course.user_id == current_user.id).order_by(Course.title)).all()
    return render_template(
        "flashcards/index.html", cards=paginate(query), courses=courses, course_id=course_id, difficulty=difficulty,
        tag=request.args.get("tag", ""), due_count=_count(due_query(course_id)),
    )


def _count(query) -> int:
    return db.session.scalar(select(func.count()).select_from(query.order_by(None).subquery()))


@bp.get("/study")
@login_required
def study():
    course_id = _course_arg()
    query = due_query(course_id)
    return render_template(
        "flashcards/study.html", card=db.session.scalar(query.limit(1)), remaining=_count(query), course_id=course_id
    )


@bp.post("/<uuid:card_id>/review")
@login_required
def review(card_id):
    card = _get(card_id)
    grade = request.form.get("grade")
    if grade not in SRS_INTERVAL_DAYS:
        abort(400)
    card.next_review_at = utcnow() + timedelta(days=SRS_INTERVAL_DAYS[grade])
    card.review_count += 1
    db.session.commit()
    return redirect(url_for("flashcards.study", course=request.args.get("course") or None))


@bp.route("/new", methods=["GET", "POST"])
@login_required
def new():
    course_id = _course_arg()
    course = get_course(course_id) if course_id else abort(404)
    card = Flashcard(course_id=course.id, difficulty="medium", source="manual", tags=[], review_count=0)
    if request.method == "POST":
        try:
            _apply_form(card)
        except FormError as e:
            flash(str(e), "error")
            return render_template("flashcards/form.html", card=card, course=course), 400
        db.session.add(card)
        db.session.commit()
        flash("Flashcard creata", "success")
        return redirect(_back_url(card))
    return render_template("flashcards/form.html", card=card, course=course)


@bp.route("/<uuid:card_id>/edit", methods=["GET", "POST"])
@login_required
def edit(card_id):
    card = _get(card_id)
    if request.method == "POST":
        try:
            _apply_form(card)
        except FormError as e:
            flash(str(e), "error")
            return render_template("flashcards/form.html", card=card, course=card.course), 400
        db.session.commit()
        flash("Flashcard aggiornata", "success")
        return redirect(_back_url(card))
    return render_template("flashcards/form.html", card=card, course=card.course)


@bp.post("/<uuid:card_id>/duplicate")
@login_required
def duplicate(card_id):
    card = _get(card_id)
    db.session.add(Flashcard(course_id=card.course_id, lesson_id=card.lesson_id, front=card.front, back=card.back,
                             tags=list(card.tags), difficulty=card.difficulty, source="manual"))
    db.session.commit()
    flash("Flashcard duplicata", "success")
    return redirect(_back_url(card))


@bp.post("/<uuid:card_id>/delete")
@login_required
def delete(card_id):
    card = _get(card_id)
    back = _back_url(card)
    db.session.delete(card)
    db.session.commit()
    flash("Flashcard eliminata", "success")
    return redirect(back)
