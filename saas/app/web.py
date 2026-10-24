"""Pezzi comuni a tutte le richieste: utente corrente, login obbligatorio, CSRF, paginazione.

Sostituiscono Flask-Login, Flask-WTF e db.paginate, che non funzionano con Quart.
"""

import functools
import hashlib
import hmac
import math
import secrets
import uuid

from quart import abort, current_app, g, redirect, request, session, url_for
from sqlalchemy import func, select

from .db import db
from .models import User

PER_PAGE = 30


# ---------- utente ----------


def _identifier() -> str:
    """Impronta di IP e browser, calcolata come la session_protection "strong" di Flask-Login.

    Stesso calcolo e stesse chiavi di sessione (`_user_id`, `_id`): gli accessi fatti con la versione Flask restano validi.
    """
    address = request.headers.get("X-Forwarded-For", request.remote_addr)
    if address is not None:
        address = address.encode("utf-8").split(b",")[0].strip()
    user_agent = request.headers.get("User-Agent")
    if user_agent is not None:
        user_agent = user_agent.encode("utf-8")
    return hashlib.sha512(f"{address}|{user_agent}".encode("utf8")).hexdigest()


def login_user(user: User) -> None:
    # Sessione nuova a ogni login: niente session fixation.
    session.clear()
    session["_user_id"] = str(user.id)
    session["_id"] = _identifier()


def logout_user() -> None:
    session.clear()


async def load_user() -> None:
    """before_request: `g.user` è l'utente della sessione, o None."""
    g.user = None
    user_id = session.get("_user_id")
    if not user_id:
        return
    if session.get("_id") != _identifier():
        session.clear()  # cookie usato da un altro IP o browser
        return
    try:
        g.user = await db().get(User, uuid.UUID(user_id))
    except ValueError:
        session.clear()


def login_required(view):
    @functools.wraps(view)
    async def wrapper(*args, **kwargs):
        if g.user is None:
            return redirect(url_for("auth.login"))
        return await view(*args, **kwargs)

    return wrapper


# ---------- CSRF ----------


def csrf_token() -> str:
    """Token della sessione, inserito nei form dai template con csrf_token()."""
    if "_csrf" not in session:
        session["_csrf"] = secrets.token_urlsafe(32)
    return session["_csrf"]


async def check_csrf() -> None:
    """before_request: ogni POST deve rimandare il token della sessione. Il webhook Paddle ha la sua firma."""
    if request.method != "POST" or request.endpoint == "billing.webhook" or not current_app.config["CSRF_ENABLED"]:
        return
    sent, expected = (await request.form).get("csrf_token", ""), session.get("_csrf", "")
    if not expected or not hmac.compare_digest(sent, expected):
        abort(400, "Token CSRF mancante o scaduto: ricarica la pagina e riprova.")


# ---------- paginazione ----------


class Page:
    """Una pagina di risultati, con la stessa interfaccia di db.paginate di Flask-SQLAlchemy usata dai template."""

    def __init__(self, items, page: int, total: int):
        self.items, self.page, self.total = items, page, total
        self.pages = math.ceil(total / PER_PAGE)
        self.has_prev, self.prev_num = page > 1, page - 1
        self.has_next, self.next_num = page < self.pages, page + 1
        self.first = (page - 1) * PER_PAGE + 1 if total else 0
        self.last = min(total, page * PER_PAGE)

    def iter_pages(self, *, left_edge=2, left_current=2, right_current=4, right_edge=2):
        """Numeri di pagina con None al posto dei salti, come Flask-SQLAlchemy."""
        pages_end = self.pages + 1
        if pages_end == 1:
            return
        left_end = min(1 + left_edge, pages_end)
        yield from range(1, left_end)
        if left_end == pages_end:
            return
        mid_start, mid_end = max(left_end, self.page - left_current), min(self.page + right_current, pages_end)
        if mid_start - left_end > 0:
            yield None
        yield from range(mid_start, mid_end)
        if mid_end == pages_end:
            return
        right_start = max(mid_end, pages_end - right_edge)
        if right_start - mid_end > 0:
            yield None
        yield from range(right_start, pages_end)


async def paginate(query) -> Page:
    """Pagina ?page=N; oltre l'ultima (es. dopo aver eliminato l'ultima carta) mostra l'ultima invece di una pagina vuota."""
    total = await db().scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    page = max(request.args.get("page", 1, type=int), 1)
    page = min(page, max(math.ceil(total / PER_PAGE), 1))
    items = (await db().scalars(query.limit(PER_PAGE).offset((page - 1) * PER_PAGE))).all()
    return Page(items, page, total)
