import uuid
from datetime import timedelta

from sqlalchemy import select

from app.extensions import db
from app.models import Flashcard, utcnow

from .conftest import register
from .test_courses import _create_course

CARD = {"front": "Cos'è un limite?", "back": "Il valore a cui tende f(x)", "tags": "analisi, limiti", "difficulty": "hard"}


def _create_card(client, course_id, **overrides):
    response = client.post(f"/flashcards/new?course={course_id}", data={**CARD, **overrides})
    assert response.status_code == 302, response.get_data(as_text=True)


def test_crud_and_course_tab(db_app, db_client):
    register(db_client)
    course_id = _create_course(db_client)
    _create_card(db_client, course_id)
    tab = db_client.get(f"/courses/{course_id}?tab=flashcards").get_data(as_text=True)
    assert "Cos&#39;è un limite?" in tab and "analisi" in tab

    with db_app.app_context():
        card = db.session.scalar(select(Flashcard))
        assert card.tags == ["analisi", "limiti"] and card.source == "manual"
        card_id = card.id

    db_client.post(f"/flashcards/{card_id}/edit", data={**CARD, "front": "Nuovo fronte"})
    db_client.post(f"/flashcards/{card_id}/duplicate")
    assert db_client.get("/flashcards/").get_data(as_text=True).count("Nuovo fronte") == 2
    db_client.post(f"/flashcards/{card_id}/delete", data={"next": "https://evil.example/"})
    with db_app.app_context():
        assert db.session.scalar(select(db.func.count()).select_from(Flashcard)) == 1


def test_validation_and_filters(db_client):
    register(db_client)
    course_id = _create_course(db_client)
    assert db_client.post(f"/flashcards/new?course={course_id}", data={**CARD, "front": " "}).status_code == 400
    assert db_client.post(f"/flashcards/new?course={course_id}", data={**CARD, "difficulty": "x"}).status_code == 400
    _create_card(db_client, course_id, front="Facile uno", difficulty="easy", tags="algebra")
    _create_card(db_client, course_id, front="Difficile due")
    html = db_client.get("/flashcards/?difficulty=easy").get_data(as_text=True)
    assert "Facile uno" in html and "Difficile due" not in html
    html = db_client.get("/flashcards/?tag=LIM").get_data(as_text=True)
    assert "Difficile due" in html and "Facile uno" not in html


def test_redirect_after_delete_stays_internal(db_app, db_client):
    register(db_client)
    course_id = _create_course(db_client)
    _create_card(db_client, course_id)
    with db_app.app_context():
        card_id = db.session.scalar(select(Flashcard.id))
    for evil in ("https://evil.example/", "//evil.example/", "/\\evil.example"):
        db_client.post(f"/flashcards/{card_id}/duplicate", data={"next": evil})
    response = db_client.post(f"/flashcards/{card_id}/delete", data={"next": "//evil.example/"})
    assert response.headers["Location"] == f"/courses/{course_id}?tab=flashcards"


def test_study_session_schedules_reviews(db_app, db_client):
    register(db_client)
    course_id = _create_course(db_client)
    _create_card(db_client, course_id, front="Prima")
    _create_card(db_client, course_id, front="Seconda")
    with db_app.app_context():
        future = db.session.scalar(select(Flashcard).where(Flashcard.front == "Seconda"))
        future.next_review_at = utcnow() + timedelta(days=2)
        db.session.commit()

    assert ">1</div>" in db_client.get("/dashboard").get_data(as_text=True)  # dashboard: 1 da ripassare
    study = db_client.get("/flashcards/study").get_data(as_text=True)
    assert "Prima" in study and "Seconda" not in study
    with db_app.app_context():
        card_id = db.session.scalar(select(Flashcard.id).where(Flashcard.front == "Prima"))
    assert db_client.post(f"/flashcards/{card_id}/review", data={"grade": "bogus"}).status_code == 400
    db_client.post(f"/flashcards/{card_id}/review", data={"grade": "easy"})
    assert "Ripasso completato" in db_client.get("/flashcards/study").get_data(as_text=True)
    with db_app.app_context():
        card = db.session.get(Flashcard, card_id)
        assert card.review_count == 1
        assert timedelta(days=6) < card.next_review_at - utcnow() <= timedelta(days=7)


def test_flashcards_are_private(db_app, db_client):
    register(db_client)
    course_id = _create_course(db_client)
    _create_card(db_client, course_id, front="Segreta")
    with db_app.app_context():
        card_id = db.session.scalar(select(Flashcard.id))
    db_client.post("/logout")
    register(db_client, email="b@example.com")
    assert "Segreta" not in db_client.get("/flashcards/").get_data(as_text=True)
    assert "Segreta" not in db_client.get("/flashcards/study").get_data(as_text=True)
    assert db_client.post(f"/flashcards/new?course={course_id}", data=CARD).status_code == 404
    for path in ("edit", "duplicate", "delete", "review"):
        assert db_client.post(f"/flashcards/{card_id}/{path}", data={"grade": "easy"}).status_code == 404
    assert db_client.get(f"/flashcards/new?course={uuid.uuid4()}").status_code == 404


def test_pagination_keeps_filters_and_clamps(db_app, db_client):
    from app.courses import PER_PAGE

    register(db_client)
    course_id = _create_course(db_client)
    with db_app.app_context():
        db.session.add_all(
            Flashcard(course_id=uuid.UUID(course_id), front=f"Carta {i:03d}", back="r", tags=["50%_off" if i == 0 else "x"],
                      difficulty="easy", source="manual", review_count=0)
            for i in range(PER_PAGE + 5)
        )
        db.session.commit()

    first = db_client.get("/flashcards/?difficulty=easy").get_data(as_text=True)
    assert first.count('aria-label="Modifica flashcard"') == PER_PAGE
    assert "1–30 di 35" in first
    assert "/flashcards/?difficulty=easy&amp;page=2" in first

    second = db_client.get("/flashcards/?difficulty=easy&page=2").get_data(as_text=True)
    assert second.count('aria-label="Modifica flashcard"') == 5
    # Oltre l'ultima pagina: mostra l'ultima, non una lista vuota.
    assert db_client.get("/flashcards/?page=99").get_data(as_text=True).count('aria-label="Modifica flashcard"') == 5

    tab = db_client.get(f"/courses/{course_id}?tab=flashcards&page=2").get_data(as_text=True)
    assert tab.count('aria-label="Modifica flashcard"') == 5
    assert f"/courses/{course_id}?tab=flashcards&amp;page=1" in tab

    # % e _ nel filtro tag sono testo, non jolly.
    assert db_client.get("/flashcards/?tag=50%25_").get_data(as_text=True).count('aria-label="Modifica flashcard"') == 1
    assert db_client.get("/flashcards/?tag=%25").get_data(as_text=True).count('aria-label="Modifica flashcard"') == 1
