import json
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app import ai
from app.ai.schemas import ExerciseSet, is_open_answer_correct
from app.db import db
from app.models import AiJob, Flashcard, utcnow

from .conftest import register
from .test_courses import _create_course, _create_lesson

NOTES = {"title": "Limiti", "status": "draft", "lesson_date": "", "notes": "Il limite di una funzione..."}


@pytest.fixture
def ai_app(db_app):
    db_app.config.update(AI_PROVIDER="fake", AI_DAILY_LIMIT=3)
    return db_app


async def _lesson(client):
    await register(client)
    course_id = await _create_course(client)
    return course_id, (await _create_lesson(client, course_id))


async def _generate(client, course_id, lesson_id, kind, **form):
    return await client.post(f"/courses/{course_id}/lessons/{lesson_id}", form={**NOTES, **form, "generate": kind})


async def _run_worker(app):
    async with app.app_context():
        while await ai.process_next():
            pass


async def test_study_pack_end_to_end(ai_app):
    client = ai_app.test_client()
    course_id, lesson_id = await _lesson(client)

    response = await _generate(client, course_id, lesson_id, "study_pack")
    assert response.headers["Location"].endswith("tab=ai")
    pending = await (await client.get(response.headers["Location"])).get_data(as_text=True)
    assert 'http-equiv="refresh"' in pending and "in coda" in pending

    await _run_worker(ai_app)
    page = await (await client.get(f"/courses/{course_id}/lessons/{lesson_id}?tab=ai")).get_data(as_text=True)
    assert "[Simulato] Riassunto" in page and "Modello: simulato" in page
    assert 'http-equiv="refresh"' not in page
    async with ai_app.app_context():
        assert len((await db().scalars(select(Flashcard))).all()) == 3


async def test_same_notes_reuse_result_and_regeneration_keeps_reviewed_cards(ai_app):
    client = ai_app.test_client()
    course_id, lesson_id = await _lesson(client)
    await _generate(client, course_id, lesson_id, "study_pack")
    await _run_worker(ai_app)

    response = await _generate(client, course_id, lesson_id, "study_pack")
    assert "già generato" in (await (await client.get(response.headers["Location"])).get_data(as_text=True)).lower()
    async with ai_app.app_context():
        assert (await db().scalar(select(func.count()).select_from(AiJob))) == 1
        card = (await db().scalars(select(Flashcard))).first()
        card.review_count = 1
        await db().commit()

    await _generate(client, course_id, lesson_id, "study_pack", notes="Appunti cambiati")
    await _run_worker(ai_app)
    async with ai_app.app_context():
        assert (await db().scalar(select(func.count()).select_from(Flashcard))) == 4  # 1 ripassata + 3 nuove


async def test_exercises_are_graded_on_server(ai_app):
    client = ai_app.test_client()
    course_id, lesson_id = await _lesson(client)
    await _generate(client, course_id, lesson_id, "exercise_set")
    await _run_worker(ai_app)

    url = f"/courses/{course_id}/lessons/{lesson_id}/exercises"
    assert "Domanda simulata 1?" in (await (await client.get(url)).get_data(as_text=True))
    html = await (await client.post(url, form={"answer-es-1": "Giusta", "answer-es-2": "Sbagliata A", "answer-es-3": "  PROVA "})).get_data(as_text=True)
    assert "Risposte corrette: 2 su 3" in html


async def test_daily_limit_and_empty_notes(ai_app):
    client = ai_app.test_client()
    course_id, lesson_id = await _lesson(client)
    response = await _generate(client, course_id, lesson_id, "study_pack", notes="   ")
    assert "Aggiungi prima degli appunti" in (await (await client.get(response.headers["Location"])).get_data(as_text=True))

    for i in range(3):
        await _generate(client, course_id, lesson_id, "study_pack", notes=f"versione {i}")
        await _run_worker(ai_app)
    response = await _generate(client, course_id, lesson_id, "study_pack", notes="versione 4")
    assert "limite giornaliero" in (await (await client.get(response.headers["Location"])).get_data(as_text=True))


