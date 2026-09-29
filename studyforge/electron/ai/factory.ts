import type { Db } from "../db/client";
import type { AppSettings } from "../shared/schemas";
import { getSettings } from "../services/settingsService";
import { getModelStatus, getLocalModelPath } from "../services/localModelService";
import { LocalAiClient } from "./localAiClient";
import { CloudAiClient } from "./cloudAiClient";
import type { AiChatClient } from "./chatPrompt";
import { withDailyUsageGuard } from "./cloudUsageGuard";
import { LocalHashEmbeddingProvider, type EmbeddingProvider } from "../rag/embeddingProvider";
import { OpenAiCompatibleStudyGenerator } from "./openAiCompatibleStudyGenerator";
import type { AiStudyGenerator } from "./studyGenerator";

/**
 * Il provider "cloud" è centralizzato: chiave/endpoint/modello sono pagati e
 * gestiti dal distributore dell'app, letti SOLO da variabili d'ambiente lato
 * main process (stesso meccanismo già usato per i segreti Paddle, vedi
 * .env.example — incluse come extraResource nel pacchetto distribuito). Non
 * esiste più un percorso "bring your own key": l'utente sceglie solo tra
 * questo provider condiviso (soggetto al limite giornaliero, vedi
 * electron/services/cloudUsageService.ts) e il modello locale offline.
 */
const ENV_CLOUD_API_KEY = "RSTUDY_CLOUD_API_KEY";
const ENV_CLOUD_BASE_URL = "RSTUDY_CLOUD_BASE_URL";
const ENV_CLOUD_MODEL = "RSTUDY_CLOUD_MODEL";
const ENV_TRANSCRIPTION_API_KEY = "RSTUDY_TRANSCRIPTION_API_KEY";
const ENV_TRANSCRIPTION_BASE_URL = "RSTUDY_TRANSCRIPTION_BASE_URL";
const ENV_TRANSCRIPTION_MODEL = "RSTUDY_TRANSCRIPTION_MODEL";
/**
 * Modello cloud dedicato alla pipeline "Genera sessione studio"
 * (electron/services/studySessionService.ts), opzionale: se non impostata si
 * ricade sul modello generale (ENV_CLOUD_MODEL). Esiste perché quella
 * pipeline genera JSON strutturato molto più lungo (capitoli interi in
 * markdown) delle altre funzioni AI, e un modello "flash"/reasoning con un
 * budget di token pensato per risposte brevi lo tronca a metà: il
 * `finish_reason` torna "length" con un JSON incompleto, che fallisce la
 * validazione Zod e fa apparire la generazione come fallita ("La
 * generazione della sessione studio non è riuscita"). Un modello "pro" più
 * capace, con più margine di token (vedi STUDY_SESSION_CLOUD_MAX_TOKENS
 * sotto), evita il troncamento.
 */
const ENV_CLOUD_STUDY_SESSION_MODEL = "RSTUDY_CLOUD_STUDY_SESSION_MODEL";
/**
 * Budget di token per le chiamate cloud della pipeline "Genera sessione
 * studio", indipendente da `settings.maxTokens` (che resta il default per
 * chat generalista/RAG/esercizi): i modelli reasoning usati da questo
 * provider spendono una quota di token "di pensiero" (`reasoning_content`)
 * prima di produrre la risposta vera, quota che si somma al contenuto
 * JSON/markdown richiesto e va tolta dallo stesso `max_tokens` — un valore
 * pensato per risposte brevi (i.e. 4096, il default di `settings.maxTokens`)
 * qui tronca sistematicamente l'output.
 */
const STUDY_SESSION_CLOUD_MAX_TOKENS = 12000;

function getCloudCredentialsFromEnv(): { apiKey: string; baseUrl: string; model: string } {
  const apiKey = readEnvOverride(ENV_CLOUD_API_KEY);
  const baseUrl = readEnvOverride(ENV_CLOUD_BASE_URL);
  const model = readEnvOverride(ENV_CLOUD_MODEL);
  if (!apiKey || !baseUrl || !model) {
    throw new Error("Provider AI cloud non disponibile in questa build.");
  }
  return { apiKey, baseUrl, model };
}

export function getTranscriptionCredentialsFromEnv(): { apiKey: string; baseUrl: string; model: string } {
  const apiKey = readEnvOverride(ENV_TRANSCRIPTION_API_KEY);
  const baseUrl = readEnvOverride(ENV_TRANSCRIPTION_BASE_URL);
  const model = readEnvOverride(ENV_TRANSCRIPTION_MODEL);
  if (!apiKey || !baseUrl || !model) {
    throw new Error("Trascrizione non disponibile in questa build.");
  }
  return { apiKey, baseUrl, model };
}

/** Informazioni di provider cloud in sola lettura per la UI Impostazioni: mai la chiave API. */
export function getCloudProviderInfo() {
  const chatBaseUrl = readEnvOverride(ENV_CLOUD_BASE_URL);
  const chatModel = readEnvOverride(ENV_CLOUD_MODEL);
  const transcriptionBaseUrl = readEnvOverride(ENV_TRANSCRIPTION_BASE_URL);
  const transcriptionModel = readEnvOverride(ENV_TRANSCRIPTION_MODEL);
  return {
    chat: {
      baseUrl: chatBaseUrl,
      model: chatModel,
      configured: Boolean(readEnvOverride(ENV_CLOUD_API_KEY) && chatBaseUrl && chatModel),
    },
    transcription: {
      baseUrl: transcriptionBaseUrl,
      model: transcriptionModel,
      configured: Boolean(readEnvOverride(ENV_TRANSCRIPTION_API_KEY) && transcriptionBaseUrl && transcriptionModel),
    },
  };
}

