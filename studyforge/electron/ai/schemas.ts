import { z } from "zod";
import { lessonStudyPackSchema, studyOutlineTopicSchema } from "../shared/schemas";

export { lessonStudyPackSchema };

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
  const candidate = firstBrace >= 0 && lastBrace > firstBrace ? stripped.slice(firstBrace, lastBrace + 1) : stripped;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(candidate);
  } catch (error) {
    throw new Error(`Risposta AI non è JSON valido: ${error instanceof Error ? error.message : "errore parsing"}`);
  }

  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(`Risposta AI non conforme allo schema atteso: ${result.error.message}`);
  }
  return result.data;
}
