import uuid
from datetime import timedelta

from sqlalchemy import func, select

from app.db import db
from app.models import Flashcard, utcnow

from .conftest import register
from .test_courses import _create_course

CARD = {"front": "Cos'è un limite?", "back": "Il valore a cui tende f(x)", "tags": "analisi, limiti", "difficulty": "hard"}


async def _create_card(client, course_id, **overrides):
    response = await client.post(f"/flashcards/new?course={course_id}", form={**CARD, **overrides})
    assert response.status_code == 302, (await response.get_data(as_text=True))


async def test_crud_and_course_tab(db_app, db_client):
    await register(db_client)
    course_id = await _create_course(db_client)
    await _create_card(db_client, course_id)
    tab = await (await db_client.get(f"/courses/{course_id}?tab=flashcards")).get_data(as_text=True)
    assert "Cos&#39;è un limite?" in tab and "analisi" in tab

    async with db_app.app_context():
        card = await db().scalar(select(Flashcard))
        assert card.tags == ["analisi", "limiti"] and card.source == "manual"
        card_id = card.id

    await db_client.post(f"/flashcards/{card_id}/edit", form={**CARD, "front": "Nuovo fronte"})
    await db_client.post(f"/flashcards/{card_id}/duplicate")
    assert (await (await db_client.get("/flashcards/")).get_data(as_text=True)).count("Nuovo fronte") == 2
    await db_client.post(f"/flashcards/{card_id}/delete", form={"next": "https://evil.example/"})
    async with db_app.app_context():
        assert (await db().scalar(select(func.count()).select_from(Flashcard))) == 1


async def test_validation_and_filters(db_client):
    await register(db_client)
    course_id = await _create_course(db_client)
    assert (await db_client.post(f"/flashcards/new?course={course_id}", form={**CARD, "front": " "})).status_code == 400
    assert (await db_client.post(f"/flashcards/new?course={course_id}", form={**CARD, "difficulty": "x"})).status_code == 400
    await _create_card(db_client, course_id, front="Facile uno", difficulty="easy", tags="algebra")
    await _create_card(db_client, course_id, front="Difficile due")
    html = await (await db_client.get("/flashcards/?difficulty=easy")).get_data(as_text=True)
    assert "Facile uno" in html and "Difficile due" not in html
    html = await (await db_client.get("/flashcards/?tag=LIM")).get_data(as_text=True)
    assert "Difficile due" in html and "Facile uno" not in html


async def test_redirect_after_delete_stays_internal(db_app, db_client):
    await register(db_client)
    course_id = await _create_course(db_client)
    await _create_card(db_client, course_id)
    async with db_app.app_context():
        card_id = await db().scalar(select(Flashcard.id))
    for evil in ("https://evil.example/", "//evil.example/", "/\\evil.example"):
        await db_client.post(f"/flashcards/{card_id}/duplicate", form={"next": evil})
    response = await db_client.post(f"/flashcards/{card_id}/delete", form={"next": "//evil.example/"})
    assert response.headers["Location"] == f"/courses/{course_id}?tab=flashcards"


async def test_study_session_schedules_reviews(db_app, db_client):
    await register(db_client)
    course_id = await _create_course(db_client)
    await _create_card(db_client, course_id, front="Prima")
    await _create_card(db_client, course_id, front="Seconda")
    async with db_app.app_context():
        future = await db().scalar(select(Flashcard).where(Flashcard.front == "Seconda"))
        future.next_review_at = utcnow() + timedelta(days=2)
        await db().commit()

    assert ">1</div>" in (await (await db_client.get("/dashboard")).get_data(as_text=True))  # dashboard: 1 da ripassare
    study = await (await db_client.get("/flashcards/study")).get_data(as_text=True)
    assert "Prima" in study and "Seconda" not in study
    async with db_app.app_context():
        card_id = await db().scalar(select(Flashcard.id).where(Flashcard.front == "Prima"))
    assert (await db_client.post(f"/flashcards/{card_id}/review", form={"grade": "bogus"})).status_code == 400
    await db_client.post(f"/flashcards/{card_id}/review", form={"grade": "easy"})
    assert "Ripasso completato" in (await (await db_client.get("/flashcards/study")).get_data(as_text=True))
    async with db_app.app_context():
        card = await db().get(Flashcard, card_id)
        assert card.review_count == 1
        assert timedelta(days=6) < card.next_review_at - utcnow() <= timedelta(days=7)


async def test_flashcards_are_private(db_app, db_client):
    await register(db_client)
    course_id = await _create_course(db_client)
    await _create_card(db_client, course_id, front="Segreta")
    async with db_app.app_context():
        card_id = await db().scalar(select(Flashcard.id))
    await db_client.post("/logout")
    await register(db_client, email="b@example.com")
    assert "Segreta" not in (await (await db_client.get("/flashcards/")).get_data(as_text=True))
    assert "Segreta" not in (await (await db_client.get("/flashcards/study")).get_data(as_text=True))
    assert (await db_client.post(f"/flashcards/new?course={course_id}", form=CARD)).status_code == 404
    for path in ("edit", "duplicate", "delete", "review"):
        assert (await db_client.post(f"/flashcards/{card_id}/{path}", form={"grade": "easy"})).status_code == 404
    assert (await db_client.get(f"/flashcards/new?course={uuid.uuid4()}")).status_code == 404


async def test_pagination_keeps_filters_and_clamps(db_app, db_client):
    from app.web import PER_PAGE

    await register(db_client)
    course_id = await _create_course(db_client)
    async with db_app.app_context():
        db().add_all(
            Flashcard(course_id=uuid.UUID(course_id), front=f"Carta {i:03d}", back="r", tags=["50%_off" if i == 0 else "x"],
                      difficulty="easy", source="manual", review_count=0)
            for i in range(PER_PAGE + 5)
        )
        await db().commit()

    first = await (await db_client.get("/flashcards/?difficulty=easy")).get_data(as_text=True)
    assert first.count('aria-label="Modifica flashcard"') == PER_PAGE
    assert "1–30 di 35" in first
    assert "/flashcards/?difficulty=easy&amp;page=2" in first

    second = await (await db_client.get("/flashcards/?difficulty=easy&page=2")).get_data(as_text=True)
    assert second.count('aria-label="Modifica flashcard"') == 5
    # Oltre l'ultima pagina: mostra l'ultima, non una lista vuota.
    assert (await (await db_client.get("/flashcards/?page=99")).get_data(as_text=True)).count('aria-label="Modifica flashcard"') == 5

    tab = await (await db_client.get(f"/courses/{course_id}?tab=flashcards&page=2")).get_data(as_text=True)
    assert tab.count('aria-label="Modifica flashcard"') == 5
    assert f"/courses/{course_id}?tab=flashcards&amp;page=1" in tab

    # % e _ nel filtro tag sono testo, non jolly.
    assert (await (await db_client.get("/flashcards/?tag=50%25_")).get_data(as_text=True)).count('aria-label="Modifica flashcard"') == 1
    assert (await (await db_client.get("/flashcards/?tag=%25")).get_data(as_text=True)).count('aria-label="Modifica flashcard"') == 1
