from sqlalchemy import select

from app.extensions import db
from app.models import AuthAttempt, User

from .conftest import TEST_DATABASE_URL, _set_env, login, register

PASSWORD = "password-sicura-1"


def test_register_logs_in_and_stores_only_a_hash(db_app, db_client):
    response = register(db_client, email="  Mario@Example.COM ")
    assert response.status_code == 302

    dashboard = db_client.get("/dashboard")
    assert dashboard.status_code == 200
    html = dashboard.get_data(as_text=True)
    assert "mario@example.com" in html
    assert 'class="drawer lg:drawer-open' in html

    with db_app.app_context():
        user = db.session.scalar(select(User))
        assert user.email == "mario@example.com"
        assert PASSWORD not in user.password_hash


def test_register_rejects_duplicate_email_case_insensitive(db_client):
    register(db_client)
    db_client.post("/logout")
    response = register(db_client, email="A@EXAMPLE.com")
    assert response.status_code == 400
    assert "Esiste già un account" in response.get_data(as_text=True)


def test_register_validates_password(db_client):
    assert register(db_client, password="corta").status_code == 400
    assert register(db_client, confirm="diversa-davvero").status_code == 400
    assert register(db_client, email="non-una-email").status_code == 400


def test_login_errors_do_not_reveal_whether_email_exists(db_client):
    register(db_client)
    db_client.post("/logout")
    wrong_password = login(db_client, password="password-sbagliata")
    unknown_email = login(db_client, email="nessuno@example.com")
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert "Email o password non corretti." in wrong_password.get_data(as_text=True)
    assert "Email o password non corretti." in unknown_email.get_data(as_text=True)


def test_login_and_logout(db_client):
    register(db_client)
    db_client.post("/logout")
    assert db_client.get("/dashboard").status_code == 302

    assert login(db_client, email="A@example.com").status_code == 302
    assert db_client.get("/dashboard").status_code == 200
    assert db_client.get("/").headers["Location"] == "/dashboard"

    assert db_client.get("/logout").status_code == 405  # solo POST
    assert db_client.post("/logout").headers["Location"] == "/"
    assert db_client.get("/dashboard").headers["Location"].startswith("/login")
    assert db_client.get("/").status_code == 200  # landing pubblica


def test_login_replaces_existing_session(db_client):
    register(db_client)
    db_client.post("/logout")
    with db_client.session_transaction() as sess:
        sess["planted"] = "valore-di-un-attaccante"
    login(db_client)
    with db_client.session_transaction() as sess:
        assert "planted" not in sess


def test_login_rate_limit_per_email(db_app, db_client):
    register(db_client)
    db_client.post("/logout")
    for _ in range(5):
        assert login(db_client, password="password-sbagliata").status_code == 401
    # Bloccato anche con la password giusta finché la finestra non scade.
    assert login(db_client).status_code == 429

    with db_app.app_context():
        stored = db.session.scalars(select(AuthAttempt.key_hash)).all()
    assert stored and all("example.com" not in k for k in stored)


def test_registration_rate_limit_per_ip(db_client):
    for i in range(5):
        register(db_client, email=f"u{i}@example.com", password="corta")
    assert register(db_client, email="u9@example.com").status_code == 429


def test_csrf_is_enforced(_migrated_db, monkeypatch):
    from app import create_app

    _set_env(monkeypatch, TEST_DATABASE_URL)
    client = create_app({"TESTING": True}).test_client()
    assert client.post("/login", data={"email": "a@example.com", "password": PASSWORD}).status_code == 400
