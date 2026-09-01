import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { CoursesRepo, LessonsRepo, LessonAiGenerationsRepo } from "../db/repositories";
import { generateLessonPresentation } from "./presentation";
import type { AiStudyGenerator } from "./studyGenerator";
import type { StudyGeneratorHandle } from "./factory";
import type {
  Presentation,
  PresentationGenerationResult,
  GenerateLessonPresentationInput,
} from "../shared/schemas";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db;
}

const VALID_PRESENTATION: Presentation = {
  version: 1,
  sourceLessonId: "will-be-overwritten",
  title: "Ripasso lezione",
  generatedAt: new Date("2026-01-01T10:00:00.000Z").toISOString(),
  slides: [
    { id: "s1", type: "title", title: "Titolo", bullets: [] },
    { id: "s2", type: "content", title: "Contenuto", bullets: ["punto 1"] },
    { id: "s3", type: "summary", title: "Riepilogo", bullets: ["punto finale"] },
  ],
};

class FakeAiStudyGenerator implements AiStudyGenerator {
  public callCount = 0;
  constructor(private readonly result: PresentationGenerationResult) {}

  generateExerciseSet(): Promise<never> {
    throw new Error("non usato in questi test");
  }

  generatePresentation(): Promise<PresentationGenerationResult> {
    this.callCount++;
    return Promise.resolve(this.result);
  }
}

class GatedAiStudyGenerator implements AiStudyGenerator {
  public callCount = 0;
  private release: (() => void) | null = null;
  constructor(private readonly result: PresentationGenerationResult) {}

  generateExerciseSet(): Promise<never> {
    throw new Error("non usato in questi test");
  }

  generatePresentation(): Promise<PresentationGenerationResult> {
    this.callCount++;
    return new Promise((resolve) => {
      this.release = () => resolve(this.result);
    });
  }

  releaseOne(): void {
    this.release?.();
    this.release = null;
  }
}

function handleFor(generator: AiStudyGenerator, model = "fake-model"): StudyGeneratorHandle {
  return { generator, model };
}

describe("generateLessonPresentation", () => {
  let db: ReturnType<typeof createTestDb>;
  let lessonId: string;
  let baseInput: GenerateLessonPresentationInput;

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
    baseInput = { lessonId, requestedCount: 6, locale: "it-IT" };
  });

  it("cache miss: chiama il provider, salva 'ready' e restituisce fromCache:false", async () => {
    const generator = new FakeAiStudyGenerator({
      status: "success",
      data: { ...VALID_PRESENTATION, sourceLessonId: lessonId },
    });

    const outcome = await generateLessonPresentation(db, handleFor(generator), baseInput);

    expect(outcome.fromCache).toBe(false);
    expect(outcome.status).toBe("success");
    expect(generator.callCount).toBe(1);

    const saved = LessonAiGenerationsRepo.listGenerationsForLesson(db, lessonId, "presentation");
    expect(saved).toHaveLength(1);
    expect(saved[0]?.status).toBe("ready");
  });

  it("cache hit: una seconda chiamata con lo stesso contenuto non richiama il provider", async () => {
    const generator = new FakeAiStudyGenerator({
      status: "success",
      data: { ...VALID_PRESENTATION, sourceLessonId: lessonId },
    });

    const first = await generateLessonPresentation(db, handleFor(generator), baseInput);
    const second = await generateLessonPresentation(db, handleFor(generator), baseInput);

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(generator.callCount).toBe(1);
  });

  it("JSON non valido dal provider: salva 'failed' e restituisce fromCache:false", async () => {
    const generator = new FakeAiStudyGenerator({
      status: "error",
      error: {
        code: "invalid_response",
        message: "Il provider AI ha restituito una risposta non valida. Riprova.",
      },
    });

    const outcome = await generateLessonPresentation(db, handleFor(generator), baseInput);

    expect(outcome.status).toBe("error");
    expect(outcome.fromCache).toBe(false);

    const saved = LessonAiGenerationsRepo.listGenerationsForLesson(db, lessonId, "presentation");
    expect(saved[0]?.status).toBe("failed");
    expect(saved[0]?.payloadJson).toBeNull();
  });

  it("timeout del provider: fromCache false, non inquina la cache", async () => {
    const timeoutGenerator = new FakeAiStudyGenerator({
      status: "error",
      error: {
        code: "timeout",
        message: "Il provider AI non ha risposto in tempo. Riprova tra qualche istante.",
      },
    });

    const first = await generateLessonPresentation(db, handleFor(timeoutGenerator), baseInput);
    expect(first.status).toBe("error");

    const successGenerator = new FakeAiStudyGenerator({
      status: "success",
      data: { ...VALID_PRESENTATION, sourceLessonId: lessonId },
    });
    const retry = await generateLessonPresentation(db, handleFor(successGenerator), baseInput);
    expect(retry.fromCache).toBe(false);
    expect(retry.status).toBe("success");
  });

  it("assenza di configurazione API (handle null): errore not_configured, nessuna chiamata al provider", async () => {
    const outcome = await generateLessonPresentation(db, null, baseInput);

    expect(outcome.status).toBe("error");
    expect(outcome.fromCache).toBe(false);
    if (outcome.status === "error") {
      expect(outcome.error.code).toBe("not_configured");
    }
    expect(
      LessonAiGenerationsRepo.listGenerationsForLesson(db, lessonId, "presentation"),
    ).toHaveLength(0);
  });

  it("lessonId inesistente: errore not_found, nessuna chiamata al provider", async () => {
    const generator = new FakeAiStudyGenerator({ status: "success", data: VALID_PRESENTATION });

    const outcome = await generateLessonPresentation(db, handleFor(generator), {
      lessonId: "lezione-mai-esistita",
      requestedCount: 6,
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
      data: { ...VALID_PRESENTATION, sourceLessonId: lessonId },
    });

    const first = generateLessonPresentation(db, handleFor(generator), baseInput);
    const second = generateLessonPresentation(db, handleFor(generator), baseInput);

    generator.releaseOne();
    const [firstOutcome, secondOutcome] = await Promise.all([first, second]);

    expect(generator.callCount).toBe(1);
    expect(firstOutcome.status).toBe("success");
    expect(secondOutcome.status).toBe("success");

    const saved = LessonAiGenerationsRepo.listGenerationsForLesson(db, lessonId, "presentation");
    expect(saved).toHaveLength(1);
  });

  it("presentazione e set di esercizi con lo stesso hash non si confondono (kind diversi)", async () => {
    const generator = new FakeAiStudyGenerator({
      status: "success",
      data: { ...VALID_PRESENTATION, sourceLessonId: lessonId },
    });
    await generateLessonPresentation(db, handleFor(generator), baseInput);

    const cachedAsExerciseSet = LessonAiGenerationsRepo.findCachedGeneration(db, {
      lessonId,
      kind: "exercise_set",
      sourceContentHash: LessonAiGenerationsRepo.listGenerationsForLesson(
        db,
        lessonId,
        "presentation",
      )[0]!.sourceContentHash,
    });
    expect(cachedAsExerciseSet).toBeNull();
  });
});
