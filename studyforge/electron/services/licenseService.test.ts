import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../db/schema";

const { fetchPaddleTransaction } = vi.hoisted(() => ({ fetchPaddleTransaction: vi.fn() }));
vi.mock("./paddleClient", () => ({ fetchPaddleTransaction }));

// Import dopo il mock: licenseService importa paddleClient a livello di modulo.
const { getLicenseStatus, activateLicense } = await import("./licenseService");

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  return db;
}

describe("licenseService", () => {
  beforeEach(() => {
    fetchPaddleTransaction.mockReset();
    delete process.env.PADDLE_PRICE_ID;
  });

  it("getLicenseStatus ritorna activated=false se non c'è nessuna riga", () => {
    const db = createTestDb();
    expect(getLicenseStatus(db)).toEqual({
      activated: false,
      licenseKey: null,
      purchasedAt: null,
      activatedAt: null,
      updatesValidUntil: null,
      updatesIncluded: false,
    });
  });

  it("activateLicense rifiuta una transazione non completata", async () => {
    const db = createTestDb();
    fetchPaddleTransaction.mockResolvedValue({
      id: "txn_1",
      status: "draft",
      createdAt: "2026-01-01T00:00:00.000Z",
      priceIds: [],
    });

    await expect(activateLicense(db, "txn_1")).rejects.toThrow(/non risulta completata/);
    expect(getLicenseStatus(db).activated).toBe(false);
  });

  it("activateLicense rifiuta un price ID diverso da quello atteso", async () => {
    process.env.PADDLE_PRICE_ID = "pri_expected";
    const db = createTestDb();
    fetchPaddleTransaction.mockResolvedValue({
      id: "txn_2",
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
      priceIds: ["pri_other"],
    });

    await expect(activateLicense(db, "txn_2")).rejects.toThrow(/non corrisponde/);
  });

  it("activateLicense salva la licenza e calcola updatesValidUntil a +365 giorni", async () => {
    const db = createTestDb();
    fetchPaddleTransaction.mockResolvedValue({
      id: "txn_3",
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
      priceIds: ["pri_any"],
    });

    const status = await activateLicense(db, "txn_3");
    expect(status.activated).toBe(true);
    expect(status.licenseKey).toBe("txn_3");
    expect(status.purchasedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(status.updatesValidUntil?.slice(0, 10)).toBe("2027-01-01");
    expect(status.updatesIncluded).toBe(true);
  });

  it("updatesIncluded è false se la finestra di un anno è già scaduta rispetto alla build", async () => {
    const db = createTestDb();
    fetchPaddleTransaction.mockResolvedValue({
      id: "txn_5",
      status: "completed",
      createdAt: "2020-01-01T00:00:00.000Z",
      priceIds: [],
    });

    const status = await activateLicense(db, "txn_5");
    expect(status.updatesIncluded).toBe(false);
  });

  it("è idempotente: attivare due volte aggiorna la stessa riga invece di duplicarla", async () => {
    const db = createTestDb();
    fetchPaddleTransaction.mockResolvedValue({
      id: "txn_4",
      status: "completed",
      createdAt: "2026-01-01T00:00:00.000Z",
      priceIds: [],
    });

    await activateLicense(db, "txn_4");
    await activateLicense(db, "txn_4");
    expect(getLicenseStatus(db).licenseKey).toBe("txn_4");
  });
});
