from sqlalchemy import select

from app.courses import mindmap
from app.db import db
from app.models import AiJob, User

from .test_ai import NOTES, _lesson, _run_worker, ai_app  # noqa: F401  ai_app è una fixture


def test_mindmap():
    code = mindmap("Lezione 1: Limiti (parte 1)", [{"topic": "Funzioni [reali]", "subtopics": ['"Dominio"', "a::b"]}, {"topic": "()", "subtopics": []}])
    assert code.split("\n") == [
        "mindmap",
        "  root((Lezione 1: Limiti parte 1))",
        "    Funzioni reali",
        "      Dominio",
        "      a:b",
        "    …",  # un nodo vuoto romperebbe la mappa
    ]


async def _path(client, course_id, lesson_id, **args):
    query = "&".join(f"{k}={v}" for k, v in {"tab": "path", **args}.items())
    return await (await client.get(f"/courses/{course_id}/lessons/{lesson_id}?{query}")).get_data(as_text=True)


async def test_study_path(ai_app, db_client):  # noqa: F811
    course_id, lesson_id = await _lesson(db_client)
    base = f"/courses/{course_id}/lessons/{lesson_id}"
    assert "Prepara il percorso di studio" in await _path(db_client, course_id, lesson_id)
    assert (await db_client.post(f"{base}/generate", form={"kind": "boh"})).status_code == 400

    # "Prepara percorso" dalla scheda Appunti salva e porta alla scheda del percorso.
    response = await db_client.post(base, form={**NOTES, "generate": "exercise_set"})
    assert response.headers["Location"].endswith("tab=path")
    assert "Percorso di studio: in coda" in await _path(db_client, course_id, lesson_id)
    await _run_worker(ai_app)

    page = await _path(db_client, course_id, lesson_id)
    assert "Argomento simulato 1" in page and "2 argomenti · 3 esercizi" in page and "0%" in page
    page = await _path(db_client, course_id, lesson_id, topic=0)
    assert "Regola simulata." in page and "Primo passaggio." in page and "Ho capito, avanti" in page

    # "Ho capito": argomento studiato, poi il successivo; dopo l'ultimo si va al test.
    response = await db_client.post(f"{base}/path/0")
    assert response.headers["Location"].endswith("tab=path&topic=1")
    assert "Ho capito: mettiti alla prova" in await _path(db_client, course_id, lesson_id, topic=1)
    assert (await db_client.post(f"{base}/path/1")).headers["Location"].endswith("/exercises")
    assert (await db_client.post(f"{base}/path/2")).status_code == 404
    assert "Argomento simulato 1" in await _path(db_client, course_id, lesson_id, topic=9)  # fuori range: elenco

    # Test: argomento 0 tutto giusto, argomento 1 con un errore.
    page = await (await db_client.post(f"{base}/exercises", form={"answer-es-1": "Giusta", "answer-es-2": "Sbagliata A", "answer-es-3": "prova"})).get_data(as_text=True)
    assert "Risposte corrette: 2 su 3" in page and "Concetto base" in page
    assert page.index("Argomenti capiti") < page.index("Argomento simulato 1") < page.index("Da ripassare") < page.index("Argomento simulato 2")
    assert f"{base}?tab=path&amp;topic=1" in page  # "Rivedi la spiegazione"
    async with ai_app.app_context():
        job = await db().scalar(select(AiJob).where(AiJob.kind == "exercise_set"))
        assert job.progress == {"studied": [0, 1], "last_result": {"correct": 2, "total": 3, "to_review": [1]}}

    page = await _path(db_client, course_id, lesson_id)
    assert "100%" in page and "Ultimo test: 2 risposte corrette su 3" in page and "Da ripassare" in page

    # Appunti cambiati: il percorso resta, con l'invito a prepararlo di nuovo.
    await db_client.post(base, form={**NOTES, "notes": "Appunti nuovi."})
    assert "Gli appunti sono cambiati" in await _path(db_client, course_id, lesson_id)


async def test_old_exercise_set_without_topics(ai_app, db_client):  # noqa: F811
    course_id, lesson_id = await _lesson(db_client)
    await db_client.post(f"/courses/{course_id}/lessons/{lesson_id}", form=NOTES)
    async with ai_app.app_context():
        db().add(AiJob(user_id=await db().scalar(select(User.id)), lesson_id=lesson_id, kind="exercise_set",
                       status="ready", source_hash="hash-v1", result={"title": "Vecchi esercizi", "exercises": []}))
        await db().commit()
    page = await _path(db_client, course_id, lesson_id)
    assert "versione precedente" in page and "Prepara il percorso di studio" in page
    # L'hash del set v1 non coincide con quello v2: si genera un percorso nuovo invece di riusare il vecchio.
    await db_client.post(f"/courses/{course_id}/lessons/{lesson_id}/generate", form={"kind": "exercise_set"})
    await _run_worker(ai_app)
    assert "Argomento simulato 1" in await _path(db_client, course_id, lesson_id)


async def test_maps_tab(ai_app, db_client):  # noqa: F811
    course_id, lesson_id = await _lesson(db_client)
    base = f"/courses/{course_id}/lessons/{lesson_id}"
    page = await (await db_client.get(f"{base}?tab=maps")).get_data(as_text=True)
    assert "Nessuno schema" in page and "Genera studio AI" in page

    await db_client.post(base, form=NOTES)
    assert (await db_client.post(f"{base}/generate", form={"kind": "study_pack"})).headers["Location"].endswith("tab=ai")
    await _run_worker(ai_app)
    response = await db_client.get(f"{base}?tab=maps")
    page = await response.get_data(as_text=True)
    assert "root((Lezione 1: Limiti))" in page and "A(Argomento simulato) --&gt; B(Concetto collegato)" in page
    assert "mermaid.min.js" in page and "Sotto-argomento" in page
    # Stili inline permessi solo qui, per gli SVG di Mermaid; gli script restano limitati a 'self'.
    assert "style-src 'self' 'unsafe-inline'; script-src 'self';" in response.headers["Content-Security-Policy"]
    other = await db_client.get(f"{base}?tab=ai")
    assert "unsafe-inline" not in other.headers["Content-Security-Policy"]
    assert "mermaid.min.js" not in await other.get_data(as_text=True)
