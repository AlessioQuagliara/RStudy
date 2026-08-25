import { useQueries } from "@tanstack/react-query";
import { useCourses } from "@/features/courses/api";
import { lessonKeys } from "@/features/lessons/api";
import { getIpc } from "@/lib/ipc";

export function useCoursesWithProgress() {
  const coursesQuery = useCourses();
  const courses = coursesQuery.data ?? [];

  const lessonsQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: lessonKeys.byCourse(c.id),
      queryFn: () => getIpc().lessons.listByCourse(c.id),
      enabled: courses.length > 0,
    })),
  });

  const items = courses.map((course, i) => {
    const lessons = lessonsQueries[i]?.data ?? [];
    return {
      course,
      lessonsCompleted: lessons.filter((l) => l.status === "completed").length,
      lessonsTotal: course.targetLessons ?? lessons.length,
    };
  });

  return {
    items,
    isLoading: coursesQuery.isLoading || lessonsQueries.some((q) => q.isLoading),
  };
}
