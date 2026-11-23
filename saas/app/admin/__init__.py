"""Pannello admin: elenco utenti con abbonamento, sospensione e proroga della prova.

Accesso solo alle email in ADMIN_EMAILS. L'abbonamento resta di Paddle (scritto dai webhook): qui si legge e basta.
"""

import uuid
from datetime import timedelta

from quart import Blueprint, abort, current_app, flash, g, redirect, render_template, request, url_for
from sqlalchemy import func, or_, select

from ..db import db
from ..models import User, utcnow
from ..web import admin_required, is_admin, login_required, paginate

bp = Blueprint("admin", __name__, url_prefix="/admin")

SUBSCRIBED = User.subscription_status.in_(("active", "trialing", "past_due"))
FILTERS = {
    "all": None,
    "subscribed": SUBSCRIBED,
    "trial": lambda: (~SUBSCRIBED | User.subscription_status.is_(None)) & (User.trial_ends_at > utcnow()),
    "banned": User.banned_at.is_not(None),
}
MAX_TRIAL_DAYS = 365


def _filter(name):
    cond = FILTERS.get(name)
    return cond() if callable(cond) else cond


@bp.get("/")
@login_required
@admin_required
async def index():
    q, current = request.args.get("q", "").strip(), request.args.get("filter", "all")
    query = select(User).order_by(User.created_at.desc())
    if (cond := _filter(current)) is not None:
        query = query.where(cond)
    if q:
        like = f"%{q.lower()}%"
        query = query.where(or_(User.email.like(like), func.lower(User.university).like(like)))
    stats = {}
    for name in FILTERS:
        count = select(func.count()).select_from(User)
        stats[name] = await db().scalar(count if (cond := _filter(name)) is None else count.where(cond))
    return await render_template("admin/index.html", page=await paginate(query), q=q, current=current, stats=stats)


async def _target(user_id: str) -> User:
    try:
        user = await db().get(User, uuid.UUID(user_id))
    except ValueError:
        abort(404)
    if not user:
        abort(404)
    return user


def _back():
    return redirect(request.referrer or url_for("admin.index"))


@bp.post("/users/<user_id>/ban")
@login_required
@admin_required
async def ban(user_id):
    user = await _target(user_id)
    if is_admin(user):
        await flash("Un admin non si può sospendere: toglilo prima da ADMIN_EMAILS.", "error")
        return _back()
    user.banned_at = utcnow()
    user.ban_reason = (await request.form).get("reason", "").strip()[:200] or None
    await db().commit()
    current_app.logger.warning("admin %s ha sospeso %s", g.user.email, user.email)
    await flash(f"{user.email} sospeso.", "success")
    return _back()


@bp.post("/users/<user_id>/unban")
@login_required
@admin_required
async def unban(user_id):
    user = await _target(user_id)
    user.banned_at = user.ban_reason = None
    await db().commit()
    current_app.logger.warning("admin %s ha riattivato %s", g.user.email, user.email)
    await flash(f"{user.email} riattivato.", "success")
    return _back()


@bp.post("/users/<user_id>/trial")
@login_required
@admin_required
async def extend_trial(user_id):
    user = await _target(user_id)
    try:
        days = int((await request.form).get("days", ""))
    except ValueError:
        days = 0
    if not 1 <= days <= MAX_TRIAL_DAYS:
        await flash(f"Giorni di prova: da 1 a {MAX_TRIAL_DAYS}.", "error")
        return _back()
    # Dalla scadenza attuale se è nel futuro, altrimenti da oggi.
    user.trial_ends_at = max(user.trial_ends_at, utcnow()) + timedelta(days=days)
    await db().commit()
    await flash(f"Prova di {user.email} prorogata al {user.trial_ends_at:%d/%m/%Y}.", "success")
    return _back()
