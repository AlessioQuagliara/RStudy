import type { z } from "zod";
import type { Llama, LlamaContext, LlamaGrammar, LlamaModel } from "node-llama-cpp";
import { flattenSystemPrompt, flattenUserPrompt, type AiChatClient, type ChatMessage } from "./chatPrompt";

export interface LocalAiClientOptions {
  modelPath: string;
  temperature: number;
  maxTokens: number;
}

/**
 * Grammar generica usata per `chatJSON`: vincola solo "è un oggetto JSON
 * sintatticamente valido con chiavi/valori arbitrari", non lo schema esatto
 * atteso dal chiamante. Convertire lo ZodSchema del chiamante in un GBNF
 * JSON Schema (il dialetto proprietario di node-llama-cpp, incompatibile con
 * l'output standard di zod-to-json-schema: niente $ref/allOf/anyOf generico,
 * "required" ignorato, nullable gestito diversamente) è rischioso da fare
 * bene senza test estesi contro il grammar compiler reale. La forma esatta
 * resta comunque garantita a valle da `parseModelJson` (validazione Zod +
 * classificazione errore già esistente in electron/ai/schemas.ts): qui ci
 * limitiamo a garantire che l'output sia sempre JSON parsabile. Lo ZodSchema
 * del chiamante, quando fornito, viene comunque usato per iniettare un JSON
 * Schema testuale nel prompt (best-effort, non un vincolo strutturale) via
 * zod-to-json-schema, per guidare il modello verso la forma corretta.
 */
const GENERIC_JSON_OBJECT_SCHEMA = { type: "object", additionalProperties: true } as const;

let sharedLlama: Llama | null = null;
let loadedModel: { path: string; model: LlamaModel } | null = null;
let sharedContext: LlamaContext | null = null;
let genericGrammar: LlamaGrammar | null = null;

/**
 * Le richieste di inferenza sono serializzate: l'app è single-user e
 * node-llama-cpp non è pensato per eseguire più prompt in parallelo sulla
 * stessa sequence. Una semplice catena di promise basta, nessun mutex vero.
 */
let requestQueue: Promise<void> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = requestQueue.then(task, task);
  requestQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function getSharedLlama(): Promise<Llama> {
  if (!sharedLlama) {
    const { getLlama } = await import("node-llama-cpp");
    sharedLlama = await getLlama();
  }
  return sharedLlama;
}

async function getSharedContext(modelPath: string): Promise<LlamaContext> {
  const llama = await getSharedLlama();
  if (!loadedModel || loadedModel.path !== modelPath) {
    if (sharedContext) {
      await sharedContext.dispose();
      sharedContext = null;
    }
    if (loadedModel) {
      await loadedModel.model.dispose();
    }
    const model = await llama.loadModel({ modelPath });
    sharedContext = await model.createContext();
    loadedModel = { path: modelPath, model };
  }
  if (!sharedContext) {
    throw new Error("Contesto del modello AI locale non disponibile.");
  }
  return sharedContext;
}

async function getGenericJsonGrammar(): Promise<LlamaGrammar> {
  if (!genericGrammar) {
    const llama = await getSharedLlama();
    genericGrammar = await llama.createGrammarForJsonSchema(GENERIC_JSON_OBJECT_SCHEMA);
  }
  return genericGrammar;
}

/**
 * Client di inferenza locale via node-llama-cpp, stessa shape pubblica del
 * precedente client HTTP (chatJSON/chatText/testConnection/answerWithContext):
 * questo permette a OpenAiCompatibleStudyGenerator, courseSummary.ts e
 * studyPack.ts di restare quasi invariati. Non logga mai il contenuto di
 * prompt/risposte, solo metadati (durata, modalità), stessa disciplina di
 * privacy del client precedente.
 */
export class LocalAiClient implements AiChatClient {
  constructor(private readonly options: LocalAiClientOptions) {}

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const content = await this.chatText([
        { role: "system", content: "Rispondi solo con la parola: pong" },
        { role: "user", content: "ping" },
      ]);
      return {
        ok: true,
        message: `Modello AI locale pronto. Risposta di verifica: ${content.slice(0, 40)}`,
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
    return enqueue(async () => {
      const startedAt = Date.now();
      const systemPrompt = flattenSystemPrompt(messages);
      const userPrompt = flattenUserPrompt(messages, opts.schema);

      try {
        const context = await getSharedContext(this.options.modelPath);
        const sequence = context.getSequence();
        const { LlamaChatSession } = await import("node-llama-cpp");
        const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt });

        try {
          const grammar = opts.jsonMode ? await getGenericJsonGrammar() : undefined;
          const content = await session.prompt(userPrompt, {
            grammar,
            temperature: this.options.temperature,
            maxTokens: this.options.maxTokens,
          });

          if (!content.trim()) {
            throw new Error("Risposta del modello AI locale vuota.");
          }

          console.log(
            `[LocalAiClient] Generazione completata in ${Date.now() - startedAt}ms (jsonMode=${opts.jsonMode})`,
          );
          return content;
        } finally {
          session.dispose({ disposeSequence: true });
        }
      } catch (error) {
        console.warn(
          `[LocalAiClient] Generazione fallita dopo ${Date.now() - startedAt}ms: ${
            error instanceof Error ? error.message : "errore sconosciuto"
          }`,
        );
        throw error instanceof Error ? error : new Error("Inferenza AI locale fallita.");
      }
    });
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
