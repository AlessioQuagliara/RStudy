import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../db/schema";
import { CoursesRepo, LessonsRepo, StudySessionGenerationsRepo } from "../db/repositories";

const tmpUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "rstudy-test-userdata-"));

vi.mock("electron", () => ({
  app: { getPath: () => tmpUserDataDir },
}));

const { renderStudySessionPdf, sanitizeStudySessionFileName } = vi.hoisted(() => ({
  renderStudySessionPdf: vi.fn().mockResolvedValue(1234),
  sanitizeStudySessionFileName: vi.fn().mockReturnValue("test-sessione-studio.pdf"),
}));
vi.mock("../ai/studySession/pdfRenderer", () => ({ renderStudySessionPdf, sanitizeStudySessionFileName }));

const { createAiClientForStudySession } = vi.hoisted(() => ({ createAiClientForStudySession: vi.fn() }));
vi.mock("../ai/factory", () => ({ createAiClientForStudySession }));

// Import dopo i mock: studySessionService importa (indirettamente) electron/pdfRenderer/factory a livello di modulo.
const { generateStudySession, getStudySessionStatus, recoverStaleStudySessionJobs } = await import(
  "./studySessionService"
);

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db;
}

function seedCourseWithOneValidLesson(db: ReturnType<typeof createTestDb>) {
  const course = CoursesRepo.create(db, { title: "Analisi 1", cfu: 9 });
  const lesson = LessonsRepo.create(db, { courseId: course.id, lessonNumber: 1, title: "Limiti" });
  LessonsRepo.saveNotes(db, { id: lesson.id, notesJson: "{}", notesPlainText: "Appunti sufficienti per generare." });
  return course;
}

describe("studySessionService", () => {
  beforeEach(() => {
    createAiClientForStudySession.mockReset();
    renderStudySessionPdf.mockClear();
    createAiClientForStudySession.mockResolvedValue({ chatJSON: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rifiuta con no_valid_lessons se il corso non ha lezioni elaborabili", async () => {
    const db = createTestDb();
    const course = CoursesRepo.create(db, { title: "Corso vuoto", cfu: 6 });

    const outcome = await generateStudySession(db, course.id);
    expect(outcome).toMatchObject({ status: "rejected", code: "no_valid_lessons" });
  });

  it("rifiuta con already_running se esiste già un job attivo per il corso", async () => {
    const db = createTestDb();
    const course = seedCourseWithOneValidLesson(db);
    StudySessionGenerationsRepo.create(db, { courseId: course.id, sourceContentVersionHash: "h", sourceLessonsCount: 1 });

    const outcome = await generateStudySession(db, course.id);
    expect(outcome).toMatchObject({ status: "rejected", code: "already_running" });
  });

  it("rifiuta con too_soon se l'ultima generazione riuscita è troppo recente", async () => {
    process.env.CLOUD_STUDY_SESSION_MIN_INTERVAL_HOURS = "24";
    const db = createTestDb();
    const course = seedCourseWithOneValidLesson(db);
    const row = StudySessionGenerationsRepo.create(db, { courseId: course.id, sourceContentVersionHash: "h", sourceLessonsCount: 1 });
    StudySessionGenerationsRepo.markReady(db, row.id, { pdfPath: "/tmp/x.pdf", pdfFileName: "x.pdf", pdfFileSize: 100 });

    const outcome = await generateStudySession(db, course.id);
    expect(outcome).toMatchObject({ status: "rejected", code: "too_soon" });
    delete process.env.CLOUD_STUDY_SESSION_MIN_INTERVAL_HOURS;
  });

  it("accetta, crea una riga 'queued' e la porta a 'ready' in background", async () => {
    const db = createTestDb();
    const course = seedCourseWithOneValidLesson(db);
    createAiClientForStudySession.mockResolvedValue({
      chatJSON: vi.fn().mockImplementation((messages: Array<{ role: string; content: string }>) => {
        const userContent = messages.find((m) => m.role === "user")?.content ?? "";
        // Risposta minima valida per qualunque fase, dedotta dal contenuto del prompt.
        if (userContent.includes("Numeri di lezione disponibili")) {
          return Promise.resolve(
            JSON.stringify({ book_title: "Libro", chapters: [{ title: "Cap 1", lesson_numbers: [1] }], glossary: [], exam_prep_tips: [] }),
          );
        }
        if (userContent.includes("Capitolo da scrivere")) {
          return Promise.resolve(JSON.stringify({ chapter_markdown: "# Cap 1\ncontenuto" }));
        }
        if (userContent.includes("Capitolo da revisionare")) {
          return Promise.resolve(JSON.stringify({ reviewed_markdown: "# Cap 1\ncontenuto rivisto" }));
        }
        return Promise.resolve(JSON.stringify({ topics: [], key_concepts: [], difficulty: "easy" }));
      }),
    });

    const outcome = await generateStudySession(db, course.id);
    expect(outcome.status).toBe("started");

    // Il job gira "fire-and-forget": attende la sua conclusione prima di ispezionare lo stato.
    await vi.waitFor(() => {
      const status = getStudySessionStatus(db, course.id);
      expect(status?.status).toBe("ready");
    });

    expect(renderStudySessionPdf).toHaveBeenCalledOnce();
    const status = getStudySessionStatus(db, course.id);
    expect(status?.progressPercentage).toBe(100);
    expect(status?.pdfFileName).toBe("test-sessione-studio.pdf");
  });

  it("un fallimento della pipeline marca la riga 'failed' e NON tocca un PDF precedente già pronto", async () => {
    const db = createTestDb();
    const course = seedCourseWithOneValidLesson(db);

    // Prima generazione: già pronta da 48h, fuori dalla finestra min-interval di default (24h).
    const readyRow = StudySessionGenerationsRepo.create(db, { courseId: course.id, sourceContentVersionHash: "old", sourceLessonsCount: 1 });
    StudySessionGenerationsRepo.markReady(db, readyRow.id, { pdfPath: "/tmp/precedente.pdf", pdfFileName: "precedente.pdf", pdfFileSize: 999 });
    db.update(schema.studySessionGenerations)
      .set({ createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() })
      .where(eq(schema.studySessionGenerations.id, readyRow.id))
      .run();

    createAiClientForStudySession.mockResolvedValue({
      chatJSON: vi.fn().mockRejectedValue(new Error("provider non raggiungibile")),
    });

    const outcome = await generateStudySession(db, course.id);
    expect(outcome.status).toBe("started");

    await vi.waitFor(() => {
      const latest = StudySessionGenerationsRepo.getLatestForCourse(db, course.id);
      expect(latest?.status).toBe("failed");
    });

    // Il PDF precedente resta l'ultimo "ready": il download continuerebbe a puntare a quello.
    const latestReady = StudySessionGenerationsRepo.getLatestReadyForCourse(db, course.id);
    expect(latestReady?.pdfFileName).toBe("precedente.pdf");
  });

  it("recoverStaleStudySessionJobs marca 'failed' i job rimasti queued/running", () => {
    const db = createTestDb();
    const course = seedCourseWithOneValidLesson(db);
    const row = StudySessionGenerationsRepo.create(db, { courseId: course.id, sourceContentVersionHash: "h", sourceLessonsCount: 1 });
    expect(StudySessionGenerationsRepo.get(db, row.id)?.status).toBe("queued");

    recoverStaleStudySessionJobs(db);

    expect(StudySessionGenerationsRepo.get(db, row.id)?.status).toBe("failed");
    // Lo slot torna libero: una nuova generazione può ripartire.
    expect(StudySessionGenerationsRepo.getActiveForCourse(db, course.id)).toBeNull();
  });
});
