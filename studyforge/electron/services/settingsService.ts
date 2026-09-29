import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { appSettings } from "../db/schema";
import { nowIso } from "../db/id";
import { appSettingsSchema, type AppSettings, type UpdateSettingsInput } from "../shared/schemas";

const SETTINGS_KEY = "app_settings";

export const DEFAULT_SETTINGS: AppSettings = {
  localModelUri: "hf:XHToken/Spark-X2.5-4B-GGUF:Q4_K_M",
  localModelPath: null,
  temperature: 0.3,
  maxTokens: 4096,
  language: "it",
  theme: "system",
  importFolder: null,
  // Cloud ha priorità di default (electron/ai/factory.ts::withLocalFallback
  // ripiega comunque sul locale se il cloud non è raggiungibile o non è
  // configurato in questa build): il locale resta la rete di sicurezza
  // offline, non la scelta predefinita.
  aiProvider: "cloud",
};

export function getSettings(db: Db): AppSettings {
  const row = db.select().from(appSettings).where(eq(appSettings.key, SETTINGS_KEY)).get();
  if (!row) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(row.valueJson);
    // Difensivo per righe salvate quando `temperature` arrivava fino a 2
    // (il vecchio limite dello slider produceva output pressoché casuale):
    // riportarla dentro il range corrente invece di far fallire l'intero
    // parse Zod, che scarterebbe anche `localModelPath` e farebbe perdere
    // all'utente il riferimento al modello già scaricato.
    if (typeof parsed.temperature === "number") {
      parsed.temperature = Math.min(Math.max(parsed.temperature, 0), 1);
    }
    return appSettingsSchema.parse({ ...DEFAULT_SETTINGS, ...parsed });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function updateSettings(db: Db, patch: UpdateSettingsInput): AppSettings {
  const current = getSettings(db);
  const next = appSettingsSchema.parse({ ...current, ...patch });
  db.insert(appSettings)
    .values({ key: SETTINGS_KEY, valueJson: JSON.stringify(next), updatedAt: nowIso() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { valueJson: JSON.stringify(next), updatedAt: nowIso() },
    })
    .run();
  return next;
}
