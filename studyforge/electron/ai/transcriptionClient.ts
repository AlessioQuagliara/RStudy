import type { TranscribeAudioResult } from "../shared/schemas";

export interface TranscriptionClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Timeout generoso: un segmento di dettato di qualche minuto può richiedere più di una richiesta di chat breve. */
const REQUEST_TIMEOUT_MS = 60_000;

interface TranscriptionErrorBody {
  error?: { message?: string };
}

interface TranscriptionResponseBody {
  text?: string;
}

/**
 * Client per un endpoint di trascrizione audio OpenAI-compatible
 * (`/audio/transcriptions`, multipart/form-data) — provider separato da
 * CloudAiClient (electron/ai/cloudAiClient.ts) perché un endpoint
 * chat-completions generico (DeepSeek, Dashscope...) non implementa
 * necessariamente anche questo. Verificato contro OpenAI stesso
 * (modello "whisper-1"), il default e unico provider testato finora.
 */
export async function transcribeAudio(
  options: TranscriptionClientOptions,
  audio: { buffer: Buffer; mimeType: string },
): Promise<TranscribeAudioResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const form = new FormData();
    const extension = audio.mimeType.includes("webm") ? "webm" : "wav";
    form.append("file", new Blob([audio.buffer], { type: audio.mimeType }), `dettato.${extension}`);
    form.append("model", options.model);
    // Gli appunti dell'app sono sempre in italiano (language: z.literal("it")
    // in AppSettings): indicarlo esplicitamente a Whisper migliora
    // l'accuratezza rispetto al rilevamento automatico della lingua.
    form.append("language", "it");

    const response = await fetch(`${options.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${options.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      if (response.status === 401 || response.status === 403) {
        return {
          status: "error",
          code: "provider_error",
          message: `Chiave API di trascrizione non valida o rifiutata: ${message}`,
        };
      }
      return { status: "error", code: "provider_error", message: `Trascrizione fallita (HTTP ${response.status}): ${message}` };
    }

    const data = (await response.json()) as TranscriptionResponseBody;
    const text = (data.text ?? "").trim();
    if (!text) {
      return { status: "error", code: "unknown", message: "La trascrizione è risultata vuota." };
    }
    return { status: "success", text };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    if (isAbort) {
      return { status: "error", code: "timeout", message: "La trascrizione non ha risposto in tempo. Riprova." };
    }
    const message = error instanceof Error ? error.message : "Errore sconosciuto durante la trascrizione.";
    console.warn("[TranscriptionClient] Trascrizione fallita:", message);
    return { status: "error", code: "unknown", message: "Si è verificato un errore imprevisto durante la trascrizione." };
  } finally {
    clearTimeout(timeout);
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as TranscriptionErrorBody;
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
