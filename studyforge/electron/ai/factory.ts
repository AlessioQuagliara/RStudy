import type { Db } from "../db/client";
import { getSettings } from "../services/settingsService";
import { getModelStatus, getLocalModelPath } from "../services/localModelService";
import { LocalAiClient } from "./localAiClient";
import { LocalHashEmbeddingProvider, type EmbeddingProvider } from "../rag/embeddingProvider";
import { OpenAiCompatibleStudyGenerator } from "./openAiCompatibleStudyGenerator";
import type { AiStudyGenerator } from "./studyGenerator";

export async function createLocalAiClient(db: Db): Promise<LocalAiClient> {
  const status = getModelStatus(db);
  if (status.state !== "ready") {
    throw new Error("Nessun modello AI locale pronto. Vai in Impostazioni per scaricarlo.");
  }
  const modelPath = getLocalModelPath(db);
  if (!modelPath) {
    throw new Error("Nessun modello AI locale pronto. Vai in Impostazioni per scaricarlo.");
  }

  const settings = getSettings(db);
  return new LocalAiClient({
    modelPath,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
  });
}

export async function tryCreateLocalAiClient(db: Db): Promise<LocalAiClient | null> {
  try {
    return await createLocalAiClient(db);
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

// Override facoltativo via variabile d'ambiente per il generatore di
// esercizi/presentazioni: SOLO fallback per sviluppo/CI (es. eseguire la
// generazione fuori dall'app Electron pacchettizzata, dove le Impostazioni
// utente/il DB SQLite non sono disponibili o comodi). Il percorso "reale"
// dell'app resta Impostazioni (localModelUri/localModelPath, tabella SQLite
// app_settings, electron/services/settingsService.ts). Con l'AI locale non
// esistono più segreti da iniettare via env (niente più API key/base URL):
// resta solo un override del path del file .gguf, utile per puntare a un
// modello già presente su disco durante i test senza passare dal download UI.
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
 * non c'è alcun modello AI locale pronto (né scaricato né via override env):
 * il chiamante (electron/ai/exerciseSet.ts, electron/ai/presentation.ts)
 * usa `null` per restituire un errore "not_configured" invece di lanciare.
 */
export async function tryCreateStudyGenerator(db: Db): Promise<StudyGeneratorHandle | null> {
  const settings = getSettings(db);
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
