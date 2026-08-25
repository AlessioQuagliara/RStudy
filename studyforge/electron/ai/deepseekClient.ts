export interface DeepSeekClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs?: number;
  maxRetries?: number;
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;

/**
 * Client DeepSeek (API OpenAI-compatible), confinato al main process.
 * Non logga mai la API key né il contenuto completo dei prompt/risposte:
 * i log riportano solo metadati (status, tentativo, durata).
 */
export class DeepSeekClient {
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(private readonly options: DeepSeekClientOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const content = await this.chatText([
        { role: "system", content: "Rispondi solo con la parola: pong" },
        { role: "user", content: "ping" },
      ]);
      return { ok: true, message: `Connessione riuscita (modello: ${this.options.model}). Risposta: ${content.slice(0, 40)}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "Errore sconosciuto" };
    }
  }

  async chatJSON(messages: ChatMessage[]): Promise<string> {
    return this.request(messages, true);
  }

  async chatText(messages: ChatMessage[]): Promise<string> {
    return this.request(messages, false);
  }

  private async request(messages: ChatMessage[], jsonMode: boolean): Promise<string> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < this.maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const startedAt = Date.now();

      try {
        const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify({
            model: this.options.model,
            messages,
            temperature: this.options.temperature,
            max_tokens: this.options.maxTokens,
            ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const durationMs = Date.now() - startedAt;

        if (!response.ok) {
          const retryable = response.status === 429 || response.status >= 500;
           
          console.warn(`[DeepSeek] HTTP ${response.status} (tentativo ${attempt}/${this.maxRetries}, ${durationMs}ms)`);
          if (retryable && attempt < this.maxRetries) {
            await sleep(backoffDelay(attempt));
            continue;
          }
          throw new Error(`DeepSeek ha risposto con HTTP ${response.status}`);
        }

        const json = (await response.json()) as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        };
        const choice = json.choices?.[0];
        const content = choice?.message?.content ?? "";

        if (!content.trim()) {
          if (attempt < this.maxRetries) {
            await sleep(backoffDelay(attempt));
            continue;
          }
          throw new Error("Risposta DeepSeek vuota dopo i tentativi di retry");
        }

        if (choice?.finish_reason === "length" && attempt < this.maxRetries) {
          // Risposta troncata: ritenta (il chiamante può anche ridurre il contenuto in input).
          await sleep(backoffDelay(attempt));
          continue;
        }

        return content;
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
        const isAbort = error instanceof Error && error.name === "AbortError";
         
        console.warn(`[DeepSeek] Tentativo ${attempt}/${this.maxRetries} fallito (${isAbort ? "timeout" : "errore rete"})`);
        if (attempt < this.maxRetries) {
          await sleep(backoffDelay(attempt));
          continue;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Chiamata DeepSeek fallita");
  }

  async answerWithContext(input: { question: string; context: string }): Promise<string> {
    const content = await this.chatText([
      {
        role: "system",
        content:
          "Sei l'assistente di studio di StudyForge. Rispondi in italiano usando ESCLUSIVAMENTE il contesto fornito, citando le fonti indicate tra parentesi quadre (es. [Fonte 1]). Se il contesto non contiene abbastanza informazioni per rispondere, dillo esplicitamente invece di inventare.",
      },
      {
        role: "user",
        content: `Contesto:\n${input.context}\n\nDomanda: ${input.question}`,
      },
    ]);
    return content.trim();
  }
}

function backoffDelay(attempt: number): number {
  const base = 500 * 2 ** (attempt - 1);
  const jitter = Math.random() * 200;
  return Math.min(base + jitter, 8000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
