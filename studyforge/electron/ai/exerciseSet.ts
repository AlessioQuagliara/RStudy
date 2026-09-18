import type { z } from "zod";
import type { Db } from "../db/client";
import { LessonAiGenerationsRepo, LessonsRepo } from "../db/repositories";
import { computeSourceContentHash } from "./contentHash";
import type { StudyGeneratorHandle } from "./factory";
import {
  exerciseSetGenerationOutcomeSchema,
  generateLessonExercisesInputSchema,
  type ExerciseSetGenerationOutcome,
  type ExerciseSetGenerationResult,
  type GenerateLessonExercisesInput,
} from "../shared/schemas";

/** Forma dopo l'applicazione dei default Zod (requestedCount/locale sempre presenti): vedi il commento su GenerateLessonExercisesInput in electron/shared/schemas.ts. */
type ResolvedGenerateLessonExercisesInput = z.infer<typeof generateLessonExercisesInputSchema>;

/** Versione target del contenuto per un tentativo "failed": non c'è payload da cui leggere `.version`. */
const TARGET_EXERCISE_SET_SCHEMA_VERSION = 1;

/**
 * Deduplica richieste concorrenti per lo stesso lessonId+hash contenuto:
 * una seconda chiamata mentre la prima è ancora in corso riceve la STESSA
 * promise invece di innescare una seconda generazione (doppia spesa di
 * token, due righe DB in gara sull'indice unico parziale). Stato di
 * processo, non persistito: coerente con il single-instance lock già
 * imposto in electron/main/index.ts (un solo main process alla volta).
 */
const inFlightGenerations = new Map<string, Promise<ExerciseSetGenerationOutcome>>();

/**
 * Genera (o recupera dalla cache) un set di esercizi per una lezione.
 * Il renderer manda solo `lessonId` (+ opzioni): gli appunti (`sourceText`)
 * sono derivati qui da `lessons.notesPlainText`, mai spediti dal renderer
 * via IPC, stesso pattern di electron/ai/studyPack.ts::generateLessonStudyPack.
 * Ordine: 1) lookup lezione, 2) hash del contenuto, 3) dedup in-flight,
 * 4) lookup cache "ready", 5) se assente chiama il provider, salva l'esito
 * (ready o failed) e lo restituisce con `fromCache`.
 */
export async function generateLessonExerciseSet(
  db: Db,
  handle: StudyGeneratorHandle | null,
  rawInput: GenerateLessonExercisesInput,
): Promise<ExerciseSetGenerationOutcome> {
  const input = generateLessonExercisesInputSchema.parse(rawInput);

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
  input: ResolvedGenerateLessonExercisesInput,
  sourceText: string,
  sourceContentHash: string,
): Promise<ExerciseSetGenerationOutcome> {
  try {
    const cached = LessonAiGenerationsRepo.findCachedGeneration(db, {
      lessonId: input.lessonId,
      kind: "exercise_set",
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
            message: "Nessun modello AI configurato: scarica un modello locale o configura un provider cloud in Impostazioni.",
          },
        },
        false,
      );
    }

    const result = await handle.generator.generateExerciseSet({
      lessonId: input.lessonId,
      sourceText,
      subject: input.subject,
      requestedCount: input.requestedCount,
      locale: input.locale,
    });

    if (result.status === "success") {
      LessonAiGenerationsRepo.saveExerciseSet(db, {
        status: "ready",
        lessonId: input.lessonId,
        sourceContentHash,
        model: handle.model,
        payload: result.data,
      });
    } else {
      LessonAiGenerationsRepo.saveExerciseSet(db, {
        status: "failed",
        lessonId: input.lessonId,
        sourceContentHash,
        model: handle.model,
        schemaVersion: TARGET_EXERCISE_SET_SCHEMA_VERSION,
        errorMessage: result.error.message,
      });
    }

    return finalize(result, false);
  } catch {
    // Rete a parte gli errori già gestiti dall'adapter (che non lancia mai),
    // questo copre un imprevisto lato nostro (es. errore DB): non deve mai
    // propagare uno stack trace fino al renderer.
    return finalize(
      {
        status: "error",
        error: { code: "unknown", message: "Si è verificato un errore imprevisto." },
      },
      false,
    );
  }
}

/**
 * Rivalida l'intero envelope (incluso `fromCache`) con lo schema condiviso
 * prima di restituirlo: difesa in profondità end-to-end verso il boundary
 * IPC. `data`/`error` sono già stati validati a monte (dall'adapter o da
 * findCachedGeneration); questa chiamata garantisce che l'invariante regga
 * anche a fronte di un refactor futuro altrove.
 */
function finalize(
  result: ExerciseSetGenerationResult,
  fromCache: boolean,
): ExerciseSetGenerationOutcome {
  return exerciseSetGenerationOutcomeSchema.parse({ ...result, fromCache });
}
