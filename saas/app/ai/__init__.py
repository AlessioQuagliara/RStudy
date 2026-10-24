"""Generazione AI lato server: client OpenAI-compatibile, coda in Postgres e worker.

Le richieste web accodano soltanto (enqueue); le chiamate al provider, che possono durare minuti,
le fa il processo `quart ai-worker`, così il server web non resta occupato.
"""

import asyncio
import hashlib
import json
import logging
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from quart import current_app
from pydantic import BaseModel, ValidationError
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError

from ..db import db
from ..models import AiJob, CourseQuestion, Flashcard, Lesson, utcnow
from . import prompts
from .schemas import ExerciseSet, StudyPack

log = logging.getLogger(__name__)

ROME = ZoneInfo("Europe/Rome")
# Il percorso di studio con un reasoning model richiede 1-3 minuti: sotto i 120 s andava in timeout.
REQUEST_TIMEOUT_S = 300
# I modelli cloud sono reasoning model: i token di ragionamento si sommano alla risposta (vedi factory.ts del desktop).
# 12.000 come il desktop troncava il percorso di studio (finish_reason=length, verificato con deepseek-v4-pro):
# si pagano solo i token usati, quindi il minimo alto non costa nulla quando la risposta è breve.
MIN_MAX_TOKENS = 32_000
STALE_AFTER = timedelta(minutes=15)

KINDS: dict[str, tuple[str, type[BaseModel], callable]] = {
    "study_pack": (prompts.STUDY_PACK_SYSTEM, StudyPack, prompts.study_pack_user),
    "exercise_set": (prompts.EXERCISE_SET_SYSTEM, ExerciseSet, prompts.exercise_set_user),
}


class AiError(Exception):
    """Errore con messaggio già sicuro da mostrare all'utente."""


# Versione dello schema nell'hash, come il desktop: un risultato di una versione precedente non viene riusato
# (esercizi senza percorso di studio, studi AI senza diagramma).
SCHEMA_VERSIONS = {"study_pack": 2, "exercise_set": 2}


def source_hash(lesson: Lesson, kind: str = "study_pack") -> str:
    # Spazi normalizzati: riformattare gli appunti non invalida la cache.
    version = f"v{SCHEMA_VERSIONS[kind]}\n" if kind in SCHEMA_VERSIONS else ""
    return hashlib.sha256((version + " ".join(lesson.notes.split())).encode()).hexdigest()


def today_start() -> datetime:
    """Mezzanotte di oggi a Roma: il limite giornaliero si azzera lì, come cloudUsageService.ts."""
    now = datetime.now(ROME)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


async def used_today(user_id) -> int:
    """Generazioni e domande al corso di oggi: condividono lo stesso limite, come le chiamate cloud del desktop."""
    since = today_start()
    jobs = await db().scalar(select(func.count()).select_from(AiJob).where(AiJob.user_id == user_id, AiJob.created_at >= since))
    questions = await db().scalar(
        select(func.count()).select_from(CourseQuestion).where(CourseQuestion.user_id == user_id, CourseQuestion.created_at >= since)
    )
    return jobs + questions


# ---------- provider ----------


