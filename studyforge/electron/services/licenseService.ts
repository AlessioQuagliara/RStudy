import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { license } from "../db/schema";
import { nowIso } from "../db/id";
import { fetchPaddleTransaction } from "./paddleClient";
import { APP_RELEASE_DATE } from "../shared/buildInfo";
import type { LicenseStatus } from "../shared/schemas";

const LICENSE_ROW_ID = "current";
const UPDATE_WINDOW_DAYS = 365;

function addDaysIso(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function getRow(db: Db) {
  return db.select().from(license).where(eq(license.id, LICENSE_ROW_ID)).get() ?? null;
}

export function getLicenseStatus(db: Db): LicenseStatus {
  const row = getRow(db);
  if (!row) {
    return {
      activated: false,
      licenseKey: null,
      purchasedAt: null,
      activatedAt: null,
      updatesValidUntil: null,
      updatesIncluded: false,
    };
  }
  return {
    activated: true,
    licenseKey: row.licenseKey,
    purchasedAt: row.purchasedAt,
    activatedAt: row.activatedAt,
    updatesValidUntil: row.updatesValidUntil,
    updatesIncluded: APP_RELEASE_DATE <= row.updatesValidUntil.slice(0, 10),
  };
}

export function isActivated(db: Db): boolean {
  return getRow(db) !== null;
}

/**
 * Verifica la chiave (l'ID transazione Paddle mostrato sulla landing dopo il
 * pagamento) contro l'API Paddle e, se valida, attiva la licenza. Lancia con
 * un messaggio sicuro da mostrare all'utente in ogni caso di rifiuto — mai i
 * dettagli grezzi della risposta Paddle.
 */
export async function activateLicense(db: Db, licenseKey: string): Promise<LicenseStatus> {
  const expectedPriceId = process.env.PADDLE_PRICE_ID?.trim();
  const transaction = await fetchPaddleTransaction(licenseKey.trim());

  if (transaction.status !== "completed") {
    throw new Error("Questa transazione Paddle non risulta completata. Contatta il supporto se hai già pagato.");
  }
  if (expectedPriceId && !transaction.priceIds.includes(expectedPriceId)) {
    throw new Error("Questa chiave non corrisponde a una licenza RStudy valida.");
  }

  const purchasedAt = transaction.createdAt;
  const activatedAt = nowIso();
  const updatesValidUntil = addDaysIso(purchasedAt, UPDATE_WINDOW_DAYS);

  const row = {
    id: LICENSE_ROW_ID,
    licenseKey: transaction.id,
    paddleTransactionId: transaction.id,
    purchasedAt,
    activatedAt,
    updatesValidUntil,
    createdAt: activatedAt,
    updatedAt: activatedAt,
  };

  db.insert(license)
    .values(row)
    .onConflictDoUpdate({ target: license.id, set: row })
    .run();

  return getLicenseStatus(db);
}
