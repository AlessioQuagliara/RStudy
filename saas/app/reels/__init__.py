"""Reel già generati di tutte le lezioni: elenco con filtri e feed da guardare."""

import math
import uuid

from quart import Blueprint, g, render_template, request
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import distinct_on

from ..db import db
from ..models import AiJob, Course, Lesson
from ..web import PER_PAGE, Page, login_required

bp = Blueprint("reels", __name__, url_prefix="/reels")


async def ready_reels(course_id: uuid.UUID | None = None, q: str = "") -> list[dict]:
    """Reel dell'ultima generazione pronta di ogni lezione, dal più recente. `n` è la posizione nel feed filtrato."""
    query = (
        select(AiJob, Lesson).join(Lesson, AiJob.lesson_id == Lesson.id).join(Course)
        .where(Course.user_id == g.user.id, AiJob.kind == "reels", AiJob.status == "ready")
        # Una rigenerazione sostituisce i reel precedenti della stessa lezione.
        .order_by(AiJob.lesson_id, AiJob.created_at.desc()).ext(distinct_on(AiJob.lesson_id))
    )
    if course_id:
        query = query.where(Lesson.course_id == course_id)
    rows = sorted((await db().execute(query)).all(), key=lambda r: r.AiJob.created_at, reverse=True)
    needle = q.lower()
    items = [
        {"reel": reel, "lesson": row.Lesson}
        for row in rows
        for reel in row.AiJob.result["reels"]
        if needle in reel["title"].lower() or any(needle in s["caption"].lower() for s in reel["scenes"])
    ]
    for n, item in enumerate(items, 1):
        item["n"] = n
    return items


def _filters() -> tuple[uuid.UUID | None, str]:
    try:
        course_id = uuid.UUID(request.args.get("course", ""))
    except ValueError:
        course_id = None
    return course_id, request.args.get("q", "").strip()[:200]


@bp.get("/")
@login_required
async def index():
    course_id, q = _filters()
    # shortcut: filtro e paginazione in Python sul JSON dei job, va bene finché un utente ha qualche centinaio di reel.
    items = await ready_reels(course_id, q)
    page = min(max(request.args.get("page", 1, type=int), 1), max(math.ceil(len(items) / PER_PAGE), 1))
    courses = (await db().scalars(select(Course).where(Course.user_id == g.user.id).order_by(Course.title))).all()
    return await render_template(
        "reels/index.html", reels=Page(items[(page - 1) * PER_PAGE : page * PER_PAGE], page, len(items)),
        courses=courses, course_id=course_id, q=q,
    )


@bp.get("/watch")
@login_required
async def watch():
    course_id, q = _filters()
    return await render_template("reels/watch.html", items=await ready_reels(course_id, q), course_id=course_id, q=q)
