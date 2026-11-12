import os
from pathlib import Path
from urllib.parse import urlparse

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text

from app import create_app
from app.db import Base, Session, db

# Valori solo per i test, mai usati fuori da pytest.
TEST_SECRET_KEY = "test-only-secret-key"
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
ALEMBIC = Config(str(Path(__file__).parent.parent / "alembic.ini"))


def _set_env(monkeypatch, database_url):
    monkeypatch.setenv("SECRET_KEY", TEST_SECRET_KEY)
    monkeypatch.setenv("DATABASE_URL", database_url)


@pytest.fixture
def app(monkeypatch):
    """App senza database: nessuna connessione viene aperta finché un test non la usa."""
    _set_env(monkeypatch, "postgresql+psycopg://unused@127.0.0.1:1/unused_test")
    return create_app({"TESTING": True})


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture(scope="session")
def _migrated_db():
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL non impostata: test PostgreSQL NON eseguiti")
    # Protezione contro l'uso accidentale di un database vero.
    assert urlparse(TEST_DATABASE_URL).path.endswith("_test"), "TEST_DATABASE_URL deve puntare a un database *_test"
    mp = pytest.MonkeyPatch()
    _set_env(mp, TEST_DATABASE_URL)
    command.upgrade(ALEMBIC, "head")
    yield
    command.downgrade(ALEMBIC, "base")
    mp.undo()


@pytest.fixture
async def db_app(_migrated_db, monkeypatch):
    _set_env(monkeypatch, TEST_DATABASE_URL)
    # CSRF disattivato qui per leggibilità; un test dedicato lo verifica attivo.
    app = create_app({"TESTING": True, "CSRF_ENABLED": False})
    yield app
    async with app.app_context():
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        await db().execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        await db().commit()
    # Ogni test ha il suo event loop: le connessioni del pool non devono passare al test successivo.
    await Session.kw["bind"].dispose()


@pytest.fixture
def db_client(db_app):
    return db_app.test_client()


async def register(client, email="a@example.com", password="password-sicura-1", confirm=None, university="Politecnico di Milano", faculty="Ingegneria informatica"):
    return await client.post(
        "/register",
        form={
            "email": email,
            "password": password,
            "password_confirm": confirm if confirm is not None else password,
            "university": university,
            "faculty": faculty,
        },
    )


async def login(client, email="a@example.com", password="password-sicura-1"):
    return await client.post("/login", form={"email": email, "password": password})
