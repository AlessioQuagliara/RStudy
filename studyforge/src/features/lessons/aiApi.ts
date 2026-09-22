import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIpc } from "@/lib/ipc";
import { lessonKeys } from "@/features/lessons/api";
import { flashcardKeys } from "@/features/flashcards/api";
import { cloudAiUsageTodayQueryKey } from "@/features/usage/api";

export function useLessonAiOutput(lessonId: string | undefined) {
  return useQuery({
    queryKey: lessonKeys.aiOutput(lessonId ?? ""),
    queryFn: () => getIpc().ai.getLessonAiOutput(lessonId!),
    enabled: Boolean(lessonId),
  });
}

export function useGenerateLessonStudyPack(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lessonId: string) => getIpc().ai.generateLessonStudyPack(lessonId),
    onSuccess: (_data, lessonId) => {
      queryClient.invalidateQueries({ queryKey: lessonKeys.detail(lessonId) });
      queryClient.invalidateQueries({ queryKey: lessonKeys.aiOutput(lessonId) });
      queryClient.invalidateQueries({ queryKey: flashcardKeys.byCourse(courseId) });
      queryClient.invalidateQueries({ queryKey: flashcardKeys.dueToday });
      queryClient.invalidateQueries({ queryKey: cloudAiUsageTodayQueryKey });
    },
  });
}
