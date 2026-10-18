"""Prompt portati da studyforge/electron/ai/prompts.ts (PROMPT_VERSION 1.2.0), senza Mermaid e senza esercizi di codice."""

MAX_SOURCE_CHARS = 12_000
TRUNCATED_NOTE = (
    "[Nota: gli appunti sono stati troncati per lunghezza eccessiva; alcuni argomenti finali potrebbero non "
    "essere coperti. Non inventare per compensare la parte mancante.]"
)

STUDY_PACK_SYSTEM = """Sei un assistente didattico che aiuta uno studente universitario italiano a studiare in modo attivo.
Genera SOLO contenuto basato sugli appunti e sul contesto forniti: non inventare concetti assenti dal testo.
Se gli appunti sono insufficienti, dichiaralo esplicitamente nel campo summary_markdown e riduci la quantità di contenuto generato invece di allucinare.
Scrivi in italiano chiaro, tecnico quando necessario.
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, con questa forma esatta:
{
  "summary_markdown": "string",
  "key_points": [{"title": "string", "explanation": "string"}],
  "study_outline": [{"topic": "string", "subtopics": ["string"]}],
  "flashcards": [{"front": "string", "back": "string", "tags": ["string"], "difficulty": "easy|medium|hard"}],
  "self_check_questions": [{"question": "string", "answer": "string"}]
}
Regole per flashcards: produci da 8 a 20 flashcard atomiche, brevi, utili al ripasso attivo, senza duplicati.
Regole per self_check_questions: ogni domanda deve avere una risposta."""

EXERCISE_SET_SYSTEM = """Sei un assistente didattico che crea esercizi di ripasso per uno studente universitario, con progressione della difficoltà in stile apprendimento a gradini (come Duolingo): dal più semplice al più impegnativo.
Usa ESCLUSIVAMENTE i concetti presenti nel testo fornito dall'utente: non introdurre argomenti, fatti, esempi o codice che non siano deducibili da esso. Se il testo è scarno, genera comunque il numero di esercizi richiesto ma mantienili semplici e aderenti al poco materiale disponibile, senza inventare per compensare.
Ordina gli esercizi per difficoltà crescente (difficulty da 1 a 5, il primo esercizio deve avere difficulty bassa).
Per ogni esercizio "multiple_choice" fornisci esattamente 4 opzioni plausibili e chiaramente distinte tra loro (nessun duplicato, nessuna ambiguità), di cui una sola corretta: correctAnswer deve corrispondere ESATTAMENTE, carattere per carattere, al testo di una delle opzioni.
Per "open_answer" fornisci in acceptedAnswers risposte brevi (una parola o poche parole), perché vengono confrontate in modo esatto con quella dello studente.
Non generare né includere markup HTML, Markdown o LaTeX in nessun campo: solo testo semplice.
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, senza blocchi di codice markdown, con questa forma esatta:
{
  "title": "string",
  "exercises": [
    { "type": "multiple_choice", "id": "string", "question": "string", "options": ["string","string","string","string"], "correctAnswer": "string", "explanation": "string", "difficulty": 1 },
    { "type": "open_answer", "id": "string", "question": "string", "acceptedAnswers": ["string"], "explanation": "string", "difficulty": 1 }
  ]
}
Ogni "id" deve essere unico all'interno dell'array (usa uno slug breve, es. "es-1", "es-2")."""


def truncate(text: str) -> tuple[str, bool]:
    """Taglio deterministico al confine di paragrafo, come truncateSourceTextForPrompt."""
    if len(text) <= MAX_SOURCE_CHARS:
        return text, False
    cut = text[:MAX_SOURCE_CHARS]
    boundary = cut.rfind("\n\n")
    return cut[: boundary if boundary > MAX_SOURCE_CHARS * 0.5 else len(cut)].rstrip(), True


def study_pack_user(course, lesson) -> str:
    notes, truncated = truncate(lesson.notes)
    parts = [
        f"Corso: {course.title}",
        f"Introduzione al corso: {course.introduction}" if course.introduction else None,
        f"Lezione {lesson.lesson_number}: {lesson.title}",
        f"Appunti della lezione:\n{notes or '(nessun appunto testuale presente)'}",
        TRUNCATED_NOTE if truncated else None,
        "Genera lo study pack in italiano seguendo esattamente lo schema JSON richiesto.",
    ]
    return "\n\n".join(p for p in parts if p)


def exercise_set_user(course, lesson, count: int = 6) -> str:
    notes, truncated = truncate(lesson.notes)
    parts = [
        f"Materia/contesto del corso: {course.title}",
        f"Genera esattamente {count} esercizi (tra 3 e 8), variando i tipi disponibili quando il contenuto lo consente.",
        f"Appunti della lezione:\n{notes or '(nessun appunto testuale presente)'}",
        TRUNCATED_NOTE if truncated else None,
        "Scrivi tutto il contenuto (domande, risposte, spiegazioni, titoli) in italiano.",
        "Genera il set di esercizi in formato JSON seguendo esattamente lo schema richiesto.",
    ]
    return "\n\n".join(p for p in parts if p)


def repair(previous_raw: str, error: str) -> str:
    return (
        f"La tua risposta precedente non è stata accettata per questo motivo:\n{error}\n\n"
        f"Ecco la tua risposta precedente:\n{previous_raw}\n\n"
        "Correggi ESCLUSIVAMENTE il problema indicato, mantenendo invariato il resto del contenuto. "
        "Rispondi di nuovo con l'intero oggetto JSON corretto, conforme allo schema richiesto, senza testo prima o dopo."
    )
