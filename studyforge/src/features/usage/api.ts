import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getIpc } from "@/lib/ipc";

export const cloudAiUsageTodayQueryKey = ["usage", "cloud-ai-today"] as const;

export function useCloudAiUsageToday() {
  return useQuery({
    queryKey: cloudAiUsageTodayQueryKey,
    queryFn: () => getIpc().usage.getCloudAiToday(),
    staleTime: 30_000,
  });
}

/** Da chiamare in `onSuccess` di ogni mutation che consuma il budget AI cloud, per riflettere subito il nuovo conteggio. */
export function useInvalidateCloudAiUsageToday() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: cloudAiUsageTodayQueryKey });
}