def _openai_chat(system: str, user: str, json_mode: bool = True) -> str:
    cfg = current_app.config
    body = json.dumps(
        {
            "model": cfg["AI_MODEL"],
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0.3,
            "max_tokens": max(cfg["AI_MAX_TOKENS"], MIN_MAX_TOKENS),
            "stream": False,
            **({"response_format": {"type": "json_object"}} if json_mode else {}),
        }
    ).encode()
    req = urllib.request.Request(
        cfg["AI_BASE_URL"].rstrip("/") + "/chat/completions",
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {cfg['AI_API_KEY']}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as e:
        log.warning("provider AI: HTTP %s", e.code)
        if e.code == 429:
            raise AiError("Il servizio AI è sovraccarico. Riprova tra qualche minuto.") from None
        raise AiError("Il servizio AI non è disponibile in questo momento.") from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        log.warning("provider AI irraggiungibile: %s", type(e).__name__)
        raise AiError("Il servizio AI non ha risposto in tempo. Riprova.") from None
    choice = (data.get("choices") or [{}])[0]
    content = (choice.get("message") or {}).get("content") or ""
    if choice.get("finish_reason") == "length":
        log.warning("provider AI: risposta troncata (finish_reason=length)")
    if not content.strip():
        raise AiError("Il servizio AI ha restituito una risposta vuota.")
    return content


def _fake_chat(system: str, user: str) -> str:
    """Provider simulato per sviluppo e test: risposte fisse e valide, indicate come tali nell'interfaccia."""
    if system == prompts.COURSE_CHAT_SYSTEM:
        return "[Simulato] Risposta generata senza un modello AI reale, basata su [Fonte 1]."
    if system == prompts.STUDY_PACK_SYSTEM:
        return json.dumps(
            {
                "summary_markdown": "[Simulato] Riassunto generato senza un modello AI reale.",
                "key_points": [{"title": "Punto chiave", "explanation": "Spiegazione simulata."}],
                "study_outline": [{"topic": "Argomento", "subtopics": ["Sotto-argomento"]}],
                "mermaid_diagram": "flowchart TB\n  A(Argomento simulato) --> B(Concetto collegato)",
                "flashcards": [
                    {"front": f"Domanda simulata {i}", "back": f"Risposta simulata {i}", "tags": ["simulato"], "difficulty": "medium"}
                    for i in (1, 2, 3)
                ],
                "self_check_questions": [{"question": "Domanda di autoverifica?", "answer": "Risposta."}],
            }
        )
    return json.dumps(
        {
            "title": "[Simulato] Percorso di prova",
            "missingInfo": [],
            "topics": [
                {"title": f"Argomento simulato {i + 1}", "explanation": "Spiegazione simulata.", "keyRule": "Regola simulata.",
                 "example": {"problem": "Esempio simulato.", "steps": ["Primo passaggio.", "Risultato."]}}
                for i in (0, 1)
            ],
            "exercises": [
                {"type": "multiple_choice", "id": f"es-{i}", "stage": "concetto", "topicIndex": i - 1, "question": f"Domanda simulata {i}?",
                 "options": ["Giusta", "Sbagliata A", "Sbagliata B", "Sbagliata C"], "correctAnswer": "Giusta",
                 "explanation": "La risposta giusta è sempre la prima nel provider simulato.", "difficulty": i}
                for i in (1, 2)
            ]
            + [{"type": "open_answer", "id": "es-3", "stage": "collegamento", "topicIndex": 1,
                "question": "Scrivi la parola: prova", "acceptedAnswers": ["prova"],
                "explanation": "Risposta attesa: prova.", "difficulty": 3}],
        }
    )


def provider_label() -> str | None:
    return {"openai": current_app.config["AI_MODEL"], "fake": "simulato"}.get(current_app.config["AI_PROVIDER"])


def chat(system: str, user: str, json_mode: bool = True) -> str:
    provider = current_app.config["AI_PROVIDER"]
    if provider == "openai":
        return _openai_chat(system, user, json_mode)
    if provider == "fake":
        return _fake_chat(system, user)
    raise AiError("Il servizio AI non è configurato.")


def parse_model_json(raw: str, schema: type[BaseModel]) -> BaseModel:
    """Come parseModelJson del desktop: tollera ```json e testo attorno all'oggetto."""
    text = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    start, end = text.find("{"), text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return schema.model_validate_json(text)


def generate(kind: str, user: str) -> BaseModel:
    """Un tentativo più una riparazione mostrando al modello l'errore di validazione, come il desktop."""
    system, schema, _ = KINDS[kind]
    raw = chat(system, user)
    try:
        return parse_model_json(raw, schema)
    except ValidationError as e:
        log.info("%s: risposta non valida, ritento con riparazione", kind)
        raw = chat(system, user + "\n\n" + prompts.repair(raw, str(e)[:2000]))
    try:
        return parse_model_json(raw, schema)
    except ValidationError:
        raise AiError("La risposta dell'AI non era nel formato atteso. Riprova.") from None


# ---------- coda ----------


async def latest_jobs(lesson: Lesson) -> dict[str, AiJob]:
    jobs = (await db().scalars(select(AiJob).where(AiJob.lesson_id == lesson.id).order_by(AiJob.created_at))).all()
    return {job.kind: job for job in jobs}


async def enqueue(user, lesson: Lesson, kind: str) -> AiJob:
    """Accoda una generazione, o restituisce quella attiva / quella già pronta per gli stessi appunti."""
    if not lesson.notes.strip():
        raise AiError("Aggiungi prima degli appunti alla lezione: servono per generare.")
    if current_app.config["AI_PROVIDER"] not in ("openai", "fake"):
        raise AiError("Il servizio AI non è configurato.")
    digest = source_hash(lesson, kind)
    existing = await db().scalar(
        select(AiJob)
        .where(AiJob.lesson_id == lesson.id, AiJob.kind == kind)
        .where((AiJob.status.in_(("queued", "running"))) | ((AiJob.status == "ready") & (AiJob.source_hash == digest)))
        .order_by(AiJob.created_at.desc())
        .limit(1)
    )
    if existing:
        return existing
    if await used_today(user.id) >= current_app.config["AI_DAILY_LIMIT"]:
        raise AiError("Hai raggiunto il limite giornaliero di generazioni AI. Si azzera a mezzanotte.")
    job = AiJob(user_id=user.id, lesson_id=lesson.id, kind=kind, status="queued", source_hash=digest)
    db().add(job)
    try:
        await db().commit()
    except IntegrityError:
        # Due richieste contemporanee: l'indice unico parziale ne lascia passare una sola.
        await db().rollback()
        return await db().scalar(select(AiJob).where(AiJob.lesson_id == lesson.id, AiJob.kind == kind, AiJob.status.in_(("queued", "running"))))
    return job


async def _claim() -> AiJob | None:
    job = await db().scalar(
        select(AiJob).where(AiJob.status == "queued").order_by(AiJob.created_at).limit(1).with_for_update(skip_locked=True)
    )
    if job:
        job.status = "running"
        await db().commit()
    return job


async def _store_result(job: AiJob, course_id, lesson_id, result: BaseModel) -> None:
    job.result = result.model_dump()
    if job.kind == "study_pack":
        # Le flashcard AI mai ripassate della lezione vengono sostituite, quelle già studiate restano.
        await db().execute(
            delete(Flashcard).where(Flashcard.lesson_id == lesson_id, Flashcard.source == "ai", Flashcard.review_count == 0)
        )
        db().add_all(
            Flashcard(course_id=course_id, lesson_id=lesson_id, front=f.front[:1000], back=f.back[:2000],
                      tags=f.tags, difficulty=f.difficulty, source="ai")
            for f in result.flashcards
        )


async def process_next() -> bool:
    """Esegue un job in coda. False se la coda è vuota."""
    job = await _claim()
    if job is None:
        return False
    lesson = await db().get(Lesson, job.lesson_id)
    try:
        if lesson is None:
            raise AiError("La lezione è stata eliminata.")
        course_id, lesson_id = lesson.course_id, lesson.id
        user_prompt = KINDS[job.kind][2](lesson.course, lesson)
        # Chiude la transazione: la chiamata al provider può durare minuti e non deve tenere lock o connessioni.
        await db().commit()
        # Chiamata HTTP bloccante (urllib): in un thread, il contesto dell'app viene copiato.
        result = await asyncio.to_thread(generate, job.kind, user_prompt)
        if await db().get(Lesson, lesson_id, populate_existing=True) is None:
            return True  # lezione eliminata nel frattempo: anche il job è stato cancellato a cascata
        await _store_result(job, course_id, lesson_id, result)
        job.status, job.model = "ready", provider_label()
    except AiError as e:
        await db().rollback()
        job.status, job.error = "failed", str(e)
    except Exception:
        log.exception("job AI %s fallito", job.id)
        await db().rollback()
        job.status, job.error = "failed", "Si è verificato un errore imprevisto."
    await db().commit()
    return True


async def fail_stale_jobs() -> int:
    """Job rimasti 'running' dopo un crash del worker: segnati falliti così l'utente può riprovare."""
    res = await db().execute(
        update(AiJob)
        .where(AiJob.status == "running", AiJob.updated_at < utcnow() - STALE_AFTER)
        .values(status="failed", error="Generazione interrotta. Riprova.", updated_at=utcnow())
    )
    await db().commit()
    return res.rowcount


async def run_worker(app, idle_sleep: float = 1.0) -> None:
    log.info("worker AI avviato (provider=%s)", app.config["AI_PROVIDER"] or "nessuno")
    last_sweep = 0.0
    loop = asyncio.get_running_loop()
    while True:
        # Un app context (e quindi una sessione del database) nuovo per ogni giro.
        async with app.app_context():
            try:
                if loop.time() - last_sweep > 60:
                    await fail_stale_jobs()
                    last_sweep = loop.time()
                busy = await process_next()
            except Exception:
                log.exception("errore del worker AI")
                busy = False
        if not busy:
            await asyncio.sleep(idle_sleep)
