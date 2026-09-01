import type { z } from "zod";
import type { Db } from "../db/client";
import { LessonAiGenerationsRepo, LessonsRepo } from "../db/repositories";
import { computeSourceContentHash } from "./contentHash";
import type { StudyGeneratorHandle } from "./factory";
import {
  presentationGenerationOutcomeSchema,
  generateLessonPresentationInputSchema,
  type PresentationGenerationOutcome,
  type PresentationGenerationResult,
  type GenerateLessonPresentationInput,
} from "../shared/schemas";

/** Forma dopo l'applicazione dei default Zod: vedi il commento gemello in exerciseSet.ts. */
type ResolvedGenerateLessonPresentationInput = z.infer<typeof generateLessonPresentationInputSchema>;

/** Versione target del contenuto per un tentativo "failed": non c'è payload da cui leggere `.version`. */
const TARGET_PRESENTATION_SCHEMA_VERSION = 1;

/** Dedup richieste concorrenti: vedi il commento gemello in exerciseSet.ts. Map separata: kind diverso, chiave implicitamente namespaced per modulo. */
const inFlightGenerations = new Map<string, Promise<PresentationGenerationOutcome>>();

/**
 * Genera (o recupera dalla cache) una presentazione di ripasso per una
 * lezione. Stessa logica di electron/ai/exerciseSet.ts::generateLessonExerciseSet
 * (vedi lì per il dettaglio di lookup lezione, dedup in-flight, cache,
 * salvataggio e fromCache), solo con kind="presentation".
 */
export async function generateLessonPresentation(
  db: Db,
  handle: StudyGeneratorHandle | null,
  rawInput: GenerateLessonPresentationInput,
): Promise<PresentationGenerationOutcome> {
  const input = generateLessonPresentationInputSchema.parse(rawInput);

  const lesson = LessonsRepo.get(db, input.lessonId);
  if (!lesson) {
    return finalize(
      { status: "error", error: { code: "not_found", message: "Lezione non trovata." } },
      false,
    );
  }

  const sourceText = lesson.notesPlainText ?? "";
  const sourceContentHash = computeSourceContentHash(sourceText);
  const inFlightKey = `${input.lessonId}:${sourceContentHash}`;

  const existing = inFlightGenerations.get(inFlightKey);
  if (existing) return existing;

  const promise = performGeneration(db, handle, input, sourceText, sourceContentHash).finally(
    () => {
      inFlightGenerations.delete(inFlightKey);
    },
  );
  inFlightGenerations.set(inFlightKey, promise);
  return promise;
}

async function performGeneration(
  db: Db,
  handle: StudyGeneratorHandle | null,
  input: ResolvedGenerateLessonPresentationInput,
  sourceText: string,
  sourceContentHash: string,
): Promise<PresentationGenerationOutcome> {
  try {
    const cached = LessonAiGenerationsRepo.findCachedGeneration(db, {
      lessonId: input.lessonId,
      kind: "presentation",
      sourceContentHash,
    });
    if (cached) {
      return finalize({ status: "success", data: cached.payload }, true);
    }

    if (!handle) {
      return finalize(
        {
          status: "error",
          error: {
            code: "not_configured",
            message: "Nessuna API key AI configurata. Vai in Impostazioni per aggiungerla.",
          },
        },
        false,
      );
    }

    const result = await handle.generator.generatePresentation({
      lessonId: input.lessonId,
      sourceText,
      subject: input.subject,
      requestedCount: input.requestedCount,
      locale: input.locale,
    });

    if (result.status === "success") {
      LessonAiGenerationsRepo.savePresentation(db, {
        status: "ready",
        lessonId: input.lessonId,
        sourceContentHash,
        model: handle.model,
        payload: result.data,
      });
    } else {
      LessonAiGenerationsRepo.savePresentation(db, {
        status: "failed",
        lessonId: input.lessonId,
        sourceContentHash,
        model: handle.model,
        schemaVersion: TARGET_PRESENTATION_SCHEMA_VERSION,
        errorMessage: result.error.message,
      });
    }

    return finalize(result, false);
  } catch {
    return finalize(
      {
        status: "error",
        error: { code: "unknown", message: "Si è verificato un errore imprevisto." },
      },
      false,
    );
  }
}

/** Difesa in profondità end-to-end: vedi il commento gemello in exerciseSet.ts. */
function finalize(
  result: PresentationGenerationResult,
  fromCache: boolean,
): PresentationGenerationOutcome {
  return presentationGenerationOutcomeSchema.parse({ ...result, fromCache });
}