function buildCloudAiClient(
  settings: Pick<AppSettings, "temperature" | "maxTokens">,
  overrides?: { model?: string; maxTokens?: number },
): CloudAiClient {
  const { apiKey, baseUrl, model } = getCloudCredentialsFromEnv();
  return new CloudAiClient({
    apiKey,
    baseUrl,
    model: overrides?.model ?? model,
    temperature: settings.temperature,
    maxTokens: overrides?.maxTokens ?? settings.maxTokens,
  });
}

/** Modello cloud da usare per "Genera sessione studio": l'override dedicato se configurato, altrimenti il modello cloud generale. */
function getStudySessionCloudModel(): string | undefined {
  return readEnvOverride(ENV_CLOUD_STUDY_SESSION_MODEL) ?? undefined;
}

function isLocalModelReady(db: Db): boolean {
  return getModelStatus(db).state === "ready" && Boolean(getLocalModelPath(db));
}

/**
 * Avvolge un client cloud con un fallback automatico al modello locale: se
 * una chiamata cloud fallisce (offline, provider irraggiungibile, chiave non
 * configurata in questa build, limite giornaliero raggiunto, ecc.) e un
 * modello locale è pronto, il client locale viene provato al posto di far
 * fallire l'intera operazione — vedi decisione di prodotto in
 * SettingsPage.tsx: "priorità al cloud, locale come rete di sicurezza
 * offline". Il client locale è costruito pigramente (solo se davvero serve),
 * per non pagare il costo di verifica del modello quando il cloud funziona.
 */
function withLocalFallback(cloudClient: AiChatClient, db: Db, settings: AppSettings): AiChatClient {
  let localClient: AiChatClient | null = null;
  const getLocalClient = (): AiChatClient => {
    if (!localClient) localClient = buildLocalAiClient(db, settings);
    return localClient;
  };

  async function withFallback<T>(run: (client: AiChatClient) => Promise<T>): Promise<T> {
    try {
      return await run(cloudClient);
    } catch (error) {
      if (!isLocalModelReady(db)) throw error;
      console.warn(
        `[factory] provider cloud non disponibile, ripiego sul modello locale: ${
          error instanceof Error ? error.message : "errore sconosciuto"
        }`,
      );
      return run(getLocalClient());
    }
  }

  return {
    testConnection: () => cloudClient.testConnection(),
    chatJSON: (messages, schema) => withFallback((c) => c.chatJSON(messages, schema)),
    chatText: (messages) => withFallback((c) => c.chatText(messages)),
    answerWithContext: (input) => withFallback((c) => c.answerWithContext(input)),
  };
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
 * "cloud" (default, endpoint chat-completions OpenAI-compatible,
 * electron/ai/cloudAiClient.ts) o "local" (node-llama-cpp offline). Il cloud
 * ha sempre priorità quando selezionato: se non è raggiungibile (offline,
 * errore del provider, build senza credenziali) e un modello locale è
 * pronto, si passa automaticamente al locale (withLocalFallback) invece di
 * interrompere la generazione — l'utente vede il fallback solo se il locale
 * non è configurato. Unico punto di scelta del provider: il resto dell'app
 * dipende solo dall'interfaccia AiChatClient, mai dalle classi concrete.
 */
export async function createAiClient(db: Db): Promise<AiChatClient> {
  const settings = getSettings(db);
  if (settings.aiProvider === "cloud") {
    try {
      const cloudClient = withDailyUsageGuard(buildCloudAiClient(settings), db, "general_ai");
      return withLocalFallback(cloudClient, db, settings);
    } catch (error) {
      if (isLocalModelReady(db)) return buildLocalAiClient(db, settings);
      throw error;
    }
  }
  return buildLocalAiClient(db, settings);
}

/**
 * Come `createAiClient`, ma SENZA il guard sul budget giornaliero condiviso
 * (electron/ai/cloudUsageGuard.ts): usata solo dalla pipeline di "Genera
 * sessione studio" (electron/services/studySessionService.ts), che ha un
 * proprio budget separato per-job (CLOUD_STUDY_SESSION_MAX_CALLS_PER_JOB) e
 * non deve consumare/essere bloccata dal contatore dei 35/giorno dell'AI
 * generalista — decisione di prodotto esplicita: una singola sessione
 * studio può fare decine di chiamate senza azzerare il budget quotidiano
 * generalista.
 */
export async function createAiClientForStudySession(db: Db): Promise<AiChatClient> {
  const settings = getSettings(db);
  if (settings.aiProvider === "cloud") {
    try {
      const cloudClient = buildCloudAiClient(settings, {
        model: getStudySessionCloudModel(),
        maxTokens: STUDY_SESSION_CLOUD_MAX_TOKENS,
      });
      return withLocalFallback(cloudClient, db, settings);
    } catch (error) {
      if (isLocalModelReady(db)) return buildLocalAiClient(db, settings);
      throw error;
    }
  }
  return buildLocalAiClient(db, settings);
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
      const { model } = getCloudCredentialsFromEnv();
      const client = withDailyUsageGuard(buildCloudAiClient(settings), db, "general_ai");
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
