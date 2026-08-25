import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIpc } from "@/lib/ipc";

export function useCourseSummary(courseId: string) {
  return useQuery({
    queryKey: ["course-summary", courseId],
    queryFn: () => getIpc().ai.getCourseSummary(courseId),
  });
}

export function useGenerateCourseSummary(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getIpc().ai.generateCourseSummary(courseId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["course-summary", courseId] }),
  });
}

export function useCourseChat(courseId: string) {
  return useMutation({
    mutationFn: (input: { question: string; activeLessonId?: string | null }) =>
      getIpc().rag.query(courseId, input.question, input.activeLessonId ?? null),
  });
}

export function useTestDeepSeekConnection() {
  return useMutation({ mutationFn: () => getIpc().ai.testConnection() });
}

export function useIsAiConfigured() {
  return useQuery({
    queryKey: ["settings", "api-key-status"],
    queryFn: () => getIpc().settings.getApiKeyStatus(),
  });
}
