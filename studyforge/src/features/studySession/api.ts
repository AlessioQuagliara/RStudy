import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIpc } from "@/lib/ipc";

function statusQueryKey(courseId: string) {
  return ["study-session", "status", courseId] as const;
}

/**
 * Poll dello stato via IPC (nessun push main->renderer nel progetto, stesso
 * pattern di useModelStatus in src/features/settings/api.ts): intervallo
 * breve solo mentre il job è "queued"/"running", altrimenti niente polling.
 */
export function useStudySessionStatus(courseId: string) {
  return useQuery({
    queryKey: statusQueryKey(courseId),
    queryFn: () => getIpc().studySession.getStatus(courseId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 1500 : false;
    },
  });
}

export function useGenerateStudySession(courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => getIpc().studySession.generate(courseId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: statusQueryKey(courseId) }),
  });
}

export function useDownloadStudySession(courseId: string) {
  return useMutation({ mutationFn: () => getIpc().studySession.download(courseId) });
}
