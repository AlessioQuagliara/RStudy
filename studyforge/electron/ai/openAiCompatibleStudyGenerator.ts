import type { z } from "zod";
import type { AiStudyGenerator } from "./studyGenerator";
import {
  parseModelJson,
  exerciseSetModelResponseSchema,
  presentationModelResponseSchema,
  EXERCISE_SET_SCHEMA_VERSION,
  PRESENTATION_SCHEMA_VERSION,
  type ExerciseSetModelResponse,
  type PresentationModelResponse,
} from "./schemas";
import {
  EXERCISE_SET_SYSTEM_PROMPT,
  buildExerciseSetUserPrompt,
  PRESENTATION_SYSTEM_PROMPT,
  buildPresentationUserPrompt,
} from "./prompts";
import {
  exerciseSetSchema,
  presentationSchema,
  type ExerciseSet,
  type Presentation,
  type ExerciseSetGenerationResult,
  type PresentationGenerationResult,
  type GenerateExerciseSetInput,
  type GeneratePresentationInput,
  type AiGenerationErrorCode,
} from "../shared/schemas";

/**
 * Sottoinsieme minimo di LocalAiClient di cui l'adapter ha bisogno: dipendere
 * da questa interfaccia invece che dalla classe concreta permette di testare
 * la logica di parsing/errore con un fake, senza caricare un modello vero
 * (LocalAiClient la implementa già strutturalmente, nessun adattamento
 * richiesto). Il secondo parametro opzionale `schema` è lo ZodSchema atteso
 * per la risposta: il client lo usa (via zod-to-json-schema) per rafforzare
 * il prompt con un JSON Schema testuale, non come vincolo strutturale rigido
 * — vedi il commento su GENERIC_JSON_OBJECT_SCHEMA in electron/ai/localAiClient.ts.
 */
export interface ChatJsonClient {
  chatJSON(
    messages: Array<{ role: "system" | "user"; content: string }>,
    schema?: z.ZodTypeAny,
  ): Promise<string>;
}

type GenerationOutcome<TData> =
  | { status: "success"; data: TData }
  | { status: "error"; error: { code: AiGenerationErrorCode; message: string } };

/**
 * Adapter di AiStudyGenerator: costruisce i prompt (electron/ai/prompts.ts),
 * chiama il client via `chatJSON` (JSON mode), e NON si fida mai della
 * risposta grezza — la valida sempre con Zod, prima contro la forma "solo
 * contenuto" richiesta al modello, poi contro lo schema condiviso completo
 * (electron/shared/schemas.ts) dopo aver stampato noi i metadati
 * (version/sourceLessonId/generatedAt). Il nome "OpenAiCompatible" è storico
 * (l'app usava un endpoint chat-completions in stile OpenAI): oggi il client
 * concreto è LocalAiClient (inferenza locale via node-llama-cpp), ma questa
 * classe dipende solo dall'interfaccia minima ChatJsonClient, nessuna
 * assunzione specifica al provider qui dentro.
 */
export class OpenAiCompatibleStudyGenerator implements AiStudyGenerator {
  constructor(
    private readonly client: ChatJsonClient,
    private readonly model: string,
  ) {}

  async generateExerciseSet(input: GenerateExerciseSetInput): Promise<ExerciseSetGenerationResult> {
    return this.run<ExerciseSetModelResponse, ExerciseSet>(
      EXERCISE_SET_SYSTEM_PROMPT,
      buildExerciseSetUserPrompt(input),
      exerciseSetModelResponseSchema,
      (model) => ({
        version: EXERCISE_SET_SCHEMA_VERSION,
        sourceLessonId: input.lessonId,
        generatedAt: new Date().toISOString(),
        title: model.title,
        exercises: model.exercises,
      }),
      exerciseSetSchema,
      "exercise_set",
    );
  }

  async generatePresentation(
    input: GeneratePresentationInput,
  ): Promise<PresentationGenerationResult> {
    return this.run<PresentationModelResponse, Presentation>(
      PRESENTATION_SYSTEM_PROMPT,
      buildPresentationUserPrompt(input),
      presentationModelResponseSchema,
      (model) => ({
        version: PRESENTATION_SCHEMA_VERSION,
        sourceLessonId: input.lessonId,
        generatedAt: new Date().toISOString(),
        title: model.title,
        slides: model.slides,
      }),
      presentationSchema,
      "presentation",
    );
  }

