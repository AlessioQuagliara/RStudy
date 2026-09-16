import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getIpc } from "@/lib/ipc";

export function useLicenseStatus() {
  return useQuery({ queryKey: ["license", "status"], queryFn: () => getIpc().license.getStatus() });
}

export function useActivateLicense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (licenseKey: string) => getIpc().license.activate(licenseKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["license", "status"] }),
  });
}
