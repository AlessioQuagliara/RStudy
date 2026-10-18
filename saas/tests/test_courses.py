import re
import uuid

from sqlalchemy import select

from app.extensions import db
from app.models import Course, Lesson

from .conftest import register

COURSE = {"title": "Analisi 1", "code": "MAT01", "cfu": "9", "exam_date": "2027-02-10", "status": "active", "color": "#14b8a6"}


def _create_course(client, **overrides):
    response = client.post("/courses/new", data={**COURSE, **overrides})
    assert response.status_code == 302, response.get_data(as_text=True)
    return response.headers["Location"].rsplit("/", 1)[-1]


def _create_lesson(client, course_id, title="Limiti"):
    response = client.post(f"/courses/{course_id}/lessons", data={"title": title})
    assert response.status_code == 302
    return response.headers["Location"].rsplit("/", 1)[-1]


def test_course_lifecycle(db_app, db_client):
    register(db_client)
    course_id = _create_course(db_client)

    page = db_client.get(f"/courses/{course_id}").get_data(as_text=True)
    assert "Analisi 1" in page and "9 CFU" in page and "10 feb 2027" in page

    assert db_client.post(f"/courses/{course_id}/edit", data={**COURSE, "title": "Analisi 2"}).status_code == 302
    assert "Analisi 2" in db_client.get("/courses/").get_data(as_text=True)
    assert "Analisi 2" in db_client.get("/dashboard").get_data(as_text=True)  # dashboard: attività recenti

    assert db_client.post(f"/courses/{course_id}/delete").status_code == 302
    with db_app.app_context():
        assert db.session.scalar(select(Course)) is None


def test_course_validation(db_client):
    register(db_client)
    assert db_client.post("/courses/new", data={**COURSE, "title": "  "}).status_code == 400
    assert db_client.post("/courses/new", data={**COURSE, "cfu": "61"}).status_code == 400
    assert db_client.post("/courses/new", data={**COURSE, "status": "boh"}).status_code == 400
    assert db_client.post("/courses/new", data={**COURSE, "color": "red"}).status_code == 400
    response = db_client.post("/courses/new", data={**COURSE, "exam_date": "2027-13-01"})
    assert response.status_code == 400
    assert 'value="Analisi 1"' in response.get_data(as_text=True)  # i valori inseriti restano nel form


def test_course_list_filters(db_client):
    register(db_client)
    _create_course(db_client, title="Fisica")
    _create_course(db_client, title="Chimica", status="archived")
    html = db_client.get("/courses/?status=archived").get_data(as_text=True)
    assert "Chimica" in html and "Fisica" not in html
    html = db_client.get("/courses/?q=fis").get_data(as_text=True)
    assert "Fisica" in html and "Chimica" not in html
    assert "Nessun corso corrisponde" in db_client.get("/courses/?q=%25").get_data(as_text=True)


def test_lessons_and_notes(db_app, db_client):
    register(db_client)
    course_id = _create_course(db_client)
    first = _create_lesson(db_client, course_id, "Limiti")
    second = _create_lesson(db_client, course_id, "Derivate")

    notes = "Teorema di <b>Rolle</b>\nriga 2"
    response = db_client.post(
        f"/courses/{course_id}/lessons/{first}",
        data={"title": "Limiti notevoli", "status": "completed", "lesson_date": "2026-10-01", "notes": notes},
    )
    assert response.status_code == 302
    html = db_client.get(f"/courses/{course_id}/lessons/{first}").get_data(as_text=True)
    assert "Teorema di &lt;b&gt;Rolle&lt;/b&gt;" in html  # appunti escapati

    detail = db_client.get(f"/courses/{course_id}?tab=lessons").get_data(as_text=True)
    assert "Lezione 1: Limiti notevoli" in detail and "Lezione 2: Derivate" in detail
    assert re.search(r'value="50"', db_client.get(f"/courses/{course_id}").get_data(as_text=True))  # 1 su 2

    db_client.post(f"/courses/{course_id}/lessons/{second}/delete")
    third = _create_lesson(db_client, course_id, "Integrali")
    with db_app.app_context():
        assert db.session.get(Lesson, uuid.UUID(third)).lesson_number == 2
        assert db.session.get(Lesson, uuid.UUID(first)).notes == notes


def test_users_cannot_see_each_others_courses(db_client):
    register(db_client, email="a@example.com")
    course_id = _create_course(db_client, title="Segreto di A")
    lesson_id = _create_lesson(db_client, course_id)
    db_client.post("/logout")

    register(db_client, email="b@example.com")
    assert "Segreto di A" not in db_client.get("/courses/").get_data(as_text=True)
    for method, url in [
        ("get", f"/courses/{course_id}"),
        ("get", f"/courses/{course_id}/edit"),
        ("post", f"/courses/{course_id}/delete"),
        ("post", f"/courses/{course_id}/lessons"),
        ("get", f"/courses/{course_id}/lessons/{lesson_id}"),
        ("post", f"/courses/{course_id}/lessons/{lesson_id}/delete"),
    ]:
        assert getattr(db_client, method)(url, data={"title": "x"}).status_code == 404, url


def test_course_pages_require_login(client):
    assert client.get("/courses/").headers["Location"].startswith("/login")
