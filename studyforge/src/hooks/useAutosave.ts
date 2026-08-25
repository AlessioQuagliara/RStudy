import { useCallback, useRef, useState } from "react";
import { useDebouncedCallback } from "@/hooks/useDebounce";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export function useAutosave<T>(save: (value: T) => Promise<void>, delayMs = 1200) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const latestValue = useRef<T | null>(null);

  const runSave = useCallback(
    async (value: T) => {
      setStatus("saving");
      try {
        await save(value);
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    },
    [save],
  );

  const debouncedSave = useDebouncedCallback((value: T) => {
    void runSave(value);
  }, delayMs);

  const notifyChange = useCallback(
    (value: T) => {
      latestValue.current = value;
      setStatus("saving");
      debouncedSave(value);
    },
    [debouncedSave],
  );

  const saveNow = useCallback(async () => {
    if (latestValue.current !== null) {
      await runSave(latestValue.current);
    }
  }, [runSave]);

  return { status, notifyChange, saveNow };
}
