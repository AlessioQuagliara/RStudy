from sqlalchemy import select

from app.db import db
from app.models import AuthAttempt, User

from .conftest import TEST_DATABASE_URL, _set_env, login, register

PASSWORD = "password-sicura-1"


async def test_register_logs_in_and_stores_only_a_hash(db_app, db_client):
    response = await register(db_client, email="  Mario@Example.COM ")
    assert response.status_code == 302

    dashboard = await db_client.get("/dashboard")
    assert dashboard.status_code == 200
    html = await dashboard.get_data(as_text=True)
    assert "mario@example.com" in html
    assert 'class="drawer lg:drawer-open' in html

    async with db_app.app_context():
        user = await db().scalar(select(User))
        assert user.email == "mario@example.com"
        assert PASSWORD not in user.password_hash


async def test_register_rejects_duplicate_email_case_insensitive(db_client):
    await register(db_client)
    await db_client.post("/logout")
    response = await register(db_client, email="A@EXAMPLE.com")
    assert response.status_code == 400
    assert "Esiste già un account" in (await response.get_data(as_text=True))


async def test_register_validates_password(db_client):
    assert (await register(db_client, password="corta")).status_code == 400
    assert (await register(db_client, confirm="diversa-davvero")).status_code == 400
    assert (await register(db_client, email="non-una-email")).status_code == 400


async def test_login_errors_do_not_reveal_whether_email_exists(db_client):
    await register(db_client)
    await db_client.post("/logout")
    wrong_password = await login(db_client, password="password-sbagliata")
    unknown_email = await login(db_client, email="nessuno@example.com")
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert "Email o password non corretti." in (await wrong_password.get_data(as_text=True))
    assert "Email o password non corretti." in (await unknown_email.get_data(as_text=True))


async def test_login_and_logout(db_client):
    await register(db_client)
    await db_client.post("/logout")
    assert (await db_client.get("/dashboard")).status_code == 302

    assert (await login(db_client, email="A@example.com")).status_code == 302
    assert (await db_client.get("/dashboard")).status_code == 200
    assert (await db_client.get("/")).headers["Location"] == "/dashboard"

    assert (await db_client.get("/logout")).status_code == 405  # solo POST
    assert (await db_client.post("/logout")).headers["Location"] == "/"
    assert (await db_client.get("/dashboard")).headers["Location"].startswith("/login")
    assert (await db_client.get("/")).status_code == 200  # landing pubblica


async def test_login_replaces_existing_session(db_client):
    await register(db_client)
    await db_client.post("/logout")
    async with db_client.session_transaction() as sess:
        sess["planted"] = "valore-di-un-attaccante"
    await login(db_client)
    async with db_client.session_transaction() as sess:
        assert "planted" not in sess


async def test_login_rate_limit_per_email(db_app, db_client):
    await register(db_client)
    await db_client.post("/logout")
    for _ in range(5):
        assert (await login(db_client, password="password-sbagliata")).status_code == 401
    # Bloccato anche con la password giusta finché la finestra non scade.
    assert (await login(db_client)).status_code == 429

    async with db_app.app_context():
        stored = (await db().scalars(select(AuthAttempt.key_hash))).all()
    assert stored and all("example.com" not in k for k in stored)


async def test_registration_rate_limit_per_ip(db_client):
    for i in range(5):
        await register(db_client, email=f"u{i}@example.com", password="corta")
    assert (await register(db_client, email="u9@example.com")).status_code == 429


async def test_csrf_is_enforced(_migrated_db, monkeypatch):
    from app import create_app

    _set_env(monkeypatch, TEST_DATABASE_URL)
    client = create_app({"TESTING": True}).test_client()
    assert (await client.post("/login", form={"email": "a@example.com", "password": PASSWORD})).status_code == 400
