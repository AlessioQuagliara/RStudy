import re
import uuid

from sqlalchemy import select

from app.db import db
from app.models import Course, Lesson

from .conftest import register

COURSE = {"title": "Analisi 1", "code": "MAT01", "cfu": "9", "exam_date": "2027-02-10", "status": "active", "color": "#14b8a6"}


async def _create_course(client, **overrides):
    response = await client.post("/courses/new", form={**COURSE, **overrides})
    assert response.status_code == 302, (await response.get_data(as_text=True))
    return response.headers["Location"].rsplit("/", 1)[-1]


async def _create_lesson(client, course_id, title="Limiti"):
    response = await client.post(f"/courses/{course_id}/lessons", form={"title": title})
    assert response.status_code == 302
    return response.headers["Location"].rsplit("/", 1)[-1]


async def test_course_lifecycle(db_app, db_client):
    await register(db_client)
    course_id = await _create_course(db_client)

    page = await (await db_client.get(f"/courses/{course_id}")).get_data(as_text=True)
    assert "Analisi 1" in page and "9 CFU" in page and "10 feb 2027" in page

    assert (await db_client.post(f"/courses/{course_id}/edit", form={**COURSE, "title": "Analisi 2"})).status_code == 302
    assert "Analisi 2" in (await (await db_client.get("/courses/")).get_data(as_text=True))
    assert "Analisi 2" in (await (await db_client.get("/dashboard")).get_data(as_text=True))  # dashboard: attività recenti

    assert (await db_client.post(f"/courses/{course_id}/delete")).status_code == 302
    async with db_app.app_context():
        assert (await db().scalar(select(Course))) is None


async def test_course_validation(db_client):
    await register(db_client)
    assert (await db_client.post("/courses/new", form={**COURSE, "title": "  "})).status_code == 400
    assert (await db_client.post("/courses/new", form={**COURSE, "cfu": "61"})).status_code == 400
    assert (await db_client.post("/courses/new", form={**COURSE, "status": "boh"})).status_code == 400
    assert (await db_client.post("/courses/new", form={**COURSE, "color": "red"})).status_code == 400
    response = await db_client.post("/courses/new", form={**COURSE, "exam_date": "2027-13-01"})
    assert response.status_code == 400
    assert 'value="Analisi 1"' in (await response.get_data(as_text=True))  # i valori inseriti restano nel form


async def test_course_list_filters(db_client):
    await register(db_client)
    await _create_course(db_client, title="Fisica")
    await _create_course(db_client, title="Chimica", status="archived")
    html = await (await db_client.get("/courses/?status=archived")).get_data(as_text=True)
    assert "Chimica" in html and "Fisica" not in html
    html = await (await db_client.get("/courses/?q=fis")).get_data(as_text=True)
    assert "Fisica" in html and "Chimica" not in html
    assert "Nessun corso corrisponde" in (await (await db_client.get("/courses/?q=%25")).get_data(as_text=True))


async def test_lessons_and_notes(db_app, db_client):
    await register(db_client)
    course_id = await _create_course(db_client)
    first = await _create_lesson(db_client, course_id, "Limiti")
    second = await _create_lesson(db_client, course_id, "Derivate")

    notes = "Teorema di <b>Rolle</b>\nriga 2"
    response = (await db_client.post(
        f"/courses/{course_id}/lessons/{first}",
        form={"title": "Limiti notevoli", "status": "completed", "lesson_date": "2026-10-01", "notes": notes},
    ))
    assert response.status_code == 302
    html = await (await db_client.get(f"/courses/{course_id}/lessons/{first}")).get_data(as_text=True)
    assert "Teorema di &lt;b&gt;Rolle&lt;/b&gt;" in html  # appunti escapati

    detail = await (await db_client.get(f"/courses/{course_id}?tab=lessons")).get_data(as_text=True)
    assert "Lezione 1: Limiti notevoli" in detail and "Lezione 2: Derivate" in detail
    assert re.search(r'value="50"', (await (await db_client.get(f"/courses/{course_id}")).get_data(as_text=True)))  # 1 su 2

    await db_client.post(f"/courses/{course_id}/lessons/{second}/delete")
    third = await _create_lesson(db_client, course_id, "Integrali")
    async with db_app.app_context():
        assert (await db().get(Lesson, uuid.UUID(third))).lesson_number == 2
        assert (await db().get(Lesson, uuid.UUID(first))).notes == notes


async def test_users_cannot_see_each_others_courses(db_client):
    await register(db_client, email="a@example.com")
    course_id = await _create_course(db_client, title="Segreto di A")
    lesson_id = await _create_lesson(db_client, course_id)
    await db_client.post("/logout")

    await register(db_client, email="b@example.com")
    assert "Segreto di A" not in (await (await db_client.get("/courses/")).get_data(as_text=True))
    for method, url in [
        ("get", f"/courses/{course_id}"),
        ("get", f"/courses/{course_id}/edit"),
        ("post", f"/courses/{course_id}/delete"),
        ("post", f"/courses/{course_id}/lessons"),
        ("get", f"/courses/{course_id}/lessons/{lesson_id}"),
        ("post", f"/courses/{course_id}/lessons/{lesson_id}/delete"),
    ]:
        assert (await getattr(db_client, method)(url, form={"title": "x"})).status_code == 404, url


async def test_course_pages_require_login(client):
    assert (await client.get("/courses/")).headers["Location"].startswith("/login")
