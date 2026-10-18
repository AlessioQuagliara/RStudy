from datetime import date

from flask import Blueprint, redirect, render_template, url_for
from flask_login import current_user, login_required
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ..extensions import db
from ..flashcards import due_query
from ..models import Course

bp = Blueprint("main", __name__)


@bp.get("/")
def landing():
    # Stessi contenuti della landing in web/ (Next.js); chi ha già fatto l'accesso va dritto all'app.
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))
    return render_template("main/landing.html")


@bp.get("/dashboard")
@login_required
def dashboard():
    # Stesse metriche di useDashboardStats.ts del desktop.
    courses = db.session.scalars(
        select(Course).where(Course.user_id == current_user.id).options(selectinload(Course.lessons)).order_by(Course.updated_at.desc())
    ).all()
    active = [c for c in courses if c.status == "active"]
    upcoming = sorted((c for c in active if c.exam_date and c.exam_date >= date.today()), key=lambda c: c.exam_date)
    lessons = [lesson for c in courses for lesson in c.lessons]
    return render_template(
        "main/dashboard.html",
        active_count=len(active),
        total_cfu=sum(c.cfu for c in active),
        next_exam=upcoming[0] if upcoming else None,
        completed_lessons=sum(1 for lesson in lessons if lesson.status == "completed"),
        total_lessons=len(lessons),
        recent=courses[:5],
        due_today=db.session.scalar(select(func.count()).select_from(due_query().order_by(None).subquery())),
    )


@bp.get("/healthz")
def healthz():
    # Solo liveness del processo: non tocca il database.
    return {"status": "ok"}
