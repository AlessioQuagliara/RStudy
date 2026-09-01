import { describe, expect, it } from "vitest";
import {
  exerciseSchema,
  exerciseSetSchema,
  generateExerciseSetInputSchema,
  presentationSchema,
  presentationSlideSchema,
  generatePresentationInputSchema,
  exerciseSetGenerationResultSchema,
  generateLessonExercisesInputSchema,
  generateLessonPresentationInputSchema,
  exerciseSetGenerationOutcomeSchema,
  presentationGenerationOutcomeSchema,
} from "./schemas";

const VALID_MULTIPLE_CHOICE = {
  type: "multiple_choice" as const,
  id: "ex-1",
  question: "Qual è la derivata di $x^2$?",
  options: ["2x", "x", "x^2", "1"],
  correctAnswer: "2x",
  explanation: "La derivata di x^2 è 2x per la regola di potenza.",
  difficulty: 2,
};

const VALID_OPEN_ANSWER = {
  type: "open_answer" as const,
  id: "ex-2",
  question: "Cos'è un puntatore in C?",
  acceptedAnswers: ["Una variabile che contiene un indirizzo di memoria"],
  explanation: "I puntatori memorizzano indirizzi, non valori diretti.",
  difficulty: 3,
};

const VALID_CODING_CHALLENGE = {
  type: "coding_challenge" as const,
  id: "ex-3",
  question: "Scrivi una funzione che somma due numeri.",
  language: "typescript" as const,
  starterCode: "function sum(a: number, b: number) {\n  // TODO\n}",
  expectedSolution: "function sum(a: number, b: number) {\n  return a + b;\n}",
  evaluationHints: ["Deve gestire numeri negativi"],
  explanation: "La somma è l'operazione base richiesta.",
  difficulty: 1,
};

function buildExerciseSet(exercises: unknown[]) {
  return {
    version: 1,
    sourceLessonId: "lesson-1",
    title: "Esercizi di prova",
    generatedAt: new Date("2026-01-01T10:00:00.000Z").toISOString(),
    exercises,
  };
}

describe("exerciseSchema", () => {
  it("valida un multiple_choice, open_answer e coding_challenge corretti", () => {
    expect(exerciseSchema.safeParse(VALID_MULTIPLE_CHOICE).success).toBe(true);
    expect(exerciseSchema.safeParse(VALID_OPEN_ANSWER).success).toBe(true);
    expect(exerciseSchema.safeParse(VALID_CODING_CHALLENGE).success).toBe(true);
  });

  it("rifiuta opzioni duplicate in un multiple_choice", () => {
    const invalid = { ...VALID_MULTIPLE_CHOICE, options: ["2x", "2x", "x^2", "1"] };
    const result = exerciseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("options"))).toBe(true);
    }
  });

  it("rifiuta un correctAnswer che non è tra le opzioni", () => {
    const invalid = { ...VALID_MULTIPLE_CHOICE, correctAnswer: "non presente" };
    const result = exerciseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("correctAnswer"))).toBe(true);
    }
  });

  it("rifiuta un numero di opzioni diverso da 4", () => {
    const invalid = { ...VALID_MULTIPLE_CHOICE, options: ["2x", "x", "x^2"] };
    expect(exerciseSchema.safeParse(invalid).success).toBe(false);
  });

  it("rifiuta difficulty fuori range (0 e 6) per ciascun tipo di esercizio", () => {
    expect(exerciseSchema.safeParse({ ...VALID_MULTIPLE_CHOICE, difficulty: 0 }).success).toBe(
      false,
    );
    expect(exerciseSchema.safeParse({ ...VALID_OPEN_ANSWER, difficulty: 6 }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...VALID_CODING_CHALLENGE, difficulty: 5.5 }).success).toBe(
      false,
    );
  });

  it("rifiuta un linguaggio non supportato per coding_challenge", () => {
    const invalid = { ...VALID_CODING_CHALLENGE, language: "rust" };
    expect(exerciseSchema.safeParse(invalid).success).toBe(false);
  });

  it("rifiuta acceptedAnswers vuoto per open_answer", () => {
    const invalid = { ...VALID_OPEN_ANSWER, acceptedAnswers: [] };
    expect(exerciseSchema.safeParse(invalid).success).toBe(false);
  });

  it("ignora (strip) campi inattesi su un esercizio altrimenti valido", () => {
    const withExtra = {
      ...VALID_OPEN_ANSWER,
      unexpectedField: "qualcosa che il modello ha aggiunto",
    };
    const result = exerciseSchema.safeParse(withExtra);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("unexpectedField");
    }
  });

  it("rifiuta una forma malformata (tipi di campo sbagliati)", () => {
    const malformed = { ...VALID_MULTIPLE_CHOICE, options: "2x, x, x^2, 1", difficulty: "alta" };
    expect(exerciseSchema.safeParse(malformed).success).toBe(false);
  });

  it("rifiuta un JSON.parse di una stringa non valida prima ancora di arrivare a Zod", () => {
    expect(() => JSON.parse("questo non è json")).toThrow();
  });
});

