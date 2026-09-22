import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../db/schema";
import {
  CloudAiDailyLimitReachedError,
  currentUsageDateRome,
  getTodayUsage,
  reserveCloudAiCall,
} from "./cloudUsageService";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db;
}

describe("cloudUsageService", () => {
  beforeEach(() => {
    process.env.CLOUD_AI_DAILY_USAGE_LIMIT = "3";
  });

  afterEach(() => {
    delete process.env.CLOUD_AI_DAILY_USAGE_LIMIT;
    vi.useRealTimers();
  });

  it("accetta fino al limite e poi rifiuta senza scrivere oltre", () => {
    const db = createTestDb();
    reserveCloudAiCall(db, "general_ai");
    reserveCloudAiCall(db, "general_ai");
    reserveCloudAiCall(db, "general_ai");

    expect(() => reserveCloudAiCall(db, "general_ai")).toThrow(CloudAiDailyLimitReachedError);

    const usage = getTodayUsage(db);
    expect(usage.used).toBe(3);
    expect(usage.limit).toBe(3);
    expect(usage.remaining).toBe(0);
    expect(usage.percentage).toBe(100);
  });

  it("somma le categorie general_ai e dictation nello stesso budget condiviso", () => {
    const db = createTestDb();
    reserveCloudAiCall(db, "general_ai");
    reserveCloudAiCall(db, "dictation");
    expect(getTodayUsage(db).used).toBe(2);

    reserveCloudAiCall(db, "dictation");
    expect(() => reserveCloudAiCall(db, "general_ai")).toThrow(CloudAiDailyLimitReachedError);
  });

  it("usa il default 35 se la variabile d'ambiente è assente o non numerica", () => {
    delete process.env.CLOUD_AI_DAILY_USAGE_LIMIT;
    const db = createTestDb();
    expect(getTodayUsage(db).limit).toBe(35);

    process.env.CLOUD_AI_DAILY_USAGE_LIMIT = "not-a-number";
    expect(getTodayUsage(db).limit).toBe(35);
  });

  it("currentUsageDateRome calcola correttamente il giorno italiano sia in CET (gennaio) sia in CEST (luglio)", () => {
    // 31 gennaio 23:30 UTC = 1 febbraio 00:30 CET (+1h): il giorno italiano è già "dopo".
    expect(currentUsageDateRome(new Date("2026-01-31T23:30:00.000Z"))).toBe("2026-02-01");
    // 31 luglio 22:30 UTC = 1 agosto 00:30 CEST (+2h): stesso principio, offset diverso.
    expect(currentUsageDateRome(new Date("2026-07-31T22:30:00.000Z"))).toBe("2026-08-01");
    // Un orario "di giorno" in UTC che è ancora lo stesso giorno in entrambi i fusi.
    expect(currentUsageDateRome(new Date("2026-03-15T10:00:00.000Z"))).toBe("2026-03-15");
  });

  it("il limite si sblocca il giorno dopo (fuso Europe/Rome)", () => {
    const db = createTestDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T10:00:00.000Z")); // stesso giorno in UTC e Roma

    reserveCloudAiCall(db, "general_ai");
    reserveCloudAiCall(db, "general_ai");
    reserveCloudAiCall(db, "general_ai");
    expect(() => reserveCloudAiCall(db, "general_ai")).toThrow(CloudAiDailyLimitReachedError);

    vi.setSystemTime(new Date("2026-03-16T10:00:00.000Z")); // giorno dopo
    expect(() => reserveCloudAiCall(db, "general_ai")).not.toThrow();
    expect(getTodayUsage(db).used).toBe(1);
  });

  it("con N richieste concorrenti > limite, accetta esattamente `limite` richieste (atomicità)", async () => {
    const db = createTestDb();
    const attempts = 10; // > limite (3)
    const results = await Promise.all(
      Array.from({ length: attempts }, () =>
        Promise.resolve().then(() => {
          try {
            reserveCloudAiCall(db, "general_ai");
            return true;
          } catch {
            return false;
          }
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(3);
    expect(getTodayUsage(db).used).toBe(3);
  });
});
