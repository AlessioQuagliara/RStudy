import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { CoursesRepo, LessonsRepo } from "../db/repositories";
import { CloudAiDailyLimitReachedError } from "../services/cloudUsageService";
import { generateLessonStudyPack } from "./studyPack";
import type { ChatJsonClient } from "./openAiCompatibleStudyGenerator";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db;
}

describe("generateLessonStudyPack", () => {
  it("un client che lancia CloudAiDailyLimitReachedError fa fallire la generazione e porta aiStatus a 'failed'", async () => {
    const db = createTestDb();
    const course = CoursesRepo.create(db, { title: "Analisi 1", cfu: 9 });
    const lesson = LessonsRepo.create(db, { courseId: course.id, lessonNumber: 1, title: "Limiti" });

    const client: ChatJsonClient = {
      chatJSON: () => Promise.reject(new CloudAiDailyLimitReachedError(35)),
    };

    await expect(generateLessonStudyPack(db, client, "fake-model", lesson.id)).rejects.toThrow(
      /limite giornaliero/i,
    );

    expect(LessonsRepo.get(db, lesson.id)?.aiStatus).toBe("failed");
  });
});
