import pytest
from sqlalchemy import func, select

from app.db import db
from app.models import CourseQuestion, DocumentChunk
from app.rag import chunk_text

from .conftest import register
from .test_courses import _create_course, _create_lesson
from .test_materials import _upload

NOTES = "Il teorema del confronto permette di calcolare un limite stringendo la funzione tra due funzioni.\n\nEsempio: sin(x)/x."


def test_chunk_text():
    assert chunk_text("  ") == []
    assert chunk_text("a\n\n\n b") == ["a\n\nb"]  # paragrafi piccoli: un solo passaggio
    parts = chunk_text("x" * 30 + "\n\n" + "y" * 30, target=40, overlap=5)
    assert parts == ["x" * 30, "xxxxx\n\n" + "y" * 30]  # ogni passaggio riprende la coda del precedente
    # Paragrafo più lungo del target: tagli di 40 caratteri che si sovrappongono di 10, fino alla fine del testo.
    text = "0123456789" * 10
    assert [p.split("\n\n")[-1] for p in chunk_text(text, target=40, overlap=10)] == [text[0:40], text[30:70], text[60:100]]


@pytest.fixture
def ai_app(db_app):
    db_app.config.update(AI_PROVIDER="fake", AI_DAILY_LIMIT=2)
    return db_app


async def _ask(client, course_id, question):
    response = await client.post(f"/courses/{course_id}/ask", form={"question": question})
    assert response.status_code == 302 and response.headers["Location"].endswith("tab=ask")
    return await (await client.get(response.headers["Location"])).get_data(as_text=True)


async def test_ask_course(ai_app, db_client):
    await register(db_client)
    course_id = await _create_course(db_client)
    page = await _ask(db_client, course_id, "Cos'è il teorema del confronto?")
    assert "non contiene ancora testo da consultare" in page

    lesson_id = await _create_lesson(db_client, course_id)
    form = {"title": "Limiti", "status": "draft", "lesson_date": "", "notes": NOTES}
    assert (await db_client.post(f"/courses/{course_id}/lessons/{lesson_id}", form=form)).status_code == 302
    await _upload(db_client, f"/courses/{course_id}/materials", ("Derivate.txt", b"La derivata misura la pendenza."), lesson_id=lesson_id)

    # "limiti" trova "limite": radici italiane di Postgres.
    page = await _ask(db_client, course_id, "Come si usano i limiti col confronto?")
    assert "[Simulato]" in page and "Fonte 1: Appunti — Lezione 1: Limiti" in page and "stringendo la funzione" in page
    page = await _ask(db_client, course_id, "Cosa misura la derivata?")
    assert "Derivate (Lezione 1: Limiti)" in page

    # Nessun passaggio pertinente: risposta senza modello, non conta nel limite.
    assert "informazioni sufficienti" in await _ask(db_client, course_id, "fotosintesi clorofilliana")
    async with ai_app.app_context():
        assert await db().scalar(select(func.count()).select_from(CourseQuestion)) == 2
    assert "limite giornaliero" in await _ask(db_client, course_id, "Cos'è un limite?")

    # Appunti risalvati: i passaggi vengono sostituiti, non duplicati. Eliminare la lezione li elimina.
    await db_client.post(f"/courses/{course_id}/lessons/{lesson_id}", form={**form, "notes": "Solo integrali."})
    async with ai_app.app_context():
        contents = list(await db().scalars(select(DocumentChunk.content).where(DocumentChunk.lesson_id.is_not(None))))
        assert contents == ["Solo integrali."]
    await db_client.post(f"/courses/{course_id}/lessons/{lesson_id}/delete")
    async with ai_app.app_context():
        assert await db().scalar(select(func.count()).select_from(DocumentChunk).where(DocumentChunk.lesson_id.is_not(None))) == 0


async def test_ask_validation_and_ownership(ai_app, db_client):
    await register(db_client)
    course_id = await _create_course(db_client)
    assert "Scrivi una domanda" in await _ask(db_client, course_id, "   ")
    assert "Scrivi una domanda" in await _ask(db_client, course_id, "x" * 2001)
    await db_client.post("/logout")
    await register(db_client, email="b@example.com")
    assert (await db_client.post(f"/courses/{course_id}/ask", form={"question": "ciao"})).status_code == 404
    assert (await db_client.get(f"/courses/{course_id}?tab=ask")).status_code == 404


async def test_ai_not_configured(db_app, db_client):
    db_app.config.update(AI_PROVIDER="")
    await register(db_client)
    course_id = await _create_course(db_client)
    lesson_id = await _create_lesson(db_client, course_id)
    await db_client.post(f"/courses/{course_id}/lessons/{lesson_id}", form={"title": "L", "status": "draft", "lesson_date": "", "notes": NOTES})
    assert "non è configurato" in await _ask(db_client, course_id, "teorema del confronto")
