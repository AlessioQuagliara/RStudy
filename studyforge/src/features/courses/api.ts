import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIpc } from "@/lib/ipc";
import type { CreateCourseInput, UpdateCourseInput } from "@shared/schemas";

export const courseKeys = {
  all: ["courses"] as const,
  detail: (id: string) => ["courses", id] as const,
};

export function useCourses() {
  return useQuery({ queryKey: courseKeys.all, queryFn: () => getIpc().courses.list() });
}

export function useCourse(id: string | undefined) {
  return useQuery({
    queryKey: courseKeys.detail(id ?? ""),
    queryFn: () => getIpc().courses.get(id!),
    enabled: Boolean(id),
  });
}

export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCourseInput) => getIpc().courses.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: courseKeys.all }),
  });
}

export function useUpdateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCourseInput) => getIpc().courses.update(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: courseKeys.all });
      queryClient.invalidateQueries({ queryKey: courseKeys.detail(variables.id) });
    },
  });
}

export function useDeleteCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getIpc().courses.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: courseKeys.all }),
  });
}