describe("exerciseSetSchema", () => {
  it("valida un set con 3-8 esercizi eterogenei", () => {
    const result = exerciseSetSchema.safeParse(
      buildExerciseSet([VALID_MULTIPLE_CHOICE, VALID_OPEN_ANSWER, VALID_CODING_CHALLENGE]),
    );
    expect(result.success).toBe(true);
  });

  it("rifiuta un set vuoto", () => {
    expect(exerciseSetSchema.safeParse(buildExerciseSet([])).success).toBe(false);
  });

  it("rifiuta un set con meno di 3 esercizi", () => {
    expect(
      exerciseSetSchema.safeParse(buildExerciseSet([VALID_MULTIPLE_CHOICE, VALID_OPEN_ANSWER]))
        .success,
    ).toBe(false);
  });

  it("rifiuta un set con più di 8 esercizi", () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...VALID_OPEN_ANSWER, id: `ex-${i}` }));
    expect(exerciseSetSchema.safeParse(buildExerciseSet(nine)).success).toBe(false);
  });

  it("rifiuta se anche un solo esercizio del set non è valido", () => {
    const invalidInside = { ...VALID_MULTIPLE_CHOICE, correctAnswer: "non presente" };
    const result = exerciseSetSchema.safeParse(
      buildExerciseSet([invalidInside, VALID_OPEN_ANSWER, VALID_CODING_CHALLENGE]),
    );
    expect(result.success).toBe(false);
  });
});

describe("generateExerciseSetInputSchema", () => {
  it("applica il default locale it-IT quando omesso", () => {
    const result = generateExerciseSetInputSchema.safeParse({
      lessonId: "lesson-1",
      sourceText: "Appunti della lezione",
      requestedCount: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("it-IT");
    }
  });

  it("rifiuta requestedCount fuori range (2 e 9)", () => {
    const base = { lessonId: "lesson-1", sourceText: "Appunti" };
    expect(generateExerciseSetInputSchema.safeParse({ ...base, requestedCount: 2 }).success).toBe(
      false,
    );
    expect(generateExerciseSetInputSchema.safeParse({ ...base, requestedCount: 9 }).success).toBe(
      false,
    );
  });

  it("rifiuta un locale non in formato BCP-47", () => {
    const result = generateExerciseSetInputSchema.safeParse({
      lessonId: "lesson-1",
      sourceText: "Appunti",
      requestedCount: 4,
      locale: "italiano",
    });
    expect(result.success).toBe(false);
  });
});

describe("presentationSlideSchema", () => {
  it("rifiuta una slide 'code' senza codeBlocks", () => {
    const slide = { id: "s1", type: "code", title: "Esempio", bullets: [] };
    expect(presentationSlideSchema.safeParse(slide).success).toBe(false);
  });

  it("valida una slide 'code' con almeno un codeBlock", () => {
    const slide = {
      id: "s1",
      type: "code",
      title: "Esempio",
      bullets: ["Vediamo un esempio pratico"],
      codeBlocks: [{ language: "python", code: "print('hello')" }],
    };
    expect(presentationSlideSchema.safeParse(slide).success).toBe(true);
  });
});

describe("presentationSchema", () => {
  it("valida una presentazione con slide di tipi diversi", () => {
    const presentation = {
      version: 1,
      sourceLessonId: "lesson-1",
      title: "Ripasso: Introduzione ai puntatori",
      generatedAt: new Date("2026-01-01T10:00:00.000Z").toISOString(),
      slides: [
        { id: "s1", type: "title", title: "Introduzione ai puntatori", bullets: [] },
        {
          id: "s2",
          type: "content",
          title: "Cosa sono",
          bullets: ["Contengono un indirizzo di memoria", "Si dichiarano con *"],
          speakerNotes: "Ricordare l'analogia con un citofono che punta a un appartamento.",
        },
        {
          id: "s3",
          type: "code",
          title: "Esempio in C",
          bullets: ["Dichiarazione e dereferenziazione"],
          codeBlocks: [
            { language: "c", code: "int x = 5;\nint *p = &x;", caption: "Puntatore a intero" },
          ],
        },
        {
          id: "s4",
          type: "summary",
          title: "Riepilogo",
          bullets: ["I puntatori sono indirizzi, non valori"],
        },
      ],
    };
    const result = presentationSchema.safeParse(presentation);
    expect(result.success).toBe(true);
  });

  it("rifiuta una presentazione con meno di 3 slide", () => {
    const presentation = {
      version: 1,
      sourceLessonId: "lesson-1",
      title: "Troppo corta",
      generatedAt: new Date().toISOString(),
      slides: [{ id: "s1", type: "title", title: "Titolo", bullets: [] }],
    };
    expect(presentationSchema.safeParse(presentation).success).toBe(false);
  });

  it("ignora (strip) campi inattesi a livello di presentazione", () => {
    const presentation = {
      version: 1,
      sourceLessonId: "lesson-1",
      title: "Con campo extra",
      generatedAt: new Date().toISOString(),
      slides: [
        { id: "s1", type: "title", title: "Titolo", bullets: [] },
        { id: "s2", type: "content", title: "Contenuto", bullets: ["punto 1"] },
        { id: "s3", type: "summary", title: "Riepilogo", bullets: ["punto finale"] },
      ],
      unexpectedTopLevelField: 42,
    };
    const result = presentationSchema.safeParse(presentation);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("unexpectedTopLevelField");
    }
  });
});

