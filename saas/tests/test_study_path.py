from sqlalchemy import select

from app.courses import mindmap
from app.db import db
from app.models import AiJob, User

from .test_ai import NOTES, _lesson, _run_worker, ai_app  # noqa: F401  ai_app è una fixture
from .test_settings import _upload


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
    assert "Argomento simulato 1" in page and "2 argomenti · 3 domande" in page and "0%" in page
    page = await _path(db_client, course_id, lesson_id, topic=0)
    assert "Regola simulata." in page and "Primo passaggio." in page and "Ho capito, avanti" in page

    # "Ho capito": argomento studiato, poi il successivo; dopo l'ultimo si va al test.
    response = await db_client.post(f"{base}/path/0")
    assert response.headers["Location"].endswith("tab=path&topic=1")
    assert "Ho capito: mettiti alla prova" in await _path(db_client, course_id, lesson_id, topic=1)
    assert (await db_client.post(f"{base}/path/1")).headers["Location"].endswith("/exercises")
    assert (await db_client.post(f"{base}/path/2")).status_code == 404
    assert "Argomento simulato 1" in await _path(db_client, course_id, lesson_id, topic=9)  # fuori range: elenco

    # Test a crocette, una domanda alla volta: argomento 0 tutto giusto, argomento 1 con un errore.
    quiz = f"{base}/exercises"
    page = await (await db_client.get(quiz)).get_data(as_text=True)
    assert "Domanda simulata 1?" in page and "Domanda simulata 2?" not in page and "0/3" in page
    await db_client.post(quiz, form={"question": "es-1", "answer": "Giusta"})
    page = await (await db_client.get(f"{quiz}?checked=es-1")).get_data(as_text=True)
    assert "Corretto!" in page and "sempre la prima" in page and "Avanti" in page
    assert (await db_client.post(quiz, form={"question": "es-1", "answer": "Giusta"})).headers["Location"] == quiz  # doppio invio
    await db_client.post(quiz, form={"question": "es-2", "answer": "Sbagliata A"})
    # Risposte salvate: si riprende dalla domanda successiva.
    assert "Domanda simulata 3?" in await (await db_client.get(quiz)).get_data(as_text=True)
    await db_client.post(quiz, form={"question": "es-3", "answer": "Giusta"})
    assert "Vedi i risultati" in await (await db_client.get(f"{quiz}?checked=es-3")).get_data(as_text=True)
    page = await (await db_client.get(quiz)).get_data(as_text=True)
    assert "Risposte corrette: 2 su 3" in page
    assert page.index("Argomenti capiti") < page.index("Argomento simulato 1") < page.index("Da ripassare") < page.index("Argomento simulato 2")
    assert f"{base}?tab=path&amp;topic=1" in page  # "Rivedi la spiegazione"
    # "Rifai il test": risposte azzerate, l'ultimo risultato resta nei progressi.
    await db_client.post(quiz, form={"restart": "1"})
    assert "Domanda simulata 1?" in await (await db_client.get(quiz)).get_data(as_text=True)
    await db_client.post(quiz, form={"question": "es-1", "answer": "Giusta"})
    async with ai_app.app_context():
        job = await db().scalar(select(AiJob).where(AiJob.kind == "exercise_set"))
        assert job.progress["studied"] == [0, 1] and job.progress["last_result"] == {"correct": 2, "total": 3, "to_review": [1]}

    page = await _path(db_client, course_id, lesson_id)
    assert "100%" in page and "Ultimo test: 2 risposte corrette su 3" in page and "Da ripassare" in page

    # Il backup conserva percorso e progressi: reimportato, li ripristina.
    backup = await (await db_client.get("/settings/backup.json")).get_json()
    assert [w["kind"] for w in backup["webAiJobs"]] == ["exercise_set"]
    async with ai_app.app_context():
        (await db().scalar(select(AiJob).where(AiJob.kind == "exercise_set"))).progress = None
        await db().commit()
    assert "0%" in await _path(db_client, course_id, lesson_id)
    await _upload(db_client, backup)
    assert "100%" in await _path(db_client, course_id, lesson_id)
    backup["webAiJobs"][0]["result"]["exercises"] = []
    assert (await _upload(db_client, backup)).headers["Location"] == "/settings/"  # rifiutato, dati intatti
    assert "100%" in await _path(db_client, course_id, lesson_id)

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
