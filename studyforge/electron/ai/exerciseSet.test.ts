import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../db/schema";
import { CoursesRepo, LessonsRepo, LessonAiGenerationsRepo } from "../db/repositories";
import { generateLessonExerciseSet } from "./exerciseSet";
import type { AiStudyGenerator } from "./studyGenerator";
import type { StudyGeneratorHandle } from "./factory";
import type {
  ExerciseSet,
  ExerciseSetGenerationResult,
  GenerateLessonExercisesInput,
} from "../shared/schemas";

// Stesso pattern di electron/db/repositories.test.ts: DB SQLite in-memory con
// le migrazioni reali applicate, risolte da cwd (repo root sotto `pnpm test`),
// non da __dirname/import.meta.url (vedi electron/db/migrate.ts).
function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db;
}

const VALID_EXERCISE_SET: ExerciseSet = {
  version: 1,
  sourceLessonId: "will-be-overwritten",
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
      difficulty: 1,
    },
    {
      type: "open_answer",
      id: "ex-2",
      question: "Cos'è un puntatore?",
      acceptedAnswers: ["Una variabile che contiene un indirizzo di memoria"],
      explanation: "I puntatori memorizzano indirizzi, non valori diretti.",
      difficulty: 2,
    },
    {
      type: "coding_challenge",
      id: "ex-3",
      question: "Scrivi una funzione che somma due numeri.",
      language: "typescript",
      starterCode: "",
      expectedSolution: "function sum(a: number, b: number) { return a + b; }",
      explanation: "La somma è l'operazione base richiesta.",
      difficulty: 3,
    },
  ],
};

/** Fake AiStudyGenerator: nessuna chiamata di rete, esito configurabile per test. */
class FakeAiStudyGenerator implements AiStudyGenerator {
  public callCount = 0;
  constructor(private readonly result: ExerciseSetGenerationResult) {}

  generateExerciseSet(): Promise<ExerciseSetGenerationResult> {
    this.callCount++;
    return Promise.resolve(this.result);
  }

  generatePresentation(): Promise<never> {
    throw new Error("non usato in questi test");
  }
}

/** Come FakeAiStudyGenerator, ma risolve solo quando `release()` viene chiamato: per testare il dedup in-flight. */
class GatedAiStudyGenerator implements AiStudyGenerator {
  public callCount = 0;
  private release: (() => void) | null = null;
  constructor(private readonly result: ExerciseSetGenerationResult) {}

  generateExerciseSet(): Promise<ExerciseSetGenerationResult> {
    this.callCount++;
    return new Promise((resolve) => {
      this.release = () => resolve(this.result);
    });
  }

  generatePresentation(): Promise<never> {
    throw new Error("non usato in questi test");
  }

  releaseOne(): void {
    this.release?.();
    this.release = null;
  }
}

function handleFor(generator: AiStudyGenerator, model = "fake-model"): StudyGeneratorHandle {
  return { generator, model };
}