  /**
   * Percorso comune a entrambe le generazioni: chiama il provider, valida la
   * risposta "solo contenuto", assembla l'oggetto finale con i metadati che
   * conosciamo con certezza, lo rivalida contro lo schema condiviso completo,
   * e mappa qualunque eccezione (rete, timeout, JSON non valido, schema non
   * conforme) in un errore "safe" tipizzato invece di lasciarla propagare.
   */
  private async run<TModel, TFull>(
    systemPrompt: string,
    userPrompt: string,
    modelSchema: z.ZodType<TModel>,
    buildFull: (model: TModel) => TFull,
    fullSchema: z.ZodType<TFull>,
    kind: "exercise_set" | "presentation",
  ): Promise<GenerationOutcome<TFull>> {
    const startedAt = Date.now();
    try {
      const raw = await this.client.chatJSON(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        modelSchema,
      );
      const modelContent = parseModelJson(raw, modelSchema);
      const full = fullSchema.parse(buildFull(modelContent));
      console.log(
        `[AiStudyGenerator] ${kind} generato in ${Date.now() - startedAt}ms (model=${this.model})`,
      );
      return { status: "success", data: full };
    } catch (error) {
      return {
        status: "error",
        error: toSafeGenerationError(error, kind, Date.now() - startedAt, this.model),
      };
    }
  }
}

/**
 * Traduce qualunque eccezione (motore di inferenza locale non disponibile,
 * modello non caricato, JSON non valido, schema non conforme) in un
 * messaggio sicuro per l'utente e un codice classificato. Non logga mai il
 * messaggio grezzo dell'errore né il contenuto della richiesta/risposta:
 * solo metadati (kind, durata, model). Non c'è più un endpoint HTTP remoto
 * da classificare per status code: gli errori "infrastrutturali" arrivano
 * ora dal motore node-llama-cpp (classi come InsufficientMemoryError,
 * UnsupportedError) o dai messaggi propri di electron/ai/localAiClient.ts.
 * `rate_limited` resta nello schema condiviso (electron/shared/schemas.ts)
 * ma non è più prodotto qui: non esiste un provider remoto che possa
 * limitare le richieste per un modello che gira in locale.
 */
function toSafeGenerationError(
  error: unknown,
  kind: "exercise_set" | "presentation",
  durationMs: number,
  model: string,
): { code: AiGenerationErrorCode; message: string } {
  const isAbort = error instanceof Error && error.name === "AbortError";
  if (isAbort) {
    logClassifiedError(kind, "timeout", durationMs, model);
    return {
      code: "timeout",
      message: "Il modello AI locale non ha risposto in tempo. Riprova tra qualche istante.",
    };
  }

  const message = error instanceof Error ? error.message : "";

  if (/non è JSON valido|non conforme allo schema|risposta del modello ai locale vuota/i.test(message)) {
    logClassifiedError(kind, "invalid_response", durationMs, model);
    return {
      code: "invalid_response",
      message: "Il modello AI locale ha restituito una risposta non valida. Riprova.",
    };
  }

  const engineErrorClassName = error instanceof Error ? error.constructor.name : "";
  const isEngineError =
    ["InsufficientMemoryError", "UnsupportedError", "NoBinaryFoundError", "DisposedError"].includes(
      engineErrorClassName,
    ) || /contesto del modello ai locale non disponibile|inferenza ai locale fallita/i.test(message);
  if (isEngineError) {
    logClassifiedError(kind, "provider_error", durationMs, model);
    return {
      code: "provider_error",
      message:
        "Il motore di inferenza AI locale non è disponibile al momento. Riprova o verifica il modello in Impostazioni.",
    };
  }

  logClassifiedError(kind, "unknown", durationMs, model);
  return {
    code: "unknown",
    message: "Si è verificato un errore imprevisto durante la generazione AI.",
  };
}

function logClassifiedError(
  kind: "exercise_set" | "presentation",
  code: AiGenerationErrorCode,
  durationMs: number,
  model: string,
): void {
  console.warn(`[AiStudyGenerator] ${kind} fallito: ${code} (${durationMs}ms, model=${model})`);
}
