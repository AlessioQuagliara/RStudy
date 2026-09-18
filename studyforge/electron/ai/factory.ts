import type { Db } from "../db/client";
import type { AppSettings } from "../shared/schemas";
import { getSettings } from "../services/settingsService";
import { getModelStatus, getLocalModelPath } from "../services/localModelService";
import { LocalAiClient } from "./localAiClient";
import { CloudAiClient } from "./cloudAiClient";
import type { AiChatClient } from "./chatPrompt";
import { LocalHashEmbeddingProvider, type EmbeddingProvider } from "../rag/embeddingProvider";
import { OpenAiCompatibleStudyGenerator } from "./openAiCompatibleStudyGenerator";
import type { AiStudyGenerator } from "./studyGenerator";

/**
 * Override facoltativo via variabile d'ambiente per la chiave API cloud:
 * comodo in sviluppo/CI per non dover passare dalla UI Impostazioni, stesso
 * ruolo di RSTUDY_AI_MODEL_PATH per il path del modello locale (vedi sotto).
 * In produzione la chiave resta quella incollata dall'utente in
 * Impostazioni (settings.cloudApiKey, tabella SQLite app_settings): non
 * viene mai bundlata nella build, a differenza delle chiavi Paddle (vedi
 * .env.example) che sono condivise da tutti gli utenti verso un backend
 * comune — qui ogni utente usa (e paga) la propria chiave.
 */
const ENV_CLOUD_API_KEY = "RSTUDY_CLOUD_API_KEY";

function buildCloudAiClient(settings: AppSettings): CloudAiClient {
  const apiKey = readEnvOverride(ENV_CLOUD_API_KEY) ?? settings.cloudApiKey;
  if (!apiKey) {
    throw new Error("Nessuna chiave API cloud configurata. Vai in Impostazioni per inserirla.");
  }
  if (!settings.cloudBaseUrl) {
    throw new Error("Nessun endpoint AI cloud configurato. Vai in Impostazioni.");
  }
  if (!settings.cloudModel) {
    throw new Error("Nessun modello AI cloud configurato. Vai in Impostazioni.");
  }
  return new CloudAiClient({
    apiKey,
    baseUrl: settings.cloudBaseUrl,
    model: settings.cloudModel,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
  });
}

function buildLocalAiClient(db: Db, settings: AppSettings): LocalAiClient {
  const status = getModelStatus(db);
  if (status.state !== "ready") {
    throw new Error("Nessun modello AI locale pronto. Vai in Impostazioni per scaricarlo.");
  }
  const modelPath = getLocalModelPath(db);
  if (!modelPath) {
    throw new Error("Nessun modello AI locale pronto. Vai in Impostazioni per scaricarlo.");
  }
  return new LocalAiClient({
    modelPath,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
  });
}

/**
 * Sceglie ed istanzia il client AI (chat/RAG) in base a `settings.aiProvider`:
 * "local" (default, node-llama-cpp offline) o "cloud" (endpoint
 * chat-completions OpenAI-compatible, electron/ai/cloudAiClient.ts). Unico
 * punto di scelta del provider: il resto dell'app dipende solo
 * dall'interfaccia AiChatClient, mai dalle classi concrete.
 */
export async function createAiClient(db: Db): Promise<AiChatClient> {
  const settings = getSettings(db);
  return settings.aiProvider === "cloud" ? buildCloudAiClient(settings) : buildLocalAiClient(db, settings);
}

export async function tryCreateAiClient(db: Db): Promise<AiChatClient | null> {
  try {
    return await createAiClient(db);
  } catch {
    return null;
  }
}

/**
 * L'app usa un solo provider di embedding: l'hashing locale offline
 * (electron/rag/embeddingProvider.ts::LocalHashEmbeddingProvider). Non c'è
 * più un provider di embedding remoto da scegliere: nessuna configurazione
 * necessaria, funziona sempre, anche offline.
 */
export async function createEmbeddingProvider(_db: Db): Promise<EmbeddingProvider> {
  return new LocalHashEmbeddingProvider();
}

// Override facoltativo via variabile d'ambiente per il path del modello
// locale usato dal generatore di esercizi/presentazioni: SOLO fallback per
// sviluppo/CI (es. eseguire la generazione fuori dall'app Electron
// pacchettizzata, dove le Impostazioni utente/il DB SQLite non sono
// disponibili o comodi). Il percorso "reale" dell'app resta Impostazioni
// (localModelUri/localModelPath, tabella SQLite app_settings,
// electron/services/settingsService.ts). Si applica solo quando il provider
// selezionato è "local"; per "cloud" l'override equivalente è
// ENV_CLOUD_API_KEY più sopra.
const ENV_AI_MODEL_PATH = "RSTUDY_AI_MODEL_PATH";

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
 * il provider selezionato non è pronto (locale: nessun modello scaricato né
 * via override env; cloud: nessuna chiave/endpoint/modello configurati): il
 * chiamante (electron/ai/exerciseSet.ts, electron/ai/presentation.ts) usa
 * `null` per restituire un errore "not_configured" invece di lanciare.
 */
export async function tryCreateStudyGenerator(db: Db): Promise<StudyGeneratorHandle | null> {
  const settings = getSettings(db);

  if (settings.aiProvider === "cloud") {
    try {
      const client = buildCloudAiClient(settings);
      const model = settings.cloudModel!;
      return { generator: new OpenAiCompatibleStudyGenerator(client, model), model };
    } catch {
      return null;
    }
  }

  const envModelPath = readEnvOverride(ENV_AI_MODEL_PATH);
  const modelPath = envModelPath ?? getLocalModelPath(db);
  if (!modelPath) return null;

  const client = new LocalAiClient({
    modelPath,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
  });

  const model = settings.localModelUri;
  return { generator: new OpenAiCompatibleStudyGenerator(client, model), model };
}
