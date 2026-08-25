import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIpc } from "@/lib/ipc";
import type { CreateFlashcardInput, UpdateFlashcardInput, Difficulty } from "@shared/schemas";

export const flashcardKeys = {
  byCourse: (courseId: string) => ["flashcards", "course", courseId] as const,
  dueToday: ["flashcards", "due-today"] as const,
};

export function useFlashcardsByCourse(courseId: string | undefined) {
  return useQuery({
    queryKey: flashcardKeys.byCourse(courseId ?? ""),
    queryFn: () => getIpc().flashcards.listByCourse(courseId!),
    enabled: Boolean(courseId),
  });
}

export function useDueTodayFlashcards() {
  return useQuery({ queryKey: flashcardKeys.dueToday, queryFn: () => getIpc().flashcards.dueToday() });
}

function useInvalidateFlashcards(courseId?: string) {
  const queryClient = useQueryClient();
  return () => {
    if (courseId) {
      queryClient.invalidateQueries({ queryKey: flashcardKeys.byCourse(courseId) });
      queryClient.invalidateQueries({ queryKey: flashcardKeys.dueToday });
    } else {
      // Ambito multi-corso (es. pagina Flashcard globale): invalida tutte le liste per corso + dueToday.
      queryClient.invalidateQueries({ queryKey: ["flashcards"] });
    }
  };
}

export function useCreateFlashcard(courseId: string) {
  const invalidate = useInvalidateFlashcards(courseId);
  return useMutation({
    mutationFn: (input: CreateFlashcardInput) => getIpc().flashcards.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdateFlashcard(courseId?: string) {
  const invalidate = useInvalidateFlashcards(courseId);
  return useMutation({
    mutationFn: (input: UpdateFlashcardInput) => getIpc().flashcards.update(input),
    onSuccess: invalidate,
  });
}

export function useDuplicateFlashcard(courseId?: string) {
  const invalidate = useInvalidateFlashcards(courseId);
  return useMutation({
    mutationFn: (id: string) => getIpc().flashcards.duplicate(id),
    onSuccess: invalidate,
  });
}

export function useDeleteFlashcard(courseId?: string) {
  const invalidate = useInvalidateFlashcards(courseId);
  return useMutation({
    mutationFn: (id: string) => getIpc().flashcards.delete(id),
    onSuccess: invalidate,
  });
}

export function useReviewFlashcard(courseId?: string) {
  const invalidate = useInvalidateFlashcards(courseId);
  return useMutation({
    mutationFn: (input: { id: string; grade: Difficulty }) => getIpc().flashcards.review(input),
    onSuccess: invalidate,
  });
}
