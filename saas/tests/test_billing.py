import hashlib
import hmac
import json
import time
from datetime import timedelta

from sqlalchemy import select

from app.billing import verify_signature
from app.extensions import db
from app.models import User, utcnow

from .conftest import TEST_DATABASE_URL, _set_env, register

SECRET = "pdl_ntfset_test_secret"


def _sign(body: bytes, secret=SECRET, ts=None) -> str:
    ts = str(int(ts or time.time()))
    return f"ts={ts};h1=" + hmac.new(secret.encode(), ts.encode() + b":" + body, hashlib.sha256).hexdigest()


def test_signature_verification():
    body = b'{"event_type":"subscription.created"}'
    assert verify_signature(body, _sign(body), SECRET)
    assert verify_signature(body, _sign(body) + ";h1=deadbeef", SECRET)  # rotazione: basta un h1 valido
    assert not verify_signature(body + b" ", _sign(body), SECRET)  # corpo alterato
    assert not verify_signature(body, _sign(body, secret="altro"), SECRET)
    assert not verify_signature(body, _sign(body, ts=time.time() - 3600), SECRET)  # replay
    assert not verify_signature(body, "", SECRET)


def test_webhook_rejects_unsigned(client):
    assert client.post("/paddle/webhook", data=b"{}").status_code == 401


def _billing_app(monkeypatch):
    from app import create_app

    _set_env(monkeypatch, TEST_DATABASE_URL)
    for name, value in {
        "PADDLE_ENVIRONMENT": "sandbox",
        "PADDLE_CLIENT_TOKEN": "test_token",
        "PADDLE_API_KEY": "test_key",
        "PADDLE_WEBHOOK_SECRET": SECRET,
        "PADDLE_PRICE_MONTHLY": "pri_monthly",
        "PADDLE_PRICE_YEARLY": "pri_yearly",
    }.items():
        monkeypatch.setenv(name, value)
    return create_app({"TESTING": True, "WTF_CSRF_ENABLED": False})


def _event(user_id, status="active", occurred_at="2026-10-18T10:00:00.000000Z", event_type="subscription.updated", **data):
    return {
        "event_id": "evt_1",
        "event_type": event_type,
        "occurred_at": occurred_at,
        "data": {
            "id": "sub_1",
            "status": status,
            "customer_id": "ctm_1",
            "custom_data": {"user_id": str(user_id)},
            "items": [{"price": {"id": "pri_yearly"}}],
            "current_billing_period": {"starts_at": "2026-10-18T10:00:00Z", "ends_at": "2027-10-18T10:00:00Z"},
            "scheduled_change": None,
            **data,
        },
    }


def _post(client, event):
    body = json.dumps(event).encode()
    return client.post("/paddle/webhook", data=body, headers={"Paddle-Signature": _sign(body)})


def test_registration_requires_university_and_faculty(db_app, db_client):
    response = register(db_client, university="  ", faculty="Medicina")
    assert response.status_code == 400
    assert "Indica università e facoltà." in response.get_data(as_text=True)

    assert register(db_client, university="  Università  di   Pisa ", faculty="Fisica").status_code == 302
    with db_app.app_context():
        user = db.session.scalar(select(User))
        assert (user.university, user.faculty) == ("Università di Pisa", "Fisica")
        assert user.trial_days_left == 15 and user.has_access


def test_university_suggestions_need_three_users(db_app, db_client):
    for i in range(3):
        register(db_app.test_client(), email=f"u{i}@example.com", university="Università di Bologna")
    register(db_app.test_client(), email="solo@example.com", university="Ateneo segreto")
    html = db_client.get("/register").get_data(as_text=True)
    assert '<option value="Università di Bologna">' in html
    assert "Ateneo segreto" not in html


def test_expired_trial_locks_app_but_not_billing(db_app, db_client):
    register(db_client)
    with db_app.app_context():
        db.session.scalar(select(User)).trial_ends_at = utcnow() - timedelta(minutes=1)
        db.session.commit()
    for path in ("/dashboard", "/courses/", "/flashcards/"):
        assert db_client.get(path).headers["Location"] == "/abbonamento"
    page = db_client.get("/abbonamento")
    assert page.status_code == 200
    assert "La prova gratuita è terminata" in page.get_data(as_text=True)
    assert db_client.post("/logout").status_code == 302


def test_webhook_activates_and_orders_events(db_app, monkeypatch):
    app = _billing_app(monkeypatch)
    client = app.test_client()
    register(client)
    with app.app_context():
        user = db.session.scalar(select(User))
        user.trial_ends_at = utcnow() - timedelta(days=1)
        db.session.commit()
        user_id = user.id
    assert client.get("/dashboard").status_code == 302

    assert _post(client, _event(user_id, event_type="subscription.created")).status_code == 200
    assert client.get("/dashboard").status_code == 200
    page = client.get("/abbonamento").get_data(as_text=True)
    assert "Piano annuale" in page and "18 ott 2027" in page

    # Disdetta a fine periodo: l'accesso resta.
    cancel = {"action": "cancel", "effective_at": "2027-10-18T10:00:00Z"}
    _post(client, _event(user_id, occurred_at="2026-10-19T10:00:00Z", scheduled_change=cancel))
    assert "resta attivo fino al 18 ott 2027" in client.get("/abbonamento").get_data(as_text=True)

    # Un evento più vecchio consegnato in ritardo non torna indietro.
    _post(client, _event(user_id, status="canceled", occurred_at="2026-10-17T10:00:00Z"))
    assert client.get("/dashboard").status_code == 200

    _post(client, _event(user_id, status="canceled", occurred_at="2026-10-20T10:00:00Z", current_billing_period=None))
    assert client.get("/dashboard").headers["Location"] == "/abbonamento"


def test_second_subscription_does_not_replace_active_one(db_app, monkeypatch):
    app = _billing_app(monkeypatch)
    client = app.test_client()
    register(client)
    with app.app_context():
        user_id = db.session.scalar(select(User.id))
    _post(client, _event(user_id))
    _post(client, _event(user_id, id="sub_2", status="canceled", occurred_at="2026-10-19T10:00:00Z"))
    with app.app_context():
        user = db.session.get(User, user_id)
        assert (user.paddle_subscription_id, user.subscription_status) == ("sub_1", "active")


def test_checkout_page_allows_paddle_only_there(db_app, monkeypatch):
    app = _billing_app(monkeypatch)
    client = app.test_client()
    register(client)
    billing = client.get("/abbonamento")
    assert "https://cdn.paddle.com" in billing.headers["Content-Security-Policy"]
    assert 'data-price-id="pri_monthly"' in billing.get_data(as_text=True)
    assert "paddle.com" not in client.get("/dashboard").headers["Content-Security-Policy"]
