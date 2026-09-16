import type { Db } from "../../db/client";
import { tryCreateStudyGenerator } from "../../ai/factory";
import { generateLessonExerciseSet } from "../../ai/exerciseSet";
import { generateLessonPresentation } from "../../ai/presentation";
import { safeHandle, type IpcContext } from "../safeHandle";

/**
 * Handler per esercizi/presentazione generati dall'AI (electron/ai/exerciseSet.ts,
 * electron/ai/presentation.ts). Separati dagli handler `ai:*` esistenti
 * (electron/ipc/handlers/ai.ts, study pack/riassunto corso) perché espongono
 * un servizio distinto (AiStudyGenerator) con un proprio namespace preload
 * (`rstudy.studyAi`), non perché duplichino logica.
 * L'input non contiene mai il testo della lezione (vedi
 * generateLessonExercisesInputSchema/generateLessonPresentationInputSchema in
 * electron/shared/schemas.ts): safeHandle valida solo lessonId+opzioni, gli
 * appunti sono letti dal main da `lessons.notesPlainText`. L'output è sempre
 * l'envelope discriminato { status, data|error, fromCache }, mai un'eccezione
 * grezza: nessuno stack trace, nessuna chiave, nessun URL può arrivare al
 * renderer da qui.
 */
export function registerStudyAiHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("studyAi:generateExercises", ctx, async (input) => {
    const handle = await tryCreateStudyGenerator(db);
    return generateLessonExerciseSet(db, handle, input);
  });

  safeHandle("studyAi:generatePresentation", ctx, async (input) => {
    const handle = await tryCreateStudyGenerator(db);
    return generateLessonPresentation(db, handle, input);
  });
}
