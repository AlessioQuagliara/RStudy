import hashlib
import hmac
from datetime import timedelta

from flask import Blueprint, current_app, flash, redirect, render_template, request, session, url_for
from flask_login import current_user, login_required, login_user, logout_user
from sqlalchemy import delete, func, select
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from ..models import AuthAttempt, User, utcnow

bp = Blueprint("auth", __name__)

PASSWORD_MIN, PASSWORD_MAX = 10, 128
WINDOW = timedelta(minutes=15)
# Limiti per finestra di 15 minuti.
LOGIN_FAILURES_PER_EMAIL = 5
LOGIN_FAILURES_PER_IP = 20
REGISTRATIONS_PER_IP = 5
LOGIN_ERROR = "Email o password non corretti."
RATE_LIMITED = "Troppi tentativi. Riprova tra qualche minuto."

# Hash calcolato una volta: confrontato anche quando l'email non esiste, così i tempi di risposta non la rivelano.
_DUMMY_HASH = generate_password_hash("not-a-real-password")


def normalize_email(raw: str) -> str:
    return raw.strip().lower()


def _key(kind: str, value: str) -> str:
    secret = current_app.config["SECRET_KEY"].encode()
    return hmac.new(secret, f"{kind}:{value}".encode(), hashlib.sha256).hexdigest()


def _count_recent(key_hash: str) -> int:
    since = utcnow() - WINDOW
    return db.session.scalar(
        select(func.count()).select_from(AuthAttempt).where(AuthAttempt.key_hash == key_hash, AuthAttempt.created_at >= since)
    )


def _record(*key_hashes: str) -> None:
    db.session.add_all(AuthAttempt(key_hash=k) for k in key_hashes)
    # Pulizia lazy: le righe fuori finestra non servono più.
    db.session.execute(delete(AuthAttempt).where(AuthAttempt.created_at < utcnow() - WINDOW))
    db.session.commit()


def _validate_credentials(email: str, password: str) -> str | None:
    if not (3 <= len(email) <= 254) or "@" not in email or " " in email:
        return "Inserisci un indirizzo email valido."
    if not (PASSWORD_MIN <= len(password) <= PASSWORD_MAX):
        return f"La password deve avere tra {PASSWORD_MIN} e {PASSWORD_MAX} caratteri."
    return None


def _start_session(user: User) -> None:
    # Sessione nuova a ogni login: niente session fixation.
    session.clear()
    login_user(user)


@bp.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))
    if request.method == "GET":
        return render_template("auth/register.html")

    email = normalize_email(request.form.get("email", ""))
    password = request.form.get("password", "")
    ip_key = _key("register-ip", request.remote_addr or "")

    if _count_recent(ip_key) >= REGISTRATIONS_PER_IP:
        flash(RATE_LIMITED, "error")
        return render_template("auth/register.html", email=email), 429
    _record(ip_key)

    error = _validate_credentials(email, password)
    if not error and password != request.form.get("password_confirm", ""):
        error = "Le due password non coincidono."
    if not error and db.session.scalar(select(User.id).where(User.email == email)):
        # shortcut: rivela che l'email esiste; da sostituire con la verifica via email quando ci sarà l'invio di email.
        error = "Esiste già un account con questa email."
    if error:
        flash(error, "error")
        return render_template("auth/register.html", email=email), 400

    user = User(email=email, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
    _start_session(user)
    return redirect(url_for("main.dashboard"))


@bp.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.dashboard"))
    if request.method == "GET":
        return render_template("auth/login.html")

    email = normalize_email(request.form.get("email", ""))
    password = request.form.get("password", "")
    email_key = _key("login-email", email)
    ip_key = _key("login-ip", request.remote_addr or "")

    if _count_recent(email_key) >= LOGIN_FAILURES_PER_EMAIL or _count_recent(ip_key) >= LOGIN_FAILURES_PER_IP:
        flash(RATE_LIMITED, "error")
        return render_template("auth/login.html", email=email), 429

    user = db.session.scalar(select(User).where(User.email == email))
    if not check_password_hash(user.password_hash if user else _DUMMY_HASH, password) or not user:
        _record(email_key, ip_key)
        flash(LOGIN_ERROR, "error")
        return render_template("auth/login.html", email=email), 401

    _start_session(user)
    return redirect(url_for("main.dashboard"))


@bp.post("/logout")
@login_required
def logout():
    logout_user()
    session.clear()
    return redirect(url_for("auth.login"))
