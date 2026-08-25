import type { Db } from "../db/client";
import { getSettings } from "../services/settingsService";
import { getDeepSeekApiKey } from "../services/secretStore";
import { DeepSeekClient } from "./deepseekClient";
import { DeepSeekEmbeddingProvider, LocalHashEmbeddingProvider, type EmbeddingProvider } from "../rag/embeddingProvider";

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
    return new DeepSeekEmbeddingProvider(settings.deepseekBaseUrl, apiKey, settings.deepseekEmbeddingModel);
  }
  return new LocalHashEmbeddingProvider();
}