describe("generateLessonExerciseSet", () => {
  let db: ReturnType<typeof createTestDb>;
  let lessonId: string;
  let baseInput: GenerateLessonExercisesInput;

  beforeEach(() => {
    db = createTestDb();
    const course = CoursesRepo.create(db, { title: "Analisi 1", cfu: 9 });
    const lesson = LessonsRepo.create(db, {
      courseId: course.id,
      lessonNumber: 1,
      title: "Limiti",
    });
    LessonsRepo.saveNotes(db, {
      id: lesson.id,
      notesJson: "{}",
      notesPlainText: "I limiti descrivono il comportamento di una funzione vicino a un punto.",
    });
    lessonId = lesson.id;
    baseInput = { lessonId, requestedCount: 3, locale: "it-IT" };
  });

  it("cache miss: chiama il provider, salva 'ready' e restituisce fromCache:false", async () => {
    const generator = new FakeAiStudyGenerator({
      status: "success",
      data: { ...VALID_EXERCISE_SET, sourceLessonId: lessonId },
    });

    const outcome = await generateLessonExerciseSet(db, handleFor(generator), baseInput);

    expect(outcome.fromCache).toBe(false);
    expect(outcome.status).toBe("success");
    expect(generator.callCount).toBe(1);

    const saved = LessonAiGenerationsRepo.listGenerationsForLesson(db, lessonId, "exercise_set");
    expect(saved).toHaveLength(1);
    expect(saved[0]?.status).toBe("ready");
  });

  it("cache hit: una seconda chiamata con lo stesso contenuto non richiama il provider", async () => {
    const generator = new FakeAiStudyGenerator({
      status: "success",
      data: { ...VALID_EXERCISE_SET, sourceLessonId: lessonId },
    });

    const first = await generateLessonExerciseSet(db, handleFor(generator), baseInput);
    const second = await generateLessonExerciseSet(db, handleFor(generator), baseInput);

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.status).toBe("success");
    expect(generator.callCount).toBe(1); // il provider è stato chiamato una sola volta

    const saved = LessonAiGenerationsRepo.listGenerationsForLesson(db, lessonId, "exercise_set");
    expect(saved).toHaveLength(1); // nessuna riga duplicata
  });

  it("appunti diversi (hash diverso) -> cache miss anche con la stessa lezione", async () => {
    const generator = new FakeAiStudyGenerator({
      status: "success",
      data: { ...VALID_EXERCISE_SET, sourceLessonId: lessonId },
    });

    await generateLessonExerciseSet(db, handleFor(generator), baseInput);

    LessonsRepo.saveNotes(db, {
      id: lessonId,
      notesJson: "{}",
      notesPlainText: "Testo completamente diverso sugli integrali.",
    });
    const second = await generateLessonExerciseSet(db, handleFor(generator), baseInput);

    expect(second.fromCache).toBe(false);
    expect(generator.callCount).toBe(2);
  });

  it("JSON non valido dal provider: salva 'failed' con messaggio sanificato e restituisce fromCache:false", async () => {
    const generator = new FakeAiStudyGenerator({
      status: "error",
      error: {
        code: "invalid_response",
        message: "Il provider AI ha restituito una risposta non valida. Riprova.",
      },
    });

    const outcome = await generateLessonExerciseSet(db, handleFor(generator), baseInput);

    expect(outcome.status).toBe("error");
    expect(outcome.fromCache).toBe(false);
    if (outcome.status === "error") {
      expect(outcome.error.code).toBe("invalid_response");
    }

    const saved = LessonAiGenerationsRepo.listGenerationsForLesson(db, lessonId, "exercise_set");
    expect(saved).toHaveLength(1);
    expect(saved[0]?.status).toBe("failed");
    expect(saved[0]?.payloadJson).toBeNull();
  });

  it("timeout del provider: salva 'failed' e non va in cache (un retry successivo richiama il provider)", async () => {
    const timeoutGenerator = new FakeAiStudyGenerator({
      status: "error",
      error: {
        code: "timeout",
        message: "Il provider AI non ha risposto in tempo. Riprova tra qualche istante.",
      },
    });

    const first = await generateLessonExerciseSet(db, handleFor(timeoutGenerator), baseInput);
    expect(first.status).toBe("error");
    if (first.status === "error") {
      expect(first.error.code).toBe("timeout");
    }

    const successGenerator = new FakeAiStudyGenerator({
      status: "success",
      data: { ...VALID_EXERCISE_SET, sourceLessonId: lessonId },
    });
    const retry = await generateLessonExerciseSet(db, handleFor(successGenerator), baseInput);

    expect(retry.fromCache).toBe(false); // il tentativo fallito non ha prodotto una cache valida
    expect(successGenerator.callCount).toBe(1);
    expect(retry.status).toBe("success");
  });

  it("assenza di configurazione API (handle null): errore not_configured, nessuna chiamata al provider", async () => {
    const outcome = await generateLessonExerciseSet(db, null, baseInput);

    expect(outcome.status).toBe("error");
    expect(outcome.fromCache).toBe(false);
    if (outcome.status === "error") {
      expect(outcome.error.code).toBe("not_configured");
    }
    expect(
      LessonAiGenerationsRepo.listGenerationsForLesson(db, lessonId, "exercise_set"),
    ).toHaveLength(0);
  });

  it("assenza di configurazione API ma con una generazione già in cache: la restituisce comunque", async () => {
    const generator = new FakeAiStudyGenerator({
      status: "success",
      data: { ...VALID_EXERCISE_SET, sourceLessonId: lessonId },
    });
    await generateLessonExerciseSet(db, handleFor(generator), baseInput);

    const outcomeWithoutHandle = await generateLessonExerciseSet(db, null, baseInput);

    expect(outcomeWithoutHandle.fromCache).toBe(true);
    expect(outcomeWithoutHandle.status).toBe("success");
  });

  it("lessonId inesistente: errore not_found, nessuna chiamata al provider", async () => {
    const generator = new FakeAiStudyGenerator({
      status: "success",
      data: VALID_EXERCISE_SET,
    });

    const outcome = await generateLessonExerciseSet(db, handleFor(generator), {
      lessonId: "lezione-mai-esistita",
      requestedCount: 3,
      locale: "it-IT",
    });

    expect(outcome.status).toBe("error");
    if (outcome.status === "error") {
      expect(outcome.error.code).toBe("not_found");
    }
    expect(generator.callCount).toBe(0);
  });

  it("due richieste concorrenti per lo stesso lessonId+contenuto: la seconda riusa la stessa generazione in-flight", async () => {
    const generator = new GatedAiStudyGenerator({
      status: "success",
      data: { ...VALID_EXERCISE_SET, sourceLessonId: lessonId },
    });

    const first = generateLessonExerciseSet(db, handleFor(generator), baseInput);
    const second = generateLessonExerciseSet(db, handleFor(generator), baseInput);

    generator.releaseOne();
    const [firstOutcome, secondOutcome] = await Promise.all([first, second]);

    expect(generator.callCount).toBe(1); // una sola chiamata al provider per le due richieste concorrenti
    expect(firstOutcome.status).toBe("success");
    expect(secondOutcome.status).toBe("success");
    expect(firstOutcome.fromCache).toBe(false);
    expect(secondOutcome.fromCache).toBe(false); // stessa promise, non una cache DB

    const saved = LessonAiGenerationsRepo.listGenerationsForLesson(db, lessonId, "exercise_set");
    expect(saved).toHaveLength(1); // nessuna riga duplicata dalla corsa
  });

  it("non logga mai il testo completo degli appunti né il payload generato", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const marker = "TESTO-APPUNTI-NON-DEVE-COMPARIRE-NEI-LOG";

    LessonsRepo.saveNotes(db, { id: lessonId, notesJson: "{}", notesPlainText: marker });
    const generator = new FakeAiStudyGenerator({
      status: "success",
      data: { ...VALID_EXERCISE_SET, sourceLessonId: lessonId, title: marker },
    });

    await generateLessonExerciseSet(db, handleFor(generator), baseInput);

    const allLoggedText = [...logSpy.mock.calls, ...warnSpy.mock.calls].flat().join(" ");
    expect(allLoggedText).not.toContain(marker);

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
