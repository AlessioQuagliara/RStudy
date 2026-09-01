import type { Db } from "../db/client";
import { getSettings } from "../services/settingsService";
import { getDeepSeekApiKey } from "../services/secretStore";
import { DeepSeekClient } from "./deepseekClient";
import {
  DeepSeekEmbeddingProvider,
  LocalHashEmbeddingProvider,
  type EmbeddingProvider,
} from "../rag/embeddingProvider";
import { OpenAiCompatibleStudyGenerator } from "./openAiCompatibleStudyGenerator";
import type { AiStudyGenerator } from "./studyGenerator";

export async function createDeepSeekClient(db: Db): Promise<DeepSeekClient> {
  const settings = getSettings(db);
  const apiKey = await getDeepSeekApiKey();
  if (!apiKey) {
    throw new Error("Nessuna API key DeepSeek configurata. Vai in Impostazioni per aggiungerla.");
  }
  return new DeepSeekClient({
    apiKey,
    baseUrl: settings.deepseekBaseUrl,
    model: settings.deepseekModel,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
  });
}

export async function tryCreateDeepSeekClient(db: Db): Promise<DeepSeekClient | null> {
  try {
    return await createDeepSeekClient(db);
  } catch {
    return null;
  }
}

/**
 * Sceglie l'EmbeddingProvider in base alla configurazione: se è impostato un
 * modello di embedding DeepSeek e la API key è presente, usa DeepSeek;
 * altrimenti ricade sul provider locale offline-friendly.
 */
export async function createEmbeddingProvider(db: Db): Promise<EmbeddingProvider> {
  const settings = getSettings(db);
  const apiKey = await getDeepSeekApiKey();
  if (settings.deepseekEmbeddingModel && apiKey) {
    return new DeepSeekEmbeddingProvider(
      settings.deepseekBaseUrl,
      apiKey,
      settings.deepseekEmbeddingModel,
    );
  }
  return new LocalHashEmbeddingProvider();
}

// Override facoltativi via variabile d'ambiente per il generatore di
// esercizi/presentazioni: SOLO fallback per sviluppo/CI (es. eseguire la
// generazione fuori dall'app Electron pacchettizzata, dove il Keychain
// macOS/le Impostazioni utente non sono disponibili o comode). Il percorso
// "reale" dell'app resta Impostazioni (baseUrl/model, tabella SQLite
// app_settings, electron/services/settingsService.ts) + Keychain (apiKey,
// electron/services/secretStore.ts): il progetto non ha mai usato variabili
// d'ambiente per segreti (l'unico precedente, STUDYFORGE_DB_PATH in
// electron/db/migrate.ts, è il percorso del file DB nei test/script, non un
// segreto). Per questo `createDeepSeekClient`/`tryCreateDeepSeekClient` sopra
// restano invariati: solo il NUOVO generatore supporta l'override, per non
// introdurre un comportamento diverso e non richiesto nelle funzionalità AI
// già esistenti (study pack, riassunto corso).
const ENV_AI_API_KEY = "STUDYFORGE_AI_API_KEY";
const ENV_AI_BASE_URL = "STUDYFORGE_AI_BASE_URL";
const ENV_AI_MODEL = "STUDYFORGE_AI_MODEL";

function readEnvOverride(name: string): string | null {
  const value = process.env[name];
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export interface StudyGeneratorHandle {
  generator: AiStudyGenerator;
  /** Modello effettivamente usato: da passare a LessonAiGenerationsRepo.save* per la colonna `model`. */
  model: string;
}

/**
 * Assembla l'AiStudyGenerator per esercizi/presentazioni, oppure `null` se
 * non c'è alcuna API key configurata (né in Keychain né via override env):
 * il chiamante (electron/ai/exerciseSet.ts, electron/ai/presentation.ts)
 * usa `null` per restituire un errore "not_configured" invece di lanciare.
 */
export async function tryCreateStudyGenerator(db: Db): Promise<StudyGeneratorHandle | null> {
  const settings = getSettings(db);
  const storedApiKey = await getDeepSeekApiKey();
  const apiKey = readEnvOverride(ENV_AI_API_KEY) ?? storedApiKey;
  if (!apiKey) return null;

  const baseUrl = readEnvOverride(ENV_AI_BASE_URL) ?? settings.deepseekBaseUrl;
  const model = readEnvOverride(ENV_AI_MODEL) ?? settings.deepseekModel;

  const client = new DeepSeekClient({
    apiKey,
    baseUrl,
    model,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
  });

  return { generator: new OpenAiCompatibleStudyGenerator(client, model), model };
}
