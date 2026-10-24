"""Abbonamento Paddle: prova di 15 giorni senza carta, poi piano mensile o annuale.

Lo stato dell'abbonamento arriva solo dai webhook firmati: il ritorno dal checkout non sblocca nulla.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime

from quart import Blueprint, abort, current_app, flash, g, redirect, render_template, request, url_for
from sqlalchemy import select

from ..db import db
from ..models import User
from ..web import login_required

bp = Blueprint("billing", __name__)
log = logging.getLogger(__name__)

TRIAL_DAYS = 15
PLANS = {"monthly": "4,99 € al mese", "yearly": "39,90 € all'anno"}
SIGNATURE_TOLERANCE_SECONDS = 300
_PADDLE_API = {"sandbox": "https://sandbox-api.paddle.com", "production": "https://api.paddle.com"}
# Solo per la pagina abbonamento: Paddle.js carica script e iframe del checkout dai suoi domini.
CHECKOUT_CSP = (
    "default-src 'self'; img-src 'self' data: https://cdn.paddle.com; "
    "style-src 'self' 'unsafe-inline' https://cdn.paddle.com; script-src 'self' https://cdn.paddle.com; "
    "frame-src https://buy.paddle.com https://sandbox-buy.paddle.com; connect-src 'self' https://*.paddle.com; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)
# Pagine raggiungibili anche a prova scaduta, esportazione compresa: i dati restano dell'utente.
_OPEN_ENDPOINTS = {"static", "main.landing", "main.healthz", "settings.export"}


@bp.before_app_request
async def require_access():
    if g.user is None or g.user.has_access:
        return None
    if request.blueprint in ("billing", "auth") or request.endpoint in _OPEN_ENDPOINTS:
        return None
    return redirect(url_for("billing.index"))


@bp.get("/abbonamento")
@login_required
async def index():
    cfg = current_app.config
    response = await current_app.make_response(
        await render_template(
            "billing/index.html",
            plans=PLANS,
            prices={"monthly": cfg["PADDLE_PRICE_MONTHLY"], "yearly": cfg["PADDLE_PRICE_YEARLY"]},
            enabled=bool(cfg["PADDLE_ENVIRONMENT"]),
            checkout_done=request.args.get("checkout") == "ok",
        )
    )
    response.headers["Content-Security-Policy"] = CHECKOUT_CSP
    return response


@bp.post("/abbonamento/portale")
@login_required
async def portal():
    """Portale clienti Paddle: disdetta, cambio piano, metodo di pagamento e fatture."""
    cfg = current_app.config
    user = g.user
    if not (cfg["PADDLE_ENVIRONMENT"] and user.paddle_customer_id):
        abort(404)
    body = {"subscription_ids": [user.paddle_subscription_id]} if user.paddle_subscription_id else {}
    req = urllib.request.Request(
        f"{_PADDLE_API[cfg['PADDLE_ENVIRONMENT']]}/customers/{user.paddle_customer_id}/portal-sessions",
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {cfg['PADDLE_API_KEY']}", "Content-Type": "application/json"},
        method="POST",
    )

    def call() -> str:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.load(resp)["data"]["urls"]["general"]["overview"]

    try:
        # urllib è bloccante: in un thread, così le altre richieste non aspettano Paddle.
        url = await asyncio.to_thread(call)
    except (urllib.error.URLError, TimeoutError, KeyError, ValueError):
        log.exception("Creazione sessione portale Paddle fallita")
        await flash("Il portale di Paddle non risponde. Riprova tra poco.", "error")
        return redirect(url_for("billing.index"))
    return redirect(url)


def verify_signature(raw_body: bytes, header: str, secret: str, now: float | None = None) -> bool:
    """Header Paddle-Signature "ts=...;h1=...": HMAC-SHA256 di "ts:corpo". Più h1 durante la rotazione del segreto."""
    parts = [p.split("=", 1) for p in header.split(";") if "=" in p]
    ts = next((v for k, v in parts if k == "ts"), "")
    if not ts.isdigit() or abs((now or time.time()) - int(ts)) > SIGNATURE_TOLERANCE_SECONDS:
        return False
    expected = hmac.new(secret.encode(), ts.encode() + b":" + raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, v) for k, v in parts if k == "h1")


def _parse_time(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


async def _find_user(data: dict) -> User | None:
    user = await db().scalar(select(User).where(User.paddle_subscription_id == data["id"]))
    if user:
        return user
    # Primo evento di un abbonamento: l'utente arriva dal customData passato al checkout.
    try:
        user = await db().get(User, uuid.UUID(str((data.get("custom_data") or {}).get("user_id"))))
    except ValueError:
        return None
    # Un secondo abbonamento non sostituisce quello già attivo: la pagina abbonamento non lo permette,
    # e senza questo controllo gli eventi del doppione (es. la sua disdetta) toglierebbero l'accesso.
    return None if user and user.is_subscribed else user


async def apply_subscription_event(event: dict) -> None:
    data = event["data"]
    occurred_at = _parse_time(event["occurred_at"])
    user = await _find_user(data)
    if not user:
        log.warning("Webhook %s per un abbonamento senza utente: %s", event["event_type"], data.get("id"))
        return
    if user.subscription_updated_at and occurred_at <= user.subscription_updated_at:
        return  # evento più vecchio di quello già applicato
    cfg = current_app.config
    price_id = next((item["price"]["id"] for item in data.get("items") or []), None)
    scheduled = data.get("scheduled_change") or {}
    user.paddle_customer_id = data.get("customer_id")
    user.paddle_subscription_id = data["id"]
    user.subscription_status = data.get("status")
    user.subscription_plan = {cfg["PADDLE_PRICE_MONTHLY"]: "monthly", cfg["PADDLE_PRICE_YEARLY"]: "yearly"}.get(price_id)
    user.subscription_period_end = _parse_time((data.get("current_billing_period") or {}).get("ends_at"))
    user.subscription_cancel_at = _parse_time(scheduled.get("effective_at")) if scheduled.get("action") == "cancel" else None
    user.subscription_updated_at = occurred_at
    await db().commit()


# Senza CSRF (vedi web.check_csrf): l'autenticità la garantisce la firma Paddle.
@bp.post("/paddle/webhook")
async def webhook():
    secret = current_app.config["PADDLE_WEBHOOK_SECRET"]
    raw = await request.get_data()
    if not secret or not verify_signature(raw, request.headers.get("Paddle-Signature", ""), secret):
        abort(401)
    event = json.loads(raw)
    if event.get("event_type", "").startswith("subscription."):
        await apply_subscription_event(event)
    return "", 200
