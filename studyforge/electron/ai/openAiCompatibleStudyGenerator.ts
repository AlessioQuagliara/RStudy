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
 * Sottoinsieme minimo di DeepSeekClient di cui l'adapter ha bisogno: dipendere
 * da questa interfaccia invece che dalla classe concreta permette di testare
 * la logica di parsing/errore con un fake, senza chiamate di rete vere
 * (DeepSeekClient la implementa già strutturalmente, nessun adattamento richiesto).
 */
export interface ChatJsonClient {
  chatJSON(messages: Array<{ role: "system" | "user"; content: string }>): Promise<string>;
}

type GenerationOutcome<TData> =
  | { status: "success"; data: TData }
  | { status: "error"; error: { code: AiGenerationErrorCode; message: string } };

/**
 * Adapter OpenAI-compatible di AiStudyGenerator: costruisce i prompt
 * (electron/ai/prompts.ts), chiama il client via `chatJSON` (JSON mode),
 * e NON si fida mai della risposta grezza — la valida sempre con Zod, prima
 * contro la forma "solo contenuto" richiesta al modello, poi contro lo
 * schema condiviso completo (electron/shared/schemas.ts) dopo aver stampato
 * noi i metadati (version/sourceLessonId/generatedAt). Funziona con DeepSeek
 * o qualunque altro provider che esponga un endpoint chat-completions
 * OpenAI-compatible: nessuna assunzione specifica a DeepSeek qui dentro.
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
      const raw = await this.client.chatJSON([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);
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
 * Traduce qualunque eccezione (rete, timeout/abort, HTTP non ok, JSON non
 * valido, schema non conforme) in un messaggio sicuro per l'utente e un
 * codice classificato. Non logga mai il messaggio grezzo dell'errore né il
 * contenuto della richiesta/risposta: solo metadati (kind, durata, model,
 * ed eventualmente lo status HTTP già estratto dal messaggio sanificato di
 * DeepSeekClient, che a sua volta non include mai body/segreti).
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
      message: "Il provider AI non ha risposto in tempo. Riprova tra qualche istante.",
    };
  }

  const message = error instanceof Error ? error.message : "";

  if (/HTTP 429/.test(message)) {
    logClassifiedError(kind, "rate_limited", durationMs, model);
    return {
      code: "rate_limited",
      message:
        "Il provider AI ha limitato le richieste (troppo frequenti). Riprova tra qualche minuto.",
    };
  }

  if (/non è JSON valido|non conforme allo schema/.test(message)) {
    logClassifiedError(kind, "invalid_response", durationMs, model);
    return {
      code: "invalid_response",
      message: "Il provider AI ha restituito una risposta non valida. Riprova.",
    };
  }

  if (/^DeepSeek ha risposto con HTTP \d+$/.test(message)) {
    logClassifiedError(kind, "provider_error", durationMs, model);
    return {
      code: "provider_error",
      message: "Il provider AI non è raggiungibile al momento. Riprova più tardi.",
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
