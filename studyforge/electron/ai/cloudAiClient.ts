import type { z } from "zod";
import { flattenSystemPrompt, flattenUserPrompt, type AiChatClient, type ChatMessage } from "./chatPrompt";

export interface CloudAiClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

/** Timeout per singola richiesta: una generazione JSON complessa (8-20 elementi) può richiedere più tempo di una risposta di chat semplice. */
const REQUEST_TIMEOUT_MS = 120_000;

/** L'endpoint OpenAI-compatible risponde con status >= 400 e un body `{ error: { message, type?, code? } }` (o testo semplice per alcuni gateway). */
interface OpenAiCompatibleErrorBody {
  error?: { message?: string };
}

interface OpenAiCompatibleChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/** Chiave API cloud mancante o rifiutata dal provider (HTTP 401/403). */
export class CloudAuthError extends Error {}
/** Rate limit del provider cloud (HTTP 429). */
export class CloudRateLimitError extends Error {}
/** Qualunque altro errore infrastrutturale lato provider (rete, HTTP 5xx, risposta senza `choices`). */
export class CloudProviderError extends Error {}

/**
 * Client per un endpoint chat-completions OpenAI-compatible generico (usato
 * di default con Dashscope/Qwen, vedi DEFAULT_SETTINGS in
 * electron/services/settingsService.ts), stessa shape pubblica di
 * LocalAiClient (electron/ai/localAiClient.ts, entrambi implementano
 * AiChatClient in electron/ai/chatPrompt.ts): electron/ai/factory.ts sceglie
 * quale istanziare in base a `settings.aiProvider`, il resto dell'app
 * (OpenAiCompatibleStudyGenerator, RagService, studyPack.ts, courseSummary.ts)
 * non sa quale dei due sta usando.
 *
 * Non streaming: l'app consuma sempre la risposta completa (mai token via
 * token), quindi `stream: false` evita di dover gestire il parsing SSE per
 * un beneficio che qui non esiste.
 */
export class CloudAiClient implements AiChatClient {
  constructor(private readonly options: CloudAiClientOptions) {}

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const content = await this.chatText([
        { role: "system", content: "Rispondi solo con la parola: pong" },
        { role: "user", content: "ping" },
      ]);
      return {
        ok: true,
        message: `Modello AI cloud pronto (${this.options.model}). Risposta di verifica: ${content.slice(0, 40)}`,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Errore sconosciuto" };
    }
  }

  async chatJSON(messages: ChatMessage[], schema?: z.ZodTypeAny): Promise<string> {
    return this.run(messages, { jsonMode: true, schema });
  }

  async chatText(messages: ChatMessage[]): Promise<string> {
    return this.run(messages, { jsonMode: false });
  }

  private async run(
    messages: ChatMessage[],
    opts: { jsonMode: boolean; schema?: z.ZodTypeAny },
  ): Promise<string> {
    const startedAt = Date.now();
    const systemPrompt = flattenSystemPrompt(messages);
    const userPrompt = flattenUserPrompt(messages, opts.schema);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.options.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: this.options.temperature,
          max_tokens: this.options.maxTokens,
          stream: false,
          ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      if (!response.ok) {
        const message = await readErrorMessage(response);
        if (response.status === 401 || response.status === 403) {
          throw new CloudAuthError(`Chiave API cloud non valida o rifiutata: ${message}`);
        }
        if (response.status === 429) {
          throw new CloudRateLimitError(`Limite di richieste del provider cloud raggiunto: ${message}`);
        }
        throw new CloudProviderError(`Provider cloud: errore HTTP ${response.status}: ${message}`);
      }

      const data = (await response.json()) as OpenAiCompatibleChatResponse;
      const content = data.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) {
        throw new Error("Risposta del modello AI cloud vuota.");
      }

      console.log(
        `[CloudAiClient] Generazione completata in ${Date.now() - startedAt}ms (jsonMode=${opts.jsonMode}, model=${this.options.model})`,
      );
      return content;
    } catch (error) {
      console.warn(
        `[CloudAiClient] Generazione fallita dopo ${Date.now() - startedAt}ms: ${
          error instanceof Error ? error.message : "errore sconosciuto"
        }`,
      );
      if (error instanceof CloudAuthError || error instanceof CloudRateLimitError || error instanceof CloudProviderError) {
        throw error;
      }
      // AbortError (timeout) deve propagare invariato: toSafeGenerationError
      // in electron/ai/openAiCompatibleStudyGenerator.ts lo riconosce da
      // `error.name === "AbortError"`, stesso contratto già usato per
      // LocalAiClient.
      throw error instanceof Error ? error : new CloudProviderError("Inferenza AI cloud fallita.");
    } finally {
      clearTimeout(timeout);
    }
  }

  async answerWithContext(input: { question: string; context: string }): Promise<string> {
    const content = await this.chatText([
      {
        role: "system",
        content:
          "Sei l'assistente di studio di RStudy. Rispondi in italiano usando ESCLUSIVAMENTE il contesto fornito, citando le fonti indicate tra parentesi quadre (es. [Fonte 1]). Se il contesto non contiene abbastanza informazioni per rispondere, dillo esplicitamente invece di inventare.",
      },
      {
        role: "user",
        content: `Contesto:\n${input.context}\n\nDomanda: ${input.question}`,
      },
    ]);
    return content.trim();
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as OpenAiCompatibleErrorBody;
    if (body.error?.message) return body.error.message;
    return JSON.stringify(body);
  } catch {
    try {
      return await response.text();
    } catch {
      return response.statusText;
    }
  }
}
