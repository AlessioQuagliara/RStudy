import { useMutation } from "@tanstack/react-query";
import { getIpc } from "@/lib/ipc";
import type {
  GenerateLessonExercisesInput,
  GenerateLessonPresentationInput,
  ExerciseSetGenerationOutcome,
  PresentationGenerationOutcome,
} from "@shared/schemas";

/**
 * Hook per `window.rstudy.studyAi.*` (electron/ipc/handlers/studyAi.ts):
 * separati da src/features/lessons/aiApi.ts (study pack/riassunto corso) per
 * rispecchiare la stessa separazione già fatta nel main process (namespace
 * preload `studyAi` distinto da `ai`). Nessuna query/cache locale: il
 * risultato vive nello stato della mutation di TanStack Query (`data`), non
 * duplicato in uno state del componente — la cache "vera" (hit/miss,
 * fromCache) è già gestita lato main da LessonAiGenerationsRepo.
 */
export function useGenerateLessonExercises() {
  return useMutation<ExerciseSetGenerationOutcome, Error, GenerateLessonExercisesInput>({
    mutationFn: (input) => getIpc().studyAi.generateExercises(input),
  });
}

export function useGenerateLessonPresentation() {
  return useMutation<PresentationGenerationOutcome, Error, GenerateLessonPresentationInput>({
    mutationFn: (input) => getIpc().studyAi.generatePresentation(input),
  });
}