async def test_ai_disabled_hides_buttons(db_client):
    await register(db_client)
    course_id = await _create_course(db_client)
    lesson_id = await _create_lesson(db_client, course_id)
    assert 'value="study_pack"' not in (await (await db_client.get(f"/courses/{course_id}/lessons/{lesson_id}")).get_data(as_text=True))
    assert "non è configurato" in (await (await db_client.get(f"/courses/{course_id}/lessons/{lesson_id}?tab=ai")).get_data(as_text=True))


async def test_invalid_model_output_is_repaired_once(ai_app, monkeypatch):
    good = ai._fake_chat(ai.prompts.EXERCISE_SET_SYSTEM, "")
    bad = json.loads(good)
    bad["exercises"][0]["correctAnswer"] = "Non tra le opzioni"
    calls = []

    def fake(system, user):
        calls.append(user)
        return "```json\n" + json.dumps(bad) + "\n```" if len(calls) == 1 else good

    monkeypatch.setattr(ai, "chat", fake)
    async with ai_app.app_context():
        result = ai.generate("exercise_set", "prompt")
    assert isinstance(result, ExerciseSet) and len(calls) == 2
    assert "correctAnswer deve essere una delle opzioni" in calls[1]


async def test_provider_failure_is_stored_as_safe_message(ai_app, monkeypatch):
    client = ai_app.test_client()
    course_id, lesson_id = await _lesson(client)
    await _generate(client, course_id, lesson_id, "study_pack")

    def boom(system, user):
        raise RuntimeError("segreto interno sk-123")

    monkeypatch.setattr(ai, "chat", boom)
    await _run_worker(ai_app)
    page = await (await client.get(f"/courses/{course_id}/lessons/{lesson_id}?tab=ai")).get_data(as_text=True)
    assert "errore imprevisto" in page and "sk-123" not in page


async def test_stale_running_jobs_are_failed(ai_app):
    client = ai_app.test_client()
    course_id, lesson_id = await _lesson(client)
    await _generate(client, course_id, lesson_id, "study_pack")
    async with ai_app.app_context():
        job = await db().scalar(select(AiJob))
        job.status, job.updated_at = "running", utcnow() - timedelta(hours=1)
        await db().commit()
        assert (await ai.fail_stale_jobs()) == 1


async def test_exercises_of_other_users_are_hidden(ai_app):
    client = ai_app.test_client()
    course_id, lesson_id = await _lesson(client)
    await client.post("/logout")
    await register(client, email="b@example.com")
    assert (await client.get(f"/courses/{course_id}/lessons/{lesson_id}/exercises")).status_code == 404
    assert (await _generate(client, course_id, lesson_id, "study_pack")).status_code == 404


async def test_open_answer_matching():
    assert is_open_answer_correct("  Il  Limite ", ["il limite"])
    assert not is_open_answer_correct("   ", ["", " "])


async def test_openai_provider_requires_credentials(monkeypatch):
    from app.config import ConfigError, load_config

    monkeypatch.setenv("SECRET_KEY", "x")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u@h/db")
    monkeypatch.setenv("AI_PROVIDER", "openai")
    with pytest.raises(ConfigError, match="AI_BASE_URL"):
        load_config()


async def test_openai_client_request_and_errors(app):
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    seen = {}

    class Handler(BaseHTTPRequestHandler):
        status = 200

        def do_POST(self):
            seen["path"], seen["auth"] = self.path, self.headers["Authorization"]
            seen["body"] = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            self.send_response(Handler.status)
            self.end_headers()
            self.wfile.write(json.dumps({"choices": [{"message": {"content": '{"ok": 1}'}}]}).encode())

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    app.config.update(AI_PROVIDER="openai", AI_BASE_URL=f"http://127.0.0.1:{server.server_port}/v1/", AI_MODEL="m", AI_API_KEY="k", AI_MAX_TOKENS=4096)
    try:
        async with app.app_context():
            assert ai.chat("sys", "usr") == '{"ok": 1}'
            assert seen["path"] == "/v1/chat/completions" and seen["auth"] == "Bearer k"
            assert seen["body"]["max_tokens"] == ai.MIN_MAX_TOKENS
            assert seen["body"]["response_format"] == {"type": "json_object"}
            ai.chat("sys", "usr", json_mode=False)  # "Chiedi al corso": risposta in testo libero
            assert "response_format" not in seen["body"]
            Handler.status = 429
            with pytest.raises(ai.AiError, match="sovraccarico"):
                ai.chat("sys", "usr")
    finally:
        server.shutdown()
