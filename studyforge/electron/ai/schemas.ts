import { z } from "zod";
import {
  lessonStudyPackSchema,
  studyOutlineTopicSchema,
  exerciseSchema,
  presentationSlideSchema,
} from "../shared/schemas";

export { lessonStudyPackSchema };

/**
 * Versione corrente dello schema di contenuto che chiediamo al modello per
 * esercizi/presentazione (electron/ai/prompts.ts) e che stampiamo nel campo
 * `version` dell'oggetto finale (electron/shared/schemas.ts::exerciseSetSchema/
 * presentationSchema). Non è il modello AI né il prompt: è la versione del
 * NOSTRO contratto di contenuto, mai fornita dal modello (vedi
 * ExerciseSetModelResponse/PresentationModelResponse sotto: il modello non
 * restituisce affatto `version`/`sourceLessonId`/`generatedAt`, li stampiamo
 * noi dopo la validazione, per non dipendere dalla sua affidabilità su
 * metadati che dovremmo già conoscere con certezza).
 */
export const EXERCISE_SET_SCHEMA_VERSION = 1;
export const PRESENTATION_SCHEMA_VERSION = 1;

/**
 * Forma "solo contenuto" richiesta al modello per un set di esercizi: niente
 * `version`/`sourceLessonId`/`generatedAt` (metadati che il chiamante
 * conosce già con certezza e stampa dopo la validazione, vedi
 * electron/ai/openAiCompatibleStudyGenerator.ts). Riusa `exerciseSchema`
 * (electron/shared/schemas.ts) per la validazione di ogni singolo esercizio:
 * stessa unica fonte di verità usata dal contratto IPC/persistenza.
 */
export const exerciseSetModelResponseSchema = z.object({
  title: z.string().min(1),
  exercises: z.array(exerciseSchema).min(3).max(8),
});
export type ExerciseSetModelResponse = z.infer<typeof exerciseSetModelResponseSchema>;

/** Analogo di exerciseSetModelResponseSchema, per la presentazione. */
export const presentationModelResponseSchema = z.object({
  title: z.string().min(1),
  slides: z.array(presentationSlideSchema).min(3).max(20),
});
export type PresentationModelResponse = z.infer<typeof presentationModelResponseSchema>;

export const courseSummaryResponseSchema = z.object({
  comprehensive_summary_markdown: z.string(),
  course_outline: z.array(studyOutlineTopicSchema),
  mermaid_diagram: z.string(),
  suggested_study_plan: z.array(
    z.object({
      block: z.string(),
      focus: z.string(),
      lessons_covered: z.array(z.string()),
    }),
  ),
});
export type CourseSummaryResponse = z.infer<typeof courseSummaryResponseSchema>;

/**
 * Estrae e valida un JSON dalla risposta grezza del modello. DeepSeek in JSON
 * mode dovrebbe restituire JSON puro, ma il parsing resta difensivo nel caso
 * il modello aggiunga testo o blocchi markdown attorno.
 */
export function parseModelJson<T>(raw: string, schema: z.ZodType<T>): T {
  const stripped = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  const candidate =
    firstBrace >= 0 && lastBrace > firstBrace
      ? stripped.slice(firstBrace, lastBrace + 1)
      : stripped;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(candidate);
  } catch (error) {
    throw new Error(
      `Risposta AI non è JSON valido: ${error instanceof Error ? error.message : "errore parsing"}`,
    );
  }

  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(`Risposta AI non conforme allo schema atteso: ${result.error.message}`);
  }
  return result.data;
}
