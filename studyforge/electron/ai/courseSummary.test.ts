import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { CoursesRepo } from "../db/repositories";
import { CloudAiDailyLimitReachedError } from "../services/cloudUsageService";
import { generateCourseSummary } from "./courseSummary";
import type { ChatJsonClient } from "./openAiCompatibleStudyGenerator";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db;
}

describe("generateCourseSummary", () => {
  it("un client che lancia CloudAiDailyLimitReachedError propaga il messaggio sicuro senza crash", async () => {
    const db = createTestDb();
    const course = CoursesRepo.create(db, { title: "Analisi 1", cfu: 9 });

    const client: ChatJsonClient = {
      chatJSON: () => Promise.reject(new CloudAiDailyLimitReachedError(35)),
    };

    await expect(generateCourseSummary(db, client, course.id)).rejects.toThrow(/limite giornaliero/i);
  });
});
