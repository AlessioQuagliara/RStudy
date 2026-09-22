import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { CoursesRepo, LessonsRepo, LessonAiOutputsRepo } from "../../db/repositories";
import { collectCourseContent } from "./contentCollector";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db;
}

describe("collectCourseContent", () => {
  it("ritorna null se il corso non esiste", () => {
    const db = createTestDb();
    expect(collectCourseContent(db, "non-esiste")).toBeNull();
  });

  it("ritorna null se il corso non ha nessuna lezione con contenuto (né riepilogo AI né appunti)", () => {
    const db = createTestDb();
    const course = CoursesRepo.create(db, { title: "Analisi 1", cfu: 9 });
    LessonsRepo.create(db, { courseId: course.id, lessonNumber: 1, title: "Limiti" });
    expect(collectCourseContent(db, course.id)).toBeNull();
  });

  it("include solo le lezioni con testo utile, preferendo il riepilogo AI agli appunti grezzi", () => {
    const db = createTestDb();
    const course = CoursesRepo.create(db, { title: "Analisi 1", cfu: 9 });
    const lessonWithAi = LessonsRepo.create(db, { courseId: course.id, lessonNumber: 1, title: "Limiti" });
    const lessonWithNotesOnly = LessonsRepo.create(db, { courseId: course.id, lessonNumber: 2, title: "Derivate" });
    LessonsRepo.create(db, { courseId: course.id, lessonNumber: 3, title: "Lezione vuota" });

    LessonAiOutputsRepo.upsert(db, {
      lessonId: lessonWithAi.id,
      summaryMarkdown: "Riepilogo AI sui limiti.",
      keyPointsJson: "[]",
      studyOutlineJson: "[]",
      mermaidDiagram: "",
      selfCheckQuestionsJson: "[]",
      model: "test-model",
      promptVersion: "1",
    });
    LessonsRepo.saveNotes(db, { id: lessonWithNotesOnly.id, notesJson: "{}", notesPlainText: "Appunti sulle derivate." });

    const result = collectCourseContent(db, course.id);
    expect(result).not.toBeNull();
    expect(result?.lessons).toHaveLength(2);
    expect(result?.lessons.find((l) => l.lessonNumber === 1)?.text).toBe("Riepilogo AI sui limiti.");
    expect(result?.lessons.find((l) => l.lessonNumber === 2)?.text).toBe("Appunti sulle derivate.");
    expect(result?.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("l'hash cambia se il contenuto cambia", () => {
    const db = createTestDb();
    const course = CoursesRepo.create(db, { title: "Analisi 1", cfu: 9 });
    const lesson = LessonsRepo.create(db, { courseId: course.id, lessonNumber: 1, title: "Limiti" });
    LessonsRepo.saveNotes(db, { id: lesson.id, notesJson: "{}", notesPlainText: "Prima versione." });
    const first = collectCourseContent(db, course.id);

    LessonsRepo.saveNotes(db, { id: lesson.id, notesJson: "{}", notesPlainText: "Seconda versione, diversa." });
    const second = collectCourseContent(db, course.id);

    expect(first?.contentHash).not.toBe(second?.contentHash);
  });
});
