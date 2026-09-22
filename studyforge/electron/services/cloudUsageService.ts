import type { Db } from "../db/client";
import { CloudUsageRepo } from "../db/repositories";

const DEFAULT_DAILY_LIMIT = 35;

export type CloudUsageCategory = "general_ai" | "dictation";

/**
 * Messaggio già "safe" (nessun nome di variabile d'ambiente, nessun dettaglio
 * di provider): può propagare fino al renderer senza sanificazione ulteriore,
 * sia via reject IPC diretto (studyPack.ts/courseSummary.ts) sia via il
 * branch dedicato in openAiCompatibleStudyGenerator.ts.
 */
export class CloudAiDailyLimitReachedError extends Error {
  constructor(public readonly limit: number) {
    super(`Hai raggiunto il limite giornaliero di ${limit} richieste AI cloud. Riprova domani o passa al modello locale.`);
    this.name = "CloudAiDailyLimitReachedError";
  }
}

function getDailyLimit(): number {
  const parsed = Number.parseInt(process.env.CLOUD_AI_DAILY_USAGE_LIMIT ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

/**
 * Giorno corrente in Europe/Rome (gestisce CET/CEST automaticamente tramite
 * Intl, senza dipendenze aggiuntive), non nel fuso del sistema operativo:
 * il reset del limite deve avvenire a mezzanotte italiana indipendentemente
 * da dove gira la macchina dell'utente. "en-CA" produce direttamente il
 * formato YYYY-MM-DD.
 */
export function currentUsageDateRome(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Mezzanotte successiva in Europe/Rome, in ISO con offset — SOLO per
 * display (campo `resetAt` esposto in UI): l'enforcement del limite si basa
 * unicamente sul confronto stringa di `usageDate`, mai su questo valore.
 */
function nextMidnightRomeIso(now: Date = new Date()): string {
  const todayRome = currentUsageDateRome(now);
  const offsetMinutes = romeOffsetMinutes(now);
  const parts = todayRome.split("-").map(Number) as [number, number, number];
  const nextMidnightUtcMs = Date.UTC(parts[0], parts[1] - 1, parts[2] + 1, 0, 0, 0) - offsetMinutes * 60_000;
  return new Date(nextMidnightUtcMs).toISOString();
}

/** Offset di Europe/Rome rispetto a UTC in minuti nel giorno di `now` (+60 CET, +120 CEST). */
function romeOffsetMinutes(now: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(now).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - now.getTime()) / 60_000);
}

/**
 * Da chiamare SEMPRE immediatamente prima della chiamata di rete reale verso
 * il provider cloud (mai prima, es. non prima della validazione dell'input
 * IPC): una richiesta scartata a monte non deve consumare budget, ma una
 * richiesta partita e poi fallita (timeout/errore del provider) conta
 * comunque, perché ha potenzialmente generato costo. Nessun rollback in caso
 * di fallimento successivo alla riserva.
 */
export function reserveCloudAiCall(db: Db, category: CloudUsageCategory): void {
  const limit = getDailyLimit();
  const result = CloudUsageRepo.incrementIfUnderLimit(db, { usageDate: currentUsageDateRome(), category, limit });
  if (!result.accepted) throw new CloudAiDailyLimitReachedError(limit);
}

export interface CloudAiUsageToday {
  date: string;
  limit: number;
  used: number;
  remaining: number;
  percentage: number;
  resetAt: string;
}

export function getTodayUsage(db: Db): CloudAiUsageToday {
  const limit = getDailyLimit();
  const usageDate = currentUsageDateRome();
  const row = CloudUsageRepo.getByDate(db, usageDate);
  const used = (row?.generalAiCount ?? 0) + (row?.dictationCount ?? 0);
  return {
    date: usageDate,
    limit,
    used,
    remaining: Math.max(limit - used, 0),
    percentage: Math.min(Math.round((used / limit) * 100), 100),
    resetAt: nextMidnightRomeIso(),
  };
}
