"""Registrazione, accesso e uscita, con rate limit per email e per IP."""

import asyncio
import hashlib
import hmac
from datetime import timedelta

from quart import Blueprint, current_app, flash, g, redirect, render_template, request, url_for
from sqlalchemy import delete, func, select
from werkzeug.security import check_password_hash, generate_password_hash

from ..billing import TRIAL_DAYS
from ..db import db
from ..models import AuthAttempt, User, utcnow
from ..web import login_required, login_user, logout_user

bp = Blueprint("auth", __name__)

PASSWORD_MIN, PASSWORD_MAX = 10, 128
SCHOOL_MAX = 200
# Suggerimenti solo per i valori scelti da almeno 3 utenti: un testo libero inserito da una persona sola resta privato.
SUGGESTION_MIN_USERS = 3
WINDOW = timedelta(minutes=15)
# Limiti per finestra di 15 minuti.
LOGIN_FAILURES_PER_EMAIL = 5
LOGIN_FAILURES_PER_IP = 20
REGISTRATIONS_PER_IP = 5
LOGIN_ERROR = "Email o password non corretti."
RATE_LIMITED = "Troppi tentativi. Riprova tra qualche minuto."

# Hash calcolato una volta: confrontato anche quando l'email non esiste, così i tempi di risposta non la rivelano.
_DUMMY_HASH = generate_password_hash("not-a-real-password")
# scrypt usa ~32 MB e decine di ms di CPU: gira in un thread per non bloccare le altre richieste,
# al più due insieme per processo così un'ondata di login non esaurisce memoria e CPU.
_HASHING = asyncio.Semaphore(2)


async def _hash(password: str) -> str:
    async with _HASHING:
        return await asyncio.to_thread(generate_password_hash, password)


async def _check(stored: str, password: str) -> bool:
    async with _HASHING:
        return await asyncio.to_thread(check_password_hash, stored, password)


def normalize_email(raw: str) -> str:
    return raw.strip().lower()


def _key(kind: str, value: str) -> str:
    secret = current_app.config["SECRET_KEY"].encode()
    return hmac.new(secret, f"{kind}:{value}".encode(), hashlib.sha256).hexdigest()


async def _count_recent(key_hash: str) -> int:
    since = utcnow() - WINDOW
    return await db().scalar(
        select(func.count()).select_from(AuthAttempt).where(AuthAttempt.key_hash == key_hash, AuthAttempt.created_at >= since)
    )


async def _record(*key_hashes: str) -> None:
    db().add_all(AuthAttempt(key_hash=k) for k in key_hashes)
    # Pulizia lazy: le righe fuori finestra non servono più.
    await db().execute(delete(AuthAttempt).where(AuthAttempt.created_at < utcnow() - WINDOW))
    await db().commit()


def _validate_credentials(email: str, password: str) -> str | None:
    if not (3 <= len(email) <= 254) or "@" not in email or " " in email:
        return "Inserisci un indirizzo email valido."
    if not (PASSWORD_MIN <= len(password) <= PASSWORD_MAX):
        return f"La password deve avere tra {PASSWORD_MIN} e {PASSWORD_MAX} caratteri."
    return None


def _clean(raw: str) -> str:
    return " ".join(raw.split())


async def _suggestions(column) -> list[str]:
    return (await db().scalars(
        select(column).where(column.is_not(None)).group_by(column).having(func.count() >= SUGGESTION_MIN_USERS).order_by(column).limit(300)
    )).all()


async def _render_register(status: int = 200, **form):
    return await render_template(
        "auth/register.html", universities=await _suggestions(User.university), faculties=await _suggestions(User.faculty), **form
    ), status


@bp.route("/register", methods=["GET", "POST"])
async def register():
    if g.user:
        return redirect(url_for("main.dashboard"))
    if request.method == "GET":
        return await _render_register()

    data = await request.form
    email = normalize_email(data.get("email", ""))
    password = data.get("password", "")
    form = {"email": email, "university": _clean(data.get("university", "")), "faculty": _clean(data.get("faculty", ""))}
    ip_key = _key("register-ip", request.remote_addr or "")

    if await _count_recent(ip_key) >= REGISTRATIONS_PER_IP:
        await flash(RATE_LIMITED, "error")
        return await _render_register(429, **form)
    await _record(ip_key)

    error = _validate_credentials(email, password)
    if not error and not (form["university"] and form["faculty"]):
        error = "Indica università e facoltà."
    if not error and max(len(form["university"]), len(form["faculty"])) > SCHOOL_MAX:
        error = f"Università e facoltà possono avere al massimo {SCHOOL_MAX} caratteri."
    if not error and password != data.get("password_confirm", ""):
        error = "Le due password non coincidono."
    if not error and await db().scalar(select(User.id).where(User.email == email)):
        # shortcut: rivela che l'email esiste; da sostituire con la verifica via email quando ci sarà l'invio di email.
        error = "Esiste già un account con questa email."
    if error:
        await flash(error, "error")
        return await _render_register(400, **form)

    user = User(
        email=email,
        password_hash=await _hash(password),
        university=form["university"],
        faculty=form["faculty"],
        trial_ends_at=utcnow() + timedelta(days=TRIAL_DAYS),
    )
    db().add(user)
    await db().commit()
    login_user(user)
    return redirect(url_for("main.dashboard"))


@bp.route("/login", methods=["GET", "POST"])
async def login():
    if g.user:
        return redirect(url_for("main.dashboard"))
    if request.method == "GET":
        return await render_template("auth/login.html")

    data = await request.form
    email = normalize_email(data.get("email", ""))
    password = data.get("password", "")
    email_key = _key("login-email", email)
    ip_key = _key("login-ip", request.remote_addr or "")

    if await _count_recent(email_key) >= LOGIN_FAILURES_PER_EMAIL or await _count_recent(ip_key) >= LOGIN_FAILURES_PER_IP:
        await flash(RATE_LIMITED, "error")
        return await render_template("auth/login.html", email=email), 429

    user = await db().scalar(select(User).where(User.email == email))
    if not await _check(user.password_hash if user else _DUMMY_HASH, password) or not user:
        await _record(email_key, ip_key)
        await flash(LOGIN_ERROR, "error")
        return await render_template("auth/login.html", email=email), 401

    login_user(user)
    return redirect(url_for("main.dashboard"))


@bp.post("/logout")
@login_required
async def logout():
    logout_user()
    return redirect(url_for("main.landing"))
