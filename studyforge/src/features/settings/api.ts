import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIpc } from "@/lib/ipc";
import type { UpdateSettingsInput } from "@shared/schemas";

export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => getIpc().settings.get() });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSettingsInput) => getIpc().settings.update(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });
}

export function useApiKeyStatus() {
  return useQuery({ queryKey: ["settings", "api-key-status"], queryFn: () => getIpc().settings.getApiKeyStatus() });
}

export function useSetApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) => getIpc().settings.setApiKey(apiKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "api-key-status"] }),
  });
}

export function useClearApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getIpc().settings.clearApiKey(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings", "api-key-status"] }),
  });
}

export function usePickImportFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getIpc().settings.pickImportFolder(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });
}

export function useExportBackup() {
  return useMutation({ mutationFn: () => getIpc().backup.export() });
}

export function usePickBackupFile() {
  return useMutation({ mutationFn: () => getIpc().backup.pickImportFile() });
}

export function useImportBackup() {
  return useMutation({ mutationFn: (filePath: string) => getIpc().backup.import(filePath) });
}
