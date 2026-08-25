import { useQueries } from "@tanstack/react-query";
import { useCourses } from "@/features/courses/api";
import { useDueTodayFlashcards } from "@/features/flashcards/api";
import { getIpc } from "@/lib/ipc";
import { lessonKeys } from "@/features/lessons/api";

export function useDashboardStats() {
  const coursesQuery = useCourses();
  const dueTodayQuery = useDueTodayFlashcards();
  const courses = coursesQuery.data ?? [];

  const lessonsQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: lessonKeys.byCourse(c.id),
      queryFn: () => getIpc().lessons.listByCourse(c.id),
      enabled: courses.length > 0,
    })),
  });

  const isLoading = coursesQuery.isLoading || lessonsQueries.some((q) => q.isLoading);
  const activeCourses = courses.filter((c) => c.status === "active");
  const totalCfu = activeCourses.reduce((sum, c) => sum + c.cfu, 0);

  const nextExam = activeCourses
    .filter((c) => c.examDate)
    .sort((a, b) => (a.examDate! < b.examDate! ? -1 : 1))[0];

  let completedLessons = 0;
  let totalLessons = 0;
  for (const q of lessonsQueries) {
    const lessons = q.data ?? [];
    completedLessons += lessons.filter((l) => l.status === "completed").length;
    totalLessons += lessons.length;
  }

  const recentActivity = [...courses]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 5);

  return {
    isLoading,
    activeCoursesCount: activeCourses.length,
    totalCfu,
    nextExam,
    completedLessons,
    totalLessons,
    dueTodayCount: dueTodayQuery.data?.length ?? 0,
    recentActivity,
  };
}
