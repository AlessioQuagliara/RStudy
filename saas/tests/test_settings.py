import json
import uuid
from datetime import timedelta

from sqlalchemy import func, select

from app.extensions import db
from app.models import AiJob, Course, Flashcard, Lesson, User, utcnow

from .conftest import register

TS = "2026-08-25T20:01:29.374Z"


def _backup(course_id=None, lesson_id=None, notes="Puntatori e memoria"):
    course_id, lesson_id = course_id or str(uuid.uuid4()), lesson_id or str(uuid.uuid4())
    return {
        "version": 1,
        "exportedAt": TS,
        "courses": [{"id": course_id, "title": "Programmazione", "code": "PR1", "cfu": 9, "examDate": "2026-10-14",
                     "introduction": None, "objectives": None, "targetLessons": 28, "status": "active",
                     "color": "#8b5cf6", "createdAt": TS, "updatedAt": TS}],
        "lessons": [{"id": lesson_id, "courseId": course_id, "lessonNumber": 1, "title": "Puntatori",
                     "lessonDate": "2026-08-25", "status": "completed", "notesJson": "{}", "notesPlainText": notes,
                     "aiStatus": "completed", "createdAt": TS, "updatedAt": TS}],
        "materials": [],
        "flashcards": [{"id": str(uuid.uuid4()), "courseId": course_id, "lessonId": lesson_id, "front": "Cos'è un puntatore?",
                        "back": "Un indirizzo", "tagsJson": '["puntatori"]', "difficulty": "easy", "source": "ai",
                        "nextReviewAt": "2026-09-03T15:48:02.904Z", "reviewCount": 2, "createdAt": TS, "updatedAt": TS}],
        "lessonAiOutputs": [{"id": str(uuid.uuid4()), "lessonId": lesson_id, "summaryMarkdown": "Riepilogo",
                             "keyPointsJson": '[{"title": "Indirizzi", "explanation": "..."}]',
                             "studyOutlineJson": '[{"topic": "Puntatori", "subtopics": ["&", "*"]}]',
                             "mermaidDiagram": "graph TD; A-->B", "selfCheckQuestionsJson": '[{"question": "?", "answer": "!"}]',
                             "model": "deepseek-chat", "promptVersion": "v3", "createdAt": TS, "updatedAt": TS}],
        "courseAiOutputs": [{"id": str(uuid.uuid4())}],
    }


def _upload(client, data, name="backup.json"):
    body = data if isinstance(data, bytes) else json.dumps(data).encode()
    from io import BytesIO

    return client.post("/settings/backup", data={"backup": (BytesIO(body), name)}, content_type="multipart/form-data")


def test_import_desktop_backup_and_round_trip(db_app, db_client):
    register(db_client)
    backup = _backup()
    response = _upload(db_client, backup)
    assert response.headers["Location"] == "/settings/"
    page = db_client.get("/settings/").get_data(as_text=True)
    assert "Importati 1 corsi, 1 lezioni, 1 flashcard e 1 studi AI." in page
    assert "Non importati 0 materiali e 1 riassunti" in page

    lesson_id = backup["lessons"][0]["id"]
    lesson_page = db_client.get(f"/courses/{backup['courses'][0]['id']}/lessons/{lesson_id}?tab=ai").get_data(as_text=True)
    assert "Riepilogo" in lesson_page and "Indirizzi" in lesson_page

    with db_app.app_context():
        job = db.session.scalar(select(AiJob))
        assert job.status == "ready" and job.result["mermaid_diagram"] == "graph TD; A-->B"
        assert db.session.scalar(select(Flashcard)).review_count == 2

    # Reimportare lo stesso file aggiorna, non duplica.
    backup["lessons"][0]["title"] = "Puntatori (rivista)"
    _upload(db_client, backup)
    with db_app.app_context():
        assert db.session.scalar(select(func.count()).select_from(Lesson)) == 1
        assert db.session.scalar(select(Lesson.title)) == "Puntatori (rivista)"

    exported = db_client.get("/settings/backup.json")
    assert "attachment" in exported.headers["Content-Disposition"]
    data = exported.get_json()
    assert data["version"] == 1
    assert data["lessons"][0]["notesPlainText"] == "Puntatori e memoria"
    assert json.loads(data["lessons"][0]["notesJson"])["type"] == "doc"
    assert data["lessonAiOutputs"][0]["mermaidDiagram"] == "graph TD; A-->B"
    # Il file esportato si reimporta così com'è (stesso formato del desktop).
    assert "Importati 1 corsi" in db_client.get(_upload(db_client, data).headers["Location"]).get_data(as_text=True)


def test_import_cannot_touch_other_accounts(db_app):
    victim, attacker = db_app.test_client(), db_app.test_client()
    register(victim, email="victim@example.com")
    backup = _backup()
    _upload(victim, backup)

    register(attacker, email="attacker@example.com")
    backup["courses"][0]["title"] = "Rubato"
    response = _upload(attacker, backup)
    assert "appartengono a un altro account" in attacker.get(response.headers["Location"]).get_data(as_text=True)

    # Lezione nuova appesa al corso della vittima, senza includere il corso nel file.
    foreign = _backup(course_id=backup["courses"][0]["id"])
    foreign["courses"] = []
    response = _upload(attacker, foreign)
    assert "corsi o lezioni che non contiene" in attacker.get(response.headers["Location"]).get_data(as_text=True)
    with db_app.app_context():
        assert db.session.scalar(select(Course.title)) == "Programmazione"
        assert db.session.scalar(select(func.count()).select_from(Lesson)) == 1


def test_import_rejects_invalid_files(db_app, db_client):
    register(db_client)
    for body in (b"non json", json.dumps({"version": 2}).encode()):
        response = _upload(db_client, body)
        assert "non è un backup RStudy valido" in db_client.get(response.headers["Location"]).get_data(as_text=True)


def test_large_backup_passes_the_upload_limit(db_app, db_client):
    register(db_client)
    big = _backup(notes="x" * (3 * 1024 * 1024 // 2))  # ~1,5 MB, oltre il limite generale di 1 MB
    assert _upload(db_client, big).status_code == 302
    big_form = db_client.post("/courses/new", data={"title": "x" * (2 * 1024 * 1024)})
    assert big_form.status_code == 413  # il limite generale resta per il resto dell'app


def test_profile_update_and_export_after_trial(db_app, db_client):
    register(db_client)
    db_client.post("/settings/profile", data={"university": " Università di Torino ", "faculty": "Chimica"})
    with db_app.app_context():
        user = db.session.scalar(select(User))
        assert (user.university, user.faculty) == ("Università di Torino", "Chimica")
        user.trial_ends_at = utcnow() - timedelta(minutes=1)
        db.session.commit()
    assert db_client.get("/settings/").headers["Location"] == "/abbonamento"
    assert db_client.get("/settings/backup.json").status_code == 200
