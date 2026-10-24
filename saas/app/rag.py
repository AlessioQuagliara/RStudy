""""Chiedi al corso": porting di ragService.ts e chunker.ts del desktop.

Il testo di materiali e appunti è diviso in passaggi (document_chunks). Una domanda cerca i passaggi più
pertinenti del corso con la ricerca full-text di Postgres in italiano e li passa al modello, che risponde citandoli.
Il desktop usa un "embedding" a hash delle parole, cioè anch'esso una ricerca per parole chiave: qui la fa Postgres,
con in più la riduzione delle parole alla radice (limite, limiti, limitato).

La risposta arriva nella richiesta stessa (chiamata in un thread), non dal worker: è testo breve, senza JSON da validare.
"""

import asyncio
import re

from quart import current_app
from sqlalchemy import Text, cast, delete, func, select
from sqlalchemy.dialects.postgresql import TSQUERY

from . import ai
from .ai import prompts
from .db import db
from .models import CourseQuestion, DocumentChunk, Lesson, Material

TARGET_CHARS = 3200  # ~ 700-900 token, come il desktop
OVERLAP_CHARS = 500
TOP_K = 6
EXCERPT_CHARS = 400


def chunk_text(text: str, target: int = TARGET_CHARS, overlap: int = OVERLAP_CHARS) -> list[str]:
    """Passaggi di circa `target` caratteri, spezzati sui paragrafi, ognuno con la coda del precedente."""
    clean = re.sub(r"\s+", lambda m: "\n\n" if "\n\n" in m.group() else " ", text).strip()
    chunks, buffer = [], ""
    for paragraph in filter(None, clean.split("\n\n")):
        if len(buffer) + 2 + len(paragraph) <= target:
            buffer = f"{buffer}\n\n{paragraph}" if buffer else paragraph
            continue
        if buffer:
            chunks.append(buffer)
        buffer = paragraph
        if len(paragraph) > target:
            # Paragrafo troppo lungo: tagli di lunghezza fissa, già sovrapposti tra loro.
            starts = range(0, len(paragraph) - overlap, target - overlap)
            chunks.extend(paragraph[s : s + target].strip() for s in starts)
            buffer = ""
    if buffer:
        chunks.append(buffer)
    return [chunks[0], *(f"{prev[-overlap:]}\n\n{cur}" for prev, cur in zip(chunks, chunks[1:]))] if chunks else []


def _lesson_label(lesson: Lesson) -> str:
    return f"Lezione {lesson.lesson_number}: {lesson.title}"


async def index_lesson_notes(lesson: Lesson) -> None:
    """Sostituisce i passaggi degli appunti della lezione: da chiamare a ogni salvataggio (non fa commit)."""
    await db().execute(delete(DocumentChunk).where(DocumentChunk.lesson_id == lesson.id))
    label = f"Appunti — {_lesson_label(lesson)}"
    db().add_all(
        DocumentChunk(course_id=lesson.course_id, lesson_id=lesson.id, source_label=label, content=c)
        for c in chunk_text(lesson.notes)
    )


async def index_material(material: Material) -> None:
    """Sostituisce i passaggi del materiale (non fa commit). Il materiale deve avere già l'id."""
    await db().execute(delete(DocumentChunk).where(DocumentChunk.material_id == material.id))
    label = material.title
    if material.lesson_id and (lesson := await db().get(Lesson, material.lesson_id)):
        label = f"{material.title} ({_lesson_label(lesson)})"
    db().add_all(
        DocumentChunk(course_id=material.course_id, material_id=material.id, source_label=label[:500], content=c)
        for c in chunk_text(material.extracted_text or "")
    )


async def search(course_id, question: str) -> list[DocumentChunk]:
    # plainto_tsquery mette in AND tutte le parole: in OR, una domanda in linguaggio naturale trova i passaggi
    # che ne contengono almeno una, ordinati per pertinenza.
    query = cast(func.replace(cast(func.plainto_tsquery("italian", question), Text), "&", "|"), TSQUERY)
    rows = await db().scalars(
        select(DocumentChunk)
        .where(DocumentChunk.course_id == course_id, DocumentChunk.tsv.op("@@")(query))
        .order_by(func.ts_rank(DocumentChunk.tsv, query).desc(), DocumentChunk.id)
        .limit(TOP_K)
    )
    return list(rows)


class NoContext(ai.AiError):
    """Nessun passaggio utile: si risponde senza chiamare il modello e senza consumare il limite."""


async def ask(user, course, question: str) -> CourseQuestion:
    if not await db().scalar(select(DocumentChunk.id).where(DocumentChunk.course_id == course.id).limit(1)):
        raise NoContext(
            "Il corso non contiene ancora testo da consultare: importa dei materiali o scrivi gli appunti delle lezioni."
        )
    chunks = await search(course.id, question)
    if not chunks:
        raise NoContext("Il materiale caricato non contiene informazioni sufficienti per rispondere a questa domanda.")
    if current_app.config["AI_PROVIDER"] not in ("openai", "fake"):
        raise ai.AiError("Il servizio AI non è configurato.")
    if await ai.used_today(user.id) >= current_app.config["AI_DAILY_LIMIT"]:
        raise ai.AiError("Hai raggiunto il limite giornaliero di richieste AI. Si azzera a mezzanotte.")
    context = "\n\n---\n\n".join(f"[Fonte {i}: {c.source_label}]\n{c.content}" for i, c in enumerate(chunks, 1))
    citations = [{"source_label": c.source_label, "excerpt": c.content[:EXCERPT_CHARS]} for c in chunks]
    # Nessuna transazione aperta durante la chiamata, che può durare a lungo (come process_next).
    await db().commit()
    answer = await asyncio.to_thread(ai.chat, prompts.COURSE_CHAT_SYSTEM, prompts.course_chat_user(question, context), False)
    entry = CourseQuestion(
        user_id=user.id, course_id=course.id, question=question, answer=answer.strip(), citations=citations,
        model=ai.provider_label(),
    )
    db().add(entry)
    await db().commit()
    return entry
