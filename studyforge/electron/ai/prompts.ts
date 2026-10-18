export const PROMPT_VERSION = "1.2.0";

const MERMAID_SYNTAX_RULES = `Regole per mermaid_diagram (fondamentale, causa errori di rendering se non rispettate):
- Usa SEMPRE "flowchart TB" (mai "mindmap": l'indentazione rigida che richiede causa più spesso errori di rendering, ed è meno chiara per lo studio di un flowchart con relazioni esplicite tra i concetti).
- Nodi con id brevi (A, B, C...) e testo racchiuso tra parentesi tonde, es. A(Concetto) --> B(Concetto correlato). Frecce etichettate solo dove la relazione non è ovvia, es. A -->|causa| B.
- SENZA blocchi markdown (niente \`\`\`) attorno.
- NON usare mai i caratteri < > (es. per notazioni tipo "<tipo> * <nome>"): in Mermaid vengono interpretati come tag HTML e rompono il parsing. Se devi indicare un tipo generico usa parole, es. "puntatore a tipo".
- Evita parentesi quadre [ ], graffe { } e virgolette " dentro i testi dei nodi (hanno significato speciale in Mermaid); usa solo lettere, numeri, spazi e punteggiatura semplice (. , : -).
- Testo dei nodi breve (poche parole): un diagramma da ripasso veloce, non un paragrafo per nodo.`;

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
  // Stesso troncamento deterministico di buildExerciseSetUserPrompt/
  // buildPresentationUserPrompt (vedi MAX_SOURCE_TEXT_CHARS_FOR_PROMPT sotto):
  // senza questo, appunti molto lunghi finivano interi nel prompt, il che
  // destabilizza l'output di un modello locale piccolo (osservato in test:
  // JSON troncato/malformato) oltre ad allungare inutilmente l'inferenza.
  const { text: notesText, truncated } = truncateSourceTextForPrompt(input.notesPlainText);
  const parts = [
    `Corso: ${input.courseTitle}`,
    input.courseIntroduction ? `Introduzione al corso: ${input.courseIntroduction}` : null,
    `Lezione ${input.lessonNumber}: ${input.lessonTitle}`,
    `Appunti della lezione:\n${notesText || "(nessun appunto testuale presente)"}`,
    truncated
      ? "[Nota: gli appunti sono stati troncati per lunghezza eccessiva; alcuni argomenti finali potrebbero non essere coperti. Non inventare per compensare la parte mancante.]"
      : null,
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

// ---------- Esercizi interattivi progressivi ----------

/**
 * Limite di caratteri del testo lezione realmente incluso nel prompt,
 * più stretto del tetto Zod dello schema di input (20000, difensivo/anti-abuso
 * su tutto l'input IPC, vedi generateExerciseSetInputSchema/generatePresentationInputSchema
 * in electron/shared/schemas.ts). Oltre questa soglia il testo viene troncato
 * a un confine di paragrafo, con un marcatore esplicito nel prompt.
 *
 * Trade-off scelto: troncamento deterministico invece di chunking + sintesi
 * preliminare (un'altra chiamata AI che riassume gli appunti lunghi prima di
 * generare). Il chunking sarebbe più fedele su appunti molto estesi, ma
 * introduce un'altra chiamata di rete, un altro prompt e un'altra modalità di
 * fallimento per un caso — note di una singola lezione, non un libro — che
 * nella pratica raramente supera questa soglia. Il modello è già istruito a
 * dichiarare quando il materiale è insufficiente, quindi si comporta
 * correttamente anche su un contesto troncato invece di "riempire i vuoti"
 * allucinando. Resta sostituibile in futuro dietro la stessa interfaccia
 * AiStudyGenerator senza toccare cache, persistenza o renderer.
 */
export const MAX_SOURCE_TEXT_CHARS_FOR_PROMPT = 12000;

export function truncateSourceTextForPrompt(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_SOURCE_TEXT_CHARS_FOR_PROMPT) {
    return { text, truncated: false };
  }
  const cut = text.slice(0, MAX_SOURCE_TEXT_CHARS_FOR_PROMPT);
  const lastParagraphBreak = cut.lastIndexOf("\n\n");
  // Taglia al confine di paragrafo più vicino se ragionevolmente vicino al
  // limite (non troppo indietro), altrimenti taglia comunque al limite.
  const boundary =
    lastParagraphBreak > MAX_SOURCE_TEXT_CHARS_FOR_PROMPT * 0.5 ? lastParagraphBreak : cut.length;
  return { text: cut.slice(0, boundary).trimEnd(), truncated: true };
}

function languageInstructionForLocale(locale: string): string {
  if (locale.toLowerCase().startsWith("it")) {
    return "Scrivi tutto il contenuto (domande, risposte, spiegazioni, titoli) in italiano.";
  }
  return `Scrivi tutto il contenuto (domande, risposte, spiegazioni, titoli) nella lingua del locale "${locale}", non in italiano.`;
}

