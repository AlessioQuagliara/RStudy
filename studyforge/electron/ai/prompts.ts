export const PROMPT_VERSION = "1.1.0";

const MERMAID_SYNTAX_RULES = `Regole per mermaid_diagram (fondamentale, causa errori di rendering se non rispettate):
- Codice Mermaid puro e valido, preferisci "mindmap" o "flowchart TD".
- SENZA blocchi markdown (niente \`\`\`) attorno.
- NON usare mai i caratteri < > (es. per notazioni tipo "<tipo> * <nome>"): in Mermaid vengono interpretati come tag HTML e rompono il parsing. Se devi indicare un tipo generico usa parole o parentesi tonde, es. "puntatore a tipo".
- Evita parentesi quadre [ ], graffe { } e virgolette " dentro i testi dei nodi (hanno significato speciale in Mermaid); usa solo lettere, numeri, spazi e punteggiatura semplice (. , : -).
- Ogni riga di un nodo mindmap deve avere un'indentazione coerente (2 spazi per livello) e testo breve (poche parole).`;

export const LESSON_STUDY_PACK_SYSTEM_PROMPT = `Sei un assistente didattico che aiuta uno studente universitario italiano a studiare in modo attivo.
Genera SOLO contenuto basato sugli appunti e sul contesto forniti: non inventare concetti assenti dal testo.
Se gli appunti sono insufficienti, dichiaralo esplicitamente nel campo summary_markdown e riduci la quantità di contenuto generato invece di allucinare.
Scrivi in italiano chiaro, tecnico quando necessario.
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, con questa forma esatta:
{
  "summary_markdown": "string",
  "key_points": [{"title": "string", "explanation": "string"}],
  "study_outline": [{"topic": "string", "subtopics": ["string"]}],
  "mermaid_diagram": "string",
  "flashcards": [{"front": "string", "back": "string", "tags": ["string"], "difficulty": "easy|medium|hard"}],
  "self_check_questions": [{"question": "string", "answer": "string"}]
}
${MERMAID_SYNTAX_RULES}
Regole per flashcards: produci da 8 a 20 flashcard atomiche, brevi, utili al ripasso attivo, senza duplicati.
Regole per self_check_questions: ogni domanda deve avere una risposta.`;

export function buildLessonStudyPackUserPrompt(input: {
  courseTitle: string;
  courseIntroduction: string | null;
  lessonNumber: number;
  lessonTitle: string;
  notesPlainText: string;
  ragContext?: string;
}): string {
  const parts = [
    `Corso: ${input.courseTitle}`,
    input.courseIntroduction ? `Introduzione al corso: ${input.courseIntroduction}` : null,
    `Lezione ${input.lessonNumber}: ${input.lessonTitle}`,
    `Appunti della lezione:\n${input.notesPlainText || "(nessun appunto testuale presente)"}`,
    input.ragContext ? `Materiale di supporto correlato:\n${input.ragContext}` : null,
    "Genera lo study pack in italiano seguendo esattamente lo schema JSON richiesto.",
  ];
  return parts.filter(Boolean).join("\n\n");
}

export const COURSE_SUMMARY_SYSTEM_PROMPT = `Sei un assistente didattico che prepara un riassunto complessivo di un corso universitario per uno studente italiano.
Usa SOLO le informazioni fornite (riepiloghi delle lezioni completate, informazioni del corso, eventuale materiale di supporto): non inventare argomenti non presenti.
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido con questa forma esatta:
{
  "comprehensive_summary_markdown": "string",
  "course_outline": [{"topic": "string", "subtopics": ["string"]}],
  "mermaid_diagram": "string",
  "suggested_study_plan": [{"block": "string", "focus": "string", "lessons_covered": ["string"]}]
}
${MERMAID_SYNTAX_RULES}
Il piano di studio (suggested_study_plan) deve essere organizzato "a blocchi" tematici, NON con date assolute: se non è fornita una data d'esame, non calcolare scadenze, limitati a un ordine di priorità basato su CFU, lezioni completate e mancanti.`;

export function buildCourseSummaryUserPrompt(input: {
  courseTitle: string;
  cfu: number;
  examDate: string | null;
  introduction: string | null;
  objectives: string | null;
  completedLessons: Array<{ number: number; title: string; summary: string | null }>;
  missingLessonsCount: number;
  ragContext?: string;
}): string {
  const lessonsBlock = input.completedLessons
    .map((l) => `- Lezione ${l.number} (${l.title}): ${l.summary ?? "(nessun riepilogo AI disponibile, solo titolo)"}`)
    .join("\n");

  const parts = [
    `Corso: ${input.courseTitle} — ${input.cfu} CFU`,
    input.examDate ? `Data esame: ${input.examDate}` : "Data esame non impostata: crea un piano a blocchi senza date assolute.",
    input.introduction ? `Introduzione: ${input.introduction}` : null,
    input.objectives ? `Obiettivi: ${input.objectives}` : null,
    `Lezioni completate (${input.completedLessons.length}):\n${lessonsBlock || "(nessuna)"}`,
    `Lezioni mancanti rispetto al target: ${input.missingLessonsCount}`,
    input.ragContext ? `Materiale di supporto correlato:\n${input.ragContext}` : null,
    "Genera il riassunto complessivo in italiano seguendo esattamente lo schema JSON richiesto.",
  ];
  return parts.filter(Boolean).join("\n\n");
}
