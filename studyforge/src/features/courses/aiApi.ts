import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIpc } from "@/lib/ipc";
import { cloudAiUsageTodayQueryKey } from "@/features/usage/api";

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-summary", courseId] });
      queryClient.invalidateQueries({ queryKey: cloudAiUsageTodayQueryKey });
    },
  });
}

export function useCourseChat(courseId: string) {
  return useMutation({
    mutationFn: (input: { question: string; activeLessonId?: string | null }) =>
      getIpc().rag.query(courseId, input.question, input.activeLessonId ?? null),
  });
}

export function useTestLocalAiConnection() {
  return useMutation({ mutationFn: () => getIpc().ai.testConnection() });
}

export function useIsAiConfigured() {
  return useQuery({
    queryKey: ["ai", "model-status"],
    queryFn: () => getIpc().ai.getModelStatus(),
    select: (status) => status.state === "ready",
  });
}