export const EXERCISE_SET_SYSTEM_PROMPT = `Sei un tutor paziente che trasforma una lezione universitaria, anche lunga e complessa, in un percorso di studio breve: capisco un concetto, vedo un esempio, poi verifico se l'ho imparato.
Usa ESCLUSIVAMENTE i concetti presenti nel testo fornito dall'utente: non introdurre argomenti, fatti, formule, esempi numerici o codice che non siano deducibili da esso. Se alla lezione mancano informazioni necessarie per capire (es. le condizioni di validità di una formula, una definizione usata ma mai data), NON inventarle: elencale in "missingInfo" con una frase breve ciascuna. Se non manca nulla, "missingInfo" è un array vuoto.

PARTE 1 — "topics": dividi la lezione in 3-6 argomenti (meno solo se il testo è molto breve), ordinati dal più semplice al più complesso. Per ogni argomento:
- "title": titolo chiaro e breve.
- "explanation": spiegazione RISCRITTA per far capire davvero, non un riassunto con frasi tagliate. Parole comuni, frasi brevi, 2-4 paragrafi corti al massimo, come farebbe un tutor paziente. Se usi un termine tecnico spiegalo subito con parole semplici. Mantieni le informazioni importanti, le condizioni delle formule e la correttezza del contenuto.
- "keyRule": la regola, formula o concetto fondamentale da ricordare, in una o due righe (con le sue condizioni di validità, se la lezione le indica).
- "example": un esempio concreto. "problem" è il testo dell'esempio, "steps" sono i passaggi svolti uno alla volta, ognuno con il perché del passaggio; l'ultimo passaggio contiene il risultato.
- "commonMistake": (opzionale) un errore comune da evitare e perché è sbagliato. Ometti il campo se la lezione non offre un errore plausibile.
- "practice": (opzionale) un esercizio di studio simile all'esempio, con "solution" svolta in breve.

PARTE 2 — "exercises": esercizi di verifica basati sugli argomenti, in questo ordine:
- i primi 2 con "stage": "concetto": domande semplici sui concetti fondamentali (difficulty 1-2);
- i successivi 4 con "stage": "applicazione": esercizi di applicazione con difficoltà crescente (difficulty 2-4);
- gli ultimi 2 con "stage": "collegamento": richiedono di collegare due o più argomenti (difficulty 4-5).
Se il numero richiesto è diverso da 8, mantieni le stesse proporzioni e lo stesso ordine.
Ogni esercizio ha "topicIndex": l'indice (da 0) dell'argomento in "topics" che verifica di più.
Le domande devono verificare la comprensione, non solo la memoria: chiedi di applicare, riconoscere un caso, scegliere il passaggio giusto.
Usa soprattutto "multiple_choice"; usa "open_answer" solo quando la risposta è breve e univoca (un numero, una parola, una formula corta), fornendo in acceptedAnswers tutte le varianti di scrittura ragionevoli. Usa "coding_challenge" solo se la lezione riguarda la programmazione, al massimo una volta.
Per ogni "multiple_choice" fornisci esattamente 4 opzioni plausibili, di cui UNA SOLA corretta: le alternative sbagliate non devono essere equivalenti tra loro né alla risposta corretta (attenzione a forme diverse della stessa espressione matematica), e devono corrispondere a errori tipici. correctAnswer deve corrispondere ESATTAMENTE, carattere per carattere, al testo di una delle opzioni.
"explanation" spiega in 2-4 frasi perché la risposta corretta è giusta e indica il passaggio o l'errore tipico che porta alle risposte sbagliate, così chi sbaglia capisce dove si è perso.
Per "coding_challenge" usa solo uno di questi linguaggi: javascript, typescript, python, c, cpp, java, csharp, go, rust, sql, bash, html, css, php, ruby.
Non generare né includere markup HTML in nessun campo: solo testo semplice, Markdown leggero e LaTeX tra $...$ o $$...$$ per le formule.
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, senza blocchi di codice markdown, con questa forma esatta:
{
  "title": "string",
  "missingInfo": ["string"],
  "topics": [
    { "title": "string", "explanation": "string", "keyRule": "string", "example": { "problem": "string", "steps": ["string"] }, "commonMistake": "string", "practice": { "question": "string", "solution": "string" } }
  ],
  "exercises": [
    { "type": "multiple_choice", "id": "string", "stage": "concetto", "topicIndex": 0, "question": "string", "options": ["string","string","string","string"], "correctAnswer": "string", "explanation": "string", "difficulty": 1 },
    { "type": "open_answer", "id": "string", "stage": "applicazione", "topicIndex": 1, "question": "string", "acceptedAnswers": ["string"], "explanation": "string", "difficulty": 3 },
    { "type": "coding_challenge", "id": "string", "stage": "applicazione", "topicIndex": 1, "question": "string", "language": "javascript", "starterCode": "string", "expectedSolution": "string", "evaluationHints": ["string"], "explanation": "string", "difficulty": 3 }
  ]
}
Ogni "id" deve essere unico all'interno dell'array (usa uno slug breve, es. "es-1", "es-2").`;