describe("generatePresentationInputSchema", () => {
  it("valida un input coerente con quello degli esercizi (stessa forma, default locale)", () => {
    const result = generatePresentationInputSchema.safeParse({
      lessonId: "lesson-1",
      sourceText: "Appunti della lezione",
      requestedCount: 6,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.locale).toBe("it-IT");
    }
  });
});

describe("exerciseSetGenerationResultSchema (envelope IPC)", () => {
  it("valida un risultato di successo con dati tipizzati", () => {
    const result = exerciseSetGenerationResultSchema.safeParse({
      status: "success",
      data: buildExerciseSet([VALID_MULTIPLE_CHOICE, VALID_OPEN_ANSWER, VALID_CODING_CHALLENGE]),
    });
    expect(result.success).toBe(true);
  });

  it("valida un risultato di errore con codice ed è serializzabile in JSON senza perdita", () => {
    const parsed = exerciseSetGenerationResultSchema.parse({
      status: "error",
      error: { code: "provider_error", message: "DeepSeek non raggiungibile" },
    });
    const roundTripped = JSON.parse(JSON.stringify(parsed));
    expect(roundTripped).toEqual(parsed);
  });

  it("rifiuta un risultato con status di successo ma dati non validi", () => {
    const result = exerciseSetGenerationResultSchema.safeParse({
      status: "success",
      data: buildExerciseSet([]),
    });
    expect(result.success).toBe(false);
  });
});

describe("generateLessonExercisesInputSchema / generateLessonPresentationInputSchema (boundary IPC)", () => {
  it("applica i default (requestedCount, locale) quando il renderer manda solo lessonId", () => {
    const exercises = generateLessonExercisesInputSchema.parse({ lessonId: "lesson-1" });
    expect(exercises.requestedCount).toBe(5);
    expect(exercises.locale).toBe("it-IT");

    const presentation = generateLessonPresentationInputSchema.parse({ lessonId: "lesson-1" });
    expect(presentation.requestedCount).toBe(8);
    expect(presentation.locale).toBe("it-IT");
  });

  it("rifiuta un payload senza lessonId", () => {
    expect(generateLessonExercisesInputSchema.safeParse({}).success).toBe(false);
    expect(generateLessonPresentationInputSchema.safeParse({}).success).toBe(false);
  });

  it("rifiuta requestedCount fuori dai range consentiti per ciascun canale", () => {
    expect(
      generateLessonExercisesInputSchema.safeParse({ lessonId: "l1", requestedCount: 2 }).success,
    ).toBe(false);
    expect(
      generateLessonExercisesInputSchema.safeParse({ lessonId: "l1", requestedCount: 9 }).success,
    ).toBe(false);
    expect(
      generateLessonPresentationInputSchema.safeParse({ lessonId: "l1", requestedCount: 21 })
        .success,
    ).toBe(false);
  });

  it("ignora (strip) un eventuale sourceText inviato dal renderer: non fa parte del contratto IPC", () => {
    const result = generateLessonExercisesInputSchema.parse({
      lessonId: "lesson-1",
      sourceText: "il renderer non dovrebbe mandare questo, ma se lo manda viene ignorato",
    });
    expect(result).not.toHaveProperty("sourceText");
  });
});

describe("exerciseSetGenerationOutcomeSchema / presentationGenerationOutcomeSchema (risposta IPC con fromCache)", () => {
  it("valida un successo con fromCache:true (cache hit)", () => {
    const outcome = exerciseSetGenerationOutcomeSchema.parse({
      status: "success",
      data: buildExerciseSet([
        {
          type: "open_answer",
          id: "ex-1",
          question: "domanda",
          acceptedAnswers: ["risposta"],
          explanation: "spiegazione",
          difficulty: 1,
        },
        {
          type: "open_answer",
          id: "ex-2",
          question: "domanda",
          acceptedAnswers: ["risposta"],
          explanation: "spiegazione",
          difficulty: 2,
        },
        {
          type: "open_answer",
          id: "ex-3",
          question: "domanda",
          acceptedAnswers: ["risposta"],
          explanation: "spiegazione",
          difficulty: 3,
        },
      ]),
      fromCache: true,
    });
    expect(outcome.fromCache).toBe(true);
  });

  it("valida un errore con fromCache:false e resta serializzabile in JSON senza perdita", () => {
    const parsed = presentationGenerationOutcomeSchema.parse({
      status: "error",
      error: { code: "not_configured", message: "Nessuna API key AI configurata." },
      fromCache: false,
    });
    const roundTripped = JSON.parse(JSON.stringify(parsed));
    expect(roundTripped).toEqual(parsed);
  });

  it("rifiuta un outcome senza fromCache: non è un semplice result, il campo è obbligatorio", () => {
    const result = exerciseSetGenerationOutcomeSchema.safeParse({
      status: "error",
      error: { code: "unknown", message: "errore" },
    });
    expect(result.success).toBe(false);
  });
});
