import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { getIpc } from "@/lib/ipc";
import { toast } from "@/lib/toastStore";

/** Sicurezza contro un microfono lasciato acceso per errore: ferma da sola dopo 5 minuti. */
const MAX_RECORDING_MS = 5 * 60 * 1000;

type DictationState = "idle" | "recording" | "transcribing";

/**
 * Pulsante di dettato: registra dal microfono (MediaRecorder, formato nativo
 * Chromium/webm), invia l'audio al main process (ai:transcribeAudio,
 * electron/ai/transcriptionClient.ts) e inserisce il testo trascritto nel
 * punto corrente del cursore dell'editor Tiptap passato. Il permesso
 * microfono è gestito lato Electron (electron/main/security.ts::applyPermissionPolicy);
 * qui gestiamo solo il rifiuto/errore dell'utente in modo esplicito, mai un
 * fallimento silenzioso.
 */
export function DictationButton({ editor }: { editor: Editor }) {
  const [state, setState] = useState<DictationState>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (maxDurationTimeoutRef.current) clearTimeout(maxDurationTimeoutRef.current);
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    };
  }, []);

  const startRecording = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Impossibile accedere al microfono: controlla i permessi del sistema per RStudy.");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => void handleRecordingStop(recorder.mimeType);

    recorder.start();
    setState("recording");
    setElapsedSec(0);
    elapsedIntervalRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    maxDurationTimeoutRef.current = setTimeout(() => stopRecording(), MAX_RECORDING_MS);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (maxDurationTimeoutRef.current) clearTimeout(maxDurationTimeoutRef.current);
    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    setState("transcribing");
  };

  const handleRecordingStop = async (mimeType: string) => {
    const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
    chunksRef.current = [];

    try {
      const audioBase64 = await blobToBase64(blob);
      const result = await getIpc().ai.transcribeAudio({ audioBase64, mimeType: blob.type || "audio/webm" });
      if (result.status === "success") {
        editor.chain().focus().insertContent(`${result.text} `).run();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Trascrizione fallita.");
    } finally {
      setState("idle");
    }
  };

  const label =
    state === "recording"
      ? `Ferma dettato (${formatElapsed(elapsedSec)})`
      : state === "transcribing"
        ? "Trascrizione in corso…"
        : "Detta appunti";

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-xs ${state === "recording" ? "text-error" : ""}`}
      onClick={state === "idle" ? () => void startRecording() : state === "recording" ? stopRecording : undefined}
      disabled={state === "transcribing"}
      aria-label={label}
      title={label}
    >
      {state === "idle" && <Mic className="size-4" />}
      {state === "recording" && (
        <>
          <Square className="size-4 animate-pulse" />
          <span className="text-xs tabular-nums">{formatElapsed(elapsedSec)}</span>
        </>
      )}
      {state === "transcribing" && <Loader2 className="size-4 animate-spin" />}
    </button>
  );
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // FileReader.readAsDataURL produce "data:<mime>;base64,<dati>": ci serve solo la parte dopo la virgola.
      const base64 = result.slice(result.indexOf(",") + 1);
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Lettura audio fallita."));
    reader.readAsDataURL(blob);
  });
}
