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

export function useModelStatus() {
  return useQuery({
    queryKey: ["ai", "model-status"],
    queryFn: () => getIpc().ai.getModelStatus(),
    refetchInterval: (query) => (query.state.data?.state === "downloading" ? 800 : false),
  });
}

export function useDownloadModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getIpc().ai.downloadModel(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai", "model-status"] }),
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

export function useAppVersion() {
  return useQuery({ queryKey: ["app", "version"], queryFn: () => getIpc().app.getVersion() });
}

export function useUpdateStatus() {
  return useQuery({
    queryKey: ["updates", "status"],
    queryFn: () => getIpc().updates.getStatus(),
    refetchInterval: (query) =>
      query.state.data?.state === "checking" || query.state.data?.state === "downloading" ? 800 : false,
  });
}

export function useCheckForUpdates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getIpc().updates.check(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["updates", "status"] }),
  });
}

export function useQuitAndInstallUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getIpc().updates.quitAndInstall(),
    // Se fallisce, updaterService.ts porta lo stato a "error" lato main:
    // invalida la query così la card in Impostazioni mostra subito il
    // motivo reale invece di lasciare il pulsante apparentemente inerte.
    onError: () => queryClient.invalidateQueries({ queryKey: ["updates", "status"] }),
  });
}
