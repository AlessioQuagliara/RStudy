import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "./schema";
import {
  CoursesRepo,
  LessonAiGenerationsRepo,
  LessonsRepo,
  computeNextReviewAt,
} from "./repositories";
import type { ExerciseSet, Presentation } from "../shared/schemas";

describe("computeNextReviewAt (SRS)", () => {
  const from = new Date("2026-01-01T10:00:00.000Z");

  it("easy -> +7 giorni", () => {
    const next = new Date(computeNextReviewAt("easy", from));
    expect(next.getUTCDate()).toBe(8);
    expect(next.getUTCMonth()).toBe(0);
  });

  it("medium -> +3 giorni", () => {
    const next = new Date(computeNextReviewAt("medium", from));
    expect(next.getUTCDate()).toBe(4);
  });

  it("hard -> +1 giorno", () => {
    const next = new Date(computeNextReviewAt("hard", from));
    expect(next.getUTCDate()).toBe(2);
  });

  it("gestisce correttamente il cambio di mese", () => {
    const endOfMonth = new Date("2026-01-30T00:00:00.000Z");
    const next = new Date(computeNextReviewAt("easy", endOfMonth));
    expect(next.getUTCMonth()).toBe(1); // febbraio
    expect(next.getUTCDate()).toBe(6);
  });
});

// ---------- LessonAiGenerationsRepo ----------
// Primo test del repo che usa un vero database SQLite in-memory (con le
// migrazioni reali applicate) invece di funzioni pure: qui contano il
// vincolo FK su lessons, l'indice unico parziale e il comportamento su
// dati corrotti, che un test puramente unitario non potrebbe verificare.

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  // Stesso pattern di electron/db/migrate.ts: risolto da cwd (repo root
  // quando i test girano con `pnpm test`/`vitest run`), non da __dirname o
  // import.meta.url, che si comportano diversamente a seconda del build.
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return { db, sqlite };
}

const VALID_EXERCISE_SET: ExerciseSet = {
  version: 1,
  sourceLessonId: "lesson-1",
  title: "Esercizi di prova",
  generatedAt: new Date("2026-01-01T10:00:00.000Z").toISOString(),
  exercises: [
    {
      type: "multiple_choice",
      id: "ex-1",
      question: "Qual è la derivata di $x^2$?",
      options: ["2x", "x", "x^2", "1"],
      correctAnswer: "2x",
      explanation: "Regola di potenza.",
      difficulty: 2,
    },
    {
      type: "open_answer",
      id: "ex-2",
      question: "Cos'è un puntatore?",
      acceptedAnswers: ["Una variabile che contiene un indirizzo di memoria"],
      explanation: "I puntatori memorizzano indirizzi, non valori diretti.",
      difficulty: 3,
    },
    {
      type: "coding_challenge",
      id: "ex-3",
      question: "Scrivi una funzione che somma due numeri.",
      language: "typescript",
      starterCode: "",
      expectedSolution: "function sum(a: number, b: number) { return a + b; }",
      explanation: "La somma è l'operazione base richiesta.",
      difficulty: 1,
    },
  ],
};

const VALID_PRESENTATION: Presentation = {
  version: 1,
  sourceLessonId: "lesson-1",
  title: "Ripasso lezione",
  generatedAt: new Date("2026-01-01T10:00:00.000Z").toISOString(),
  slides: [
    { id: "s1", type: "title", title: "Titolo", bullets: [] },
    { id: "s2", type: "content", title: "Contenuto", bullets: ["punto 1"] },
    { id: "s3", type: "summary", title: "Riepilogo", bullets: ["punto finale"] },
  ],
};

