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
   *
   * Un solo tentativo, specialmente con un modello locale piccolo, scarta
   * spesso generazioni sostanzialmente buone per un singolo campo fuori
   * schema (es. un valore enum non ammesso): se il fallimento è "di
   * contenuto" (JSON non valido o non conforme allo schema, non un errore
   * infrastrutturale come timeout o motore non disponibile) si ritenta UNA
   * volta sola, mostrando al modello l'errore Zod esatto e chiedendogli di
   * correggere solo quello. Il contenuto della risposta non viene mai
   * loggato (stessa disciplina di privacy del resto del file), solo il
   * fatto che si sta ritentando.
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
    const baseMessages: Array<{ role: "system" | "user"; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const MAX_ATTEMPTS = 2;
    let lastError: unknown;
    let lastRawForRepair: string | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const messages =
        attempt === 1 || lastRawForRepair === null
          ? baseMessages
          : [...baseMessages, { role: "user" as const, content: buildRepairPrompt(lastRawForRepair, lastError) }];

      let raw: string;
      try {
        raw = await this.client.chatJSON(messages, modelSchema);
      } catch (error) {
        // Errore infrastrutturale (motore non disponibile, timeout, ecc.):
        // non è un problema di contenuto correggibile, niente retry.
        return {
          status: "error",
          error: toSafeGenerationError(error, kind, Date.now() - startedAt, this.model),
        };
      }

      try {
        const modelContent = parseModelJson(raw, modelSchema);
        const full = fullSchema.parse(buildFull(modelContent));
        console.log(
          `[AiStudyGenerator] ${kind} generato in ${Date.now() - startedAt}ms (model=${this.model}, tentativi=${attempt})`,
        );
        return { status: "success", data: full };
      } catch (error) {
        lastError = error;
        lastRawForRepair = raw;
        if (attempt < MAX_ATTEMPTS) {
          console.warn(`[AiStudyGenerator] ${kind}: risposta non valida al tentativo ${attempt}, ritento`);
        }
      }
    }

    return {
      status: "error",
      error: toSafeGenerationError(lastError, kind, Date.now() - startedAt, this.model),
    };
  }
}

/**
 * Prompt di riparazione per il secondo tentativo: mostra al modello la sua
 * risposta precedente e il motivo esatto per cui non è stata accettata
 * (messaggio Zod, che nomina il campo e il valore atteso), chiedendo di
 * correggere SOLO quello. Molto più efficace di un retry "cieco" con lo
 * stesso prompt, specialmente per errori puntuali come un valore enum non
 * ammesso.
 */
function buildRepairPrompt(previousRaw: string, error: unknown): string {
  const message = error instanceof Error ? error.message : "Risposta non valida.";
  return `La tua risposta precedente non è stata accettata per questo motivo:\n${message}\n\nEcco la tua risposta precedente:\n${previousRaw}\n\nCorreggi ESCLUSIVAMENTE il problema indicato, mantenendo invariato il resto del contenuto. Rispondi di nuovo con l'intero oggetto JSON corretto, conforme allo schema richiesto, senza testo prima o dopo.`;
}

/**
 * Traduce qualunque eccezione (motore di inferenza locale non disponibile,
 * modello non caricato, provider cloud non raggiungibile/chiave non valida,
 * JSON non valido, schema non conforme) in un messaggio sicuro per l'utente
 * e un codice classificato. Non logga mai il messaggio grezzo dell'errore né
 * il contenuto della richiesta/risposta: solo metadati (kind, durata,
 * model). Gli errori "infrastrutturali" arrivano dal motore node-llama-cpp
 * (classi come InsufficientMemoryError, UnsupportedError, vedi
 * electron/ai/localAiClient.ts) quando il provider è locale, oppure dalle
 * classi CloudAuthError/CloudRateLimitError/CloudProviderError (vedi
 * electron/ai/cloudAiClient.ts) quando il provider è cloud.
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
      message: "Il modello AI non ha risposto in tempo. Riprova tra qualche istante.",
    };
  }

  const message = error instanceof Error ? error.message : "";
  const errorClassName = error instanceof Error ? error.constructor.name : "";

  if (errorClassName === "CloudAiDailyLimitReachedError") {
    logClassifiedError(kind, "daily_limit_reached", durationMs, model);
    // Messaggio già "safe" (electron/services/cloudUsageService.ts): nessun
    // nome di variabile d'ambiente o dettaglio di provider, propaga diretto.
    return { code: "daily_limit_reached", message };
  }

  if (errorClassName === "CloudRateLimitError") {
    logClassifiedError(kind, "rate_limited", durationMs, model);
    return {
      code: "rate_limited",
      message: "Il provider AI cloud ha raggiunto il limite di richieste. Riprova tra qualche istante.",
    };
  }

  if (errorClassName === "CloudAuthError") {
    logClassifiedError(kind, "provider_error", durationMs, model);
    return {
      code: "provider_error",
      message: "La chiave API del provider AI cloud non è valida o è mancante. Controllala in Impostazioni.",
    };
  }

  if (/non è JSON valido|non conforme allo schema|risposta del modello ai (locale|cloud) vuota/i.test(message)) {
    logClassifiedError(kind, "invalid_response", durationMs, model);
    return {
      code: "invalid_response",
      message: "Il modello AI ha restituito una risposta non valida. Riprova.",
    };
  }

  const isEngineError =
    ["InsufficientMemoryError", "UnsupportedError", "NoBinaryFoundError", "DisposedError", "CloudProviderError"].includes(
      errorClassName,
    ) || /contesto del modello ai locale non disponibile|inferenza ai (locale|cloud) fallita/i.test(message);
  if (isEngineError) {
    logClassifiedError(kind, "provider_error", durationMs, model);
    return {
      code: "provider_error",
      message: "Il motore di inferenza AI non è disponibile al momento. Riprova o verifica le Impostazioni AI.",
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
