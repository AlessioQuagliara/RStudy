import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIpc } from "@/lib/ipc";
import type { MaterialType } from "@shared/schemas";

export const materialKeys = {
  byCourse: (courseId: string) => ["materials", "course", courseId] as const,
};

export function useMaterials(courseId: string | undefined) {
  return useQuery({
    queryKey: materialKeys.byCourse(courseId ?? ""),
    queryFn: () => getIpc().materials.listByCourse(courseId!),
    enabled: Boolean(courseId),
  });
}

export function usePickMaterialFiles() {
  return useMutation({ mutationFn: () => getIpc().materials.pickFiles() });
}

export function useImportMaterials(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { filePaths: string[]; materialType: MaterialType; lessonId?: string | null }) =>
      getIpc().materials.import({ courseId, ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: materialKeys.byCourse(courseId) }),
  });
}

export function useDeleteMaterial(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => getIpc().materials.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: materialKeys.byCourse(courseId) }),
  });
}