export function buildExerciseSetUserPrompt(input: {
  lessonId: string;
  subject?: string;
  requestedCount: number;
  sourceText: string;
  locale: string;
}): string {
  const { text, truncated } = truncateSourceTextForPrompt(input.sourceText);
  const parts = [
    input.subject ? `Materia/contesto del corso: ${input.subject}` : null,
    `Genera il percorso di studio con esattamente ${input.requestedCount} esercizi di verifica.`,
    `Appunti della lezione:\n${text || "(nessun appunto testuale presente)"}`,
    truncated
      ? "[Nota: gli appunti sono stati troncati per lunghezza eccessiva; alcuni argomenti finali potrebbero non essere coperti. Non inventare per compensare la parte mancante.]"
      : null,
    languageInstructionForLocale(input.locale),
    "Genera il percorso di studio in formato JSON seguendo esattamente lo schema richiesto.",
  ];
  return parts.filter((p): p is string => Boolean(p)).join("\n\n");
}

// ---------- Presentazione sintetica di ripasso ----------

export const PRESENTATION_SYSTEM_PROMPT = `Sei un assistente didattico che prepara una presentazione sintetica per il ripasso rapido di una lezione universitaria.
Usa ESCLUSIVAMENTE i concetti presenti nel testo fornito dall'utente: non introdurre argomenti non deducibili da esso.
Struttura la presentazione con 6-12 slide (meno solo se il testo sorgente è molto breve), in questo ordine tipico: una slide "title" iniziale, alcune slide "content" per i concetti principali (una slide per concetto, non ammassare tutto), eventuali slide "code" solo se il testo contiene codice o pseudocodice rilevante, e una slide "summary" finale di ripasso; usa "quiz" con parsimonia, al massimo una, solo per una domanda di autoverifica finale se ha senso.
Ogni slide deve avere bullet point brevi (poche parole ciascuno, mai frasi lunghe): è materiale da ripasso veloce, non un testo continuo da leggere.
Non generare né includere markup HTML in nessun campo: solo testo semplice/Markdown leggero nei bullet e nei titoli. Le slide sono dati strutturati (array di bullet), non un'unica stringa formattata.
Per il campo "language" di codeBlocks usa solo uno di questi valori, scegliendo quello più coerente con l'argomento della lezione: javascript, typescript, python, c, cpp, java, csharp, go, rust, sql, bash, html, css, php, ruby.
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, senza blocchi di codice markdown, con questa forma esatta:
{
  "title": "string",
  "slides": [
    { "id": "string", "type": "title", "title": "string", "bullets": [] },
    { "id": "string", "type": "content", "title": "string", "bullets": ["string", "string"], "speakerNotes": "string" },
    { "id": "string", "type": "code", "title": "string", "bullets": ["string"], "codeBlocks": [{"language": "javascript", "code": "string", "caption": "string"}] },
    { "id": "string", "type": "summary", "title": "string", "bullets": ["string"] }
  ]
}
Ogni "id" deve essere unico all'interno dell'array (usa uno slug breve, es. "s-1", "s-2"). speakerNotes e codeBlocks sono opzionali: includili solo dove hanno senso. Una slide "code" deve sempre avere almeno un codeBlock.`;

export function buildPresentationUserPrompt(input: {
  lessonId: string;
  subject?: string;
  requestedCount: number;
  sourceText: string;
  locale: string;
}): string {
  const { text, truncated } = truncateSourceTextForPrompt(input.sourceText);
  const parts = [
    input.subject ? `Materia/contesto del corso: ${input.subject}` : null,
    `Punta a circa ${input.requestedCount} slide (indicativo: rispetta comunque la regola 6-12, salvo fonte molto breve).`,
    `Appunti della lezione:\n${text || "(nessun appunto testuale presente)"}`,
    truncated
      ? "[Nota: gli appunti sono stati troncati per lunghezza eccessiva; alcuni argomenti finali potrebbero non essere coperti. Non inventare per compensare la parte mancante.]"
      : null,
    languageInstructionForLocale(input.locale),
    "Genera la presentazione in formato JSON seguendo esattamente lo schema richiesto.",
  ];
  return parts.filter((p): p is string => Boolean(p)).join("\n\n");
}

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
    .map(
      (l) =>
        `- Lezione ${l.number} (${l.title}): ${l.summary ?? "(nessun riepilogo AI disponibile, solo titolo)"}`,
    )
    .join("\n");

  const parts = [
    `Corso: ${input.courseTitle} — ${input.cfu} CFU`,
    input.examDate
      ? `Data esame: ${input.examDate}`
      : "Data esame non impostata: crea un piano a blocchi senza date assolute.",
    input.introduction ? `Introduzione: ${input.introduction}` : null,
    input.objectives ? `Obiettivi: ${input.objectives}` : null,
    `Lezioni completate (${input.completedLessons.length}):\n${lessonsBlock || "(nessuna)"}`,
    `Lezioni mancanti rispetto al target: ${input.missingLessonsCount}`,
    input.ragContext ? `Materiale di supporto correlato:\n${input.ragContext}` : null,
    "Genera il riassunto complessivo in italiano seguendo esattamente lo schema JSON richiesto.",
  ];
  return parts.filter(Boolean).join("\n\n");
}