describe("LessonAiGenerationsRepo", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];
  let lessonId: string;

  beforeEach(() => {
    ({ db, sqlite } = createTestDb());
    const course = CoursesRepo.create(db, { title: "Analisi 1", cfu: 9 });
    const lesson = LessonsRepo.create(db, {
      courseId: course.id,
      lessonNumber: 1,
      title: "Limiti",
    });
    lessonId = lesson.id;
  });

  it("saveExerciseSet + findCachedGeneration: la generazione ready viene ritrovata dalla cache", () => {
    LessonAiGenerationsRepo.saveExerciseSet(db, {
      status: "ready",
      lessonId,
      sourceContentHash: "hash-a",
      model: "local-model-test",
      payload: VALID_EXERCISE_SET,
    });

    const cached = LessonAiGenerationsRepo.findCachedGeneration(db, {
      lessonId,
      kind: "exercise_set",
      sourceContentHash: "hash-a",
    });

    expect(cached).not.toBeNull();
    expect(cached?.payload.exercises).toHaveLength(3);
    expect(cached?.row.schemaVersion).toBe(1);
    expect(cached?.row.model).toBe("local-model-test");
  });

  it("findCachedGeneration è un cache-miss (null) se l'hash del contenuto è cambiato", () => {
    LessonAiGenerationsRepo.saveExerciseSet(db, {
      status: "ready",
      lessonId,
      sourceContentHash: "hash-a",
      model: "local-model-test",
      payload: VALID_EXERCISE_SET,
    });

    const cached = LessonAiGenerationsRepo.findCachedGeneration(db, {
      lessonId,
      kind: "exercise_set",
      sourceContentHash: "hash-b",
    });
    expect(cached).toBeNull();
  });

  it("findCachedGeneration ignora i tentativi 'failed': non basta un hash che combacia", () => {
    LessonAiGenerationsRepo.saveExerciseSet(db, {
      status: "failed",
      lessonId,
      sourceContentHash: "hash-a",
      model: "local-model-test",
      schemaVersion: 1,
      errorMessage: "Timeout durante la generazione",
    });

    const cached = LessonAiGenerationsRepo.findCachedGeneration(db, {
      lessonId,
      kind: "exercise_set",
      sourceContentHash: "hash-a",
    });
    expect(cached).toBeNull();
  });

  it("un tentativo 'failed' salva solo un messaggio sanificato, non payload", () => {
    const saved = LessonAiGenerationsRepo.saveExerciseSet(db, {
      status: "failed",
      lessonId,
      sourceContentHash: "hash-a",
      model: "local-model-test",
      schemaVersion: 1,
      errorMessage: "Il provider AI non è raggiungibile",
    });

    expect(saved.payloadJson).toBeNull();
    expect(saved.errorMessage).toBe("Il provider AI non è raggiungibile");
  });

  it("permette più tentativi 'failed' con lo stesso hash (storico preservato)", () => {
    LessonAiGenerationsRepo.saveExerciseSet(db, {
      status: "failed",
      lessonId,
      sourceContentHash: "hash-a",
      model: "local-model-test",
      schemaVersion: 1,
      errorMessage: "Errore 1",
    });
    LessonAiGenerationsRepo.saveExerciseSet(db, {
      status: "failed",
      lessonId,
      sourceContentHash: "hash-a",
      model: "local-model-test",
      schemaVersion: 1,
      errorMessage: "Errore 2",
    });

    const all = LessonAiGenerationsRepo.listGenerationsForLesson(db, lessonId, "exercise_set");
    expect(all).toHaveLength(2);
  });

  it("rifiuta (vincolo DB) una seconda generazione 'ready' con lo stesso lessonId+kind+hash", () => {
    LessonAiGenerationsRepo.saveExerciseSet(db, {
      status: "ready",
      lessonId,
      sourceContentHash: "hash-a",
      model: "local-model-test",
      payload: VALID_EXERCISE_SET,
    });

    expect(() =>
      LessonAiGenerationsRepo.saveExerciseSet(db, {
        status: "ready",
        lessonId,
        sourceContentHash: "hash-a",
        model: "local-model-test",
        payload: VALID_EXERCISE_SET,
      }),
    ).toThrow();
  });

  it("savePresentation + findCachedGeneration funzionano allo stesso modo per kind='presentation'", () => {
    LessonAiGenerationsRepo.savePresentation(db, {
      status: "ready",
      lessonId,
      sourceContentHash: "hash-c",
      model: "local-model-test",
      payload: VALID_PRESENTATION,
    });

    const cached = LessonAiGenerationsRepo.findCachedGeneration(db, {
      lessonId,
      kind: "presentation",
      sourceContentHash: "hash-c",
    });
    expect(cached).not.toBeNull();
    expect(cached?.payload.slides).toHaveLength(3);

    // Lo stesso hash ma kind diverso non deve produrre un falso hit incrociato.
    const crossKind = LessonAiGenerationsRepo.findCachedGeneration(db, {
      lessonId,
      kind: "exercise_set",
      sourceContentHash: "hash-c",
    });
    expect(crossKind).toBeNull();
  });

  it("findCachedGeneration non va in crash su un payload_json non-JSON (record corrotto) e torna null", () => {
    const saved = LessonAiGenerationsRepo.saveExerciseSet(db, {
      status: "ready",
      lessonId,
      sourceContentHash: "hash-a",
      model: "local-model-test",
      payload: VALID_EXERCISE_SET,
    });

    sqlite
      .prepare("UPDATE lesson_ai_generations SET payload_json = ? WHERE id = ?")
      .run("{ questo non è json valido", saved.id);

    expect(() =>
      LessonAiGenerationsRepo.findCachedGeneration(db, {
        lessonId,
        kind: "exercise_set",
        sourceContentHash: "hash-a",
      }),
    ).not.toThrow();
    const cached = LessonAiGenerationsRepo.findCachedGeneration(db, {
      lessonId,
      kind: "exercise_set",
      sourceContentHash: "hash-a",
    });
    expect(cached).toBeNull();
  });

  it("findCachedGeneration non va in crash su un payload legacy che non rispetta più lo schema", () => {
    const saved = LessonAiGenerationsRepo.saveExerciseSet(db, {
      status: "ready",
      lessonId,
      sourceContentHash: "hash-a",
      model: "local-model-test",
      payload: VALID_EXERCISE_SET,
    });

    // Simula un record scritto da una versione precedente del contratto: JSON
    // valido ma che non rispetta più lo schema Zod attuale (options con soli 3 elementi).
    const legacyPayload = JSON.stringify({ ...VALID_EXERCISE_SET, exercises: [] });
    sqlite
      .prepare("UPDATE lesson_ai_generations SET payload_json = ? WHERE id = ?")
      .run(legacyPayload, saved.id);

    const cached = LessonAiGenerationsRepo.findCachedGeneration(db, {
      lessonId,
      kind: "exercise_set",
      sourceContentHash: "hash-a",
    });
    expect(cached).toBeNull();
  });

  it("listGenerationsForLesson scarta senza crashare una riga con status non conforme allo schema", () => {
    LessonAiGenerationsRepo.saveExerciseSet(db, {
      status: "ready",
      lessonId,
      sourceContentHash: "hash-a",
      model: "local-model-test",
      payload: VALID_EXERCISE_SET,
    });

    sqlite
      .prepare(
        `INSERT INTO lesson_ai_generations
           (id, lesson_id, kind, source_content_hash, schema_version, model, status, payload_json, error_message, created_at, updated_at)
         VALUES (?, ?, 'exercise_set', 'hash-corrotto', 1, 'local-model-test', 'stato-inventato', NULL, NULL, datetime('now'), datetime('now'))`,
      )
      .run("corrupt-row-id", lessonId);

    const all = LessonAiGenerationsRepo.listGenerationsForLesson(db, lessonId, "exercise_set");
    expect(all).toHaveLength(1);
    expect(all[0]?.sourceContentHash).toBe("hash-a");
  });

  it("listGenerationsForLesson filtra per kind e ordina dal più recente", () => {
    LessonAiGenerationsRepo.saveExerciseSet(db, {
      status: "ready",
      lessonId,
      sourceContentHash: "hash-a",
      model: "local-model-test",
      payload: VALID_EXERCISE_SET,
    });
    LessonAiGenerationsRepo.savePresentation(db, {
      status: "ready",
      lessonId,
      sourceContentHash: "hash-c",
      model: "local-model-test",
      payload: VALID_PRESENTATION,
    });

    const onlyExercises = LessonAiGenerationsRepo.listGenerationsForLesson(
      db,
      lessonId,
      "exercise_set",
    );
    expect(onlyExercises).toHaveLength(1);
    expect(onlyExercises[0]?.kind).toBe("exercise_set");

    const everything = LessonAiGenerationsRepo.listGenerationsForLesson(db, lessonId);
    expect(everything).toHaveLength(2);
  });
});
