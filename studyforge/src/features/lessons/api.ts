import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIpc } from "@/lib/ipc";
import type { CreateLessonInput, UpdateLessonInput, SaveLessonNotesInput } from "@shared/schemas";
import { courseKeys } from "@/features/courses/api";

export const lessonKeys = {
  byCourse: (courseId: string) => ["lessons", "course", courseId] as const,
  detail: (id: string) => ["lessons", id] as const,
  aiOutput: (id: string) => ["lessons", id, "ai-output"] as const,
};

export function useLessons(courseId: string | undefined) {
  return useQuery({
    queryKey: lessonKeys.byCourse(courseId ?? ""),
    queryFn: () => getIpc().lessons.listByCourse(courseId!),
    enabled: Boolean(courseId),
  });
}

export function useLesson(id: string | undefined) {
  return useQuery({
    queryKey: lessonKeys.detail(id ?? ""),
    queryFn: () => getIpc().lessons.get(id!),
    enabled: Boolean(id),
  });
}

export function useCreateLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLessonInput) => getIpc().lessons.create(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: lessonKeys.byCourse(variables.courseId) });
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(variables.courseId) });
    },
  });
}

export function useUpdateLesson(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLessonInput) => getIpc().lessons.update(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: lessonKeys.byCourse(courseId) });
      queryClient.invalidateQueries({ queryKey: lessonKeys.detail(variables.id) });
    },
  });
}

export function useSaveLessonNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveLessonNotesInput) => getIpc().lessons.saveNotes(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: lessonKeys.detail(variables.id) });
    },
  });
}

export function useDeleteLesson(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getIpc().lessons.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: lessonKeys.byCourse(courseId) }),
  });
}
