import { createHash } from "node:crypto";

/**
 * Normalizza il testo di una lezione prima dell'hashing: NFC per gli accenti
 * italiani, fine riga uniformati, spazi/righe vuote ridondanti collassati.
 * Così un salvataggio che cambia solo la formattazione (spazi finali, righe
 * vuote in più) non produce un hash diverso e non forza una rigenerazione AI
 * inutile (spreco di token).
 */
export function normalizeLessonContent(rawText: string): string {
  return rawText
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Hash deterministico (SHA-256) del testo lezione normalizzato: chiave di
 * cache per `lesson_ai_generations.source_content_hash`, non un segreto.
 * Va eseguito solo nel main process (Node `crypto`): il renderer non deve
 * mai calcolare né ricevere questo hash tramite codice proprio.
 */
export function computeSourceContentHash(rawText: string): string {
  const normalized = normalizeLessonContent(rawText);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}
