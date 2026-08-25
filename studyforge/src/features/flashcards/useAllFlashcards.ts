import { useQueries } from "@tanstack/react-query";
import { useCourses } from "@/features/courses/api";
import { flashcardKeys } from "@/features/flashcards/api";
import { getIpc } from "@/lib/ipc";

export function useAllFlashcards() {
  const coursesQuery = useCourses();
  const courses = coursesQuery.data ?? [];

  const flashcardQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: flashcardKeys.byCourse(c.id),
      queryFn: () => getIpc().flashcards.listByCourse(c.id),
      enabled: courses.length > 0,
    })),
  });

  const all = flashcardQueries.flatMap((q) => q.data ?? []);
  return {
    courses,
    cards: all,
    isLoading: coursesQuery.isLoading || flashcardQueries.some((q) => q.isLoading),
  };
}
