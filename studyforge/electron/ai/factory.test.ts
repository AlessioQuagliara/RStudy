import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../db/schema";
import { cloudAiUsageDaily } from "../db/schema";
import { updateSettings } from "../services/settingsService";
import { createAiClient } from "./factory";

const ENV_KEYS = [
  "RSTUDY_CLOUD_API_KEY",
  "RSTUDY_CLOUD_BASE_URL",
  "RSTUDY_CLOUD_MODEL",
  "CLOUD_AI_DAILY_USAGE_LIMIT",
] as const;

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db;
}

function setCloudEnv() {
  process.env.RSTUDY_CLOUD_API_KEY = "test-key";
  process.env.RSTUDY_CLOUD_BASE_URL = "https://example.invalid/v1";
  process.env.RSTUDY_CLOUD_MODEL = "test-model";
}

describe("factory: provider cloud centralizzato + limite giornaliero", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    vi.unstubAllGlobals();
  });

  it("createAiClient lancia un errore 'safe' (nessun nome di variabile) se il cloud non ha credenziali in env", async () => {
    const db = createTestDb();
    updateSettings(db, { aiProvider: "cloud" });

    await expect(createAiClient(db)).rejects.toThrow("Provider AI cloud non disponibile in questa build.");
  });

  it("il client cloud consuma il budget PRIMA di ogni fetch reale e blocca senza chiamare fetch oltre il limite", async () => {
    setCloudEnv();
    process.env.CLOUD_AI_DAILY_USAGE_LIMIT = "1";
    const db = createTestDb();
    updateSettings(db, { aiProvider: "cloud" });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = await createAiClient(db);
    await client.chatText([{ role: "user", content: "ciao" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(client.chatText([{ role: "user", content: "ciao ancora" }])).rejects.toThrow(
      /limite giornaliero/i,
    );
    // Il secondo tentativo non deve MAI arrivare alla fetch reale: il controllo avviene prima.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("con provider locale non viene mai scritta alcuna riga in cloud_ai_usage_daily", async () => {
    const db = createTestDb();
    updateSettings(db, { aiProvider: "local" });

    await expect(createAiClient(db)).rejects.toThrow(/modello ai locale/i);
    expect(db.select().from(cloudAiUsageDaily).all()).toHaveLength(0);
  });
});
