import { useState } from "react";
import { BookOpen, Download, AlertCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useLessons } from "@/features/lessons/api";
import { useGenerateStudySession, useStudySessionStatus, useDownloadStudySession } from "@/features/studySession/api";
import { toast } from "@/lib/toastStore";
import type { StudySessionStep } from "@shared/schemas";

const STEP_LABEL: Record<StudySessionStep, string> = {
  collect: "Raccolta contenuti",
  analyze: "Analisi lezioni",
  design: "Creazione struttura",
  author: "Generazione capitoli",
  review: "Revisione e coerenza",
  render: "Creazione PDF",
};

export function StudySessionPanel({ courseId }: { courseId: string }) {
  const { data: lessons = [] } = useLessons(courseId);
  const { data: status } = useStudySessionStatus(courseId);
  const generate = useGenerateStudySession(courseId);
  const download = useDownloadStudySession(courseId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isActive = status?.status === "queued" || status?.status === "running";
  const hasExistingPdf = Boolean(status?.pdfFileName) || status?.status === "ready";

  const handleConfirm = async () => {
    setConfirmOpen(false);
    const outcome = await generate.mutateAsync();
    if (outcome.status === "rejected") {
      toast.error(outcome.message);
    } else {
      toast.info("Generazione avviata: puoi lasciare questa pagina, riprenderà da qui al tuo ritorno.");
    }
  };

  const handleDownload = async () => {
    const result = await download.mutateAsync();
    if (result.ok) toast.success(`PDF salvato in ${result.filePath}`);
  };

  return (
    <div className="bg-base-100 rounded-box flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <BookOpen className="size-4" /> Sessione studio
          </h3>
          <p className="text-base-content/60 text-sm">
            Genera un libro di studio PDF completo, costruito da tutte le lezioni del corso.
          </p>
        </div>
        <div className="flex gap-2">
          {status?.status === "ready" && (
            <button type="button" className="btn btn-sm" onClick={handleDownload} disabled={download.isPending}>
              {download.isPending ? <span className="loading loading-spinner loading-xs" /> : <Download className="size-4" />}
              Scarica PDF
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setConfirmOpen(true)}
            disabled={lessons.length === 0 || isActive || generate.isPending}
          >
            {isActive ? <span className="loading loading-spinner loading-xs" /> : <BookOpen className="size-4" />}
            Genera sessione studio
          </button>
        </div>
      </div>

      {lessons.length === 0 && (
        <div className="alert alert-info text-sm">
          <AlertCircle className="size-4" />
          <span>Aggiungi almeno una lezione con appunti per generare la sessione studio.</span>
        </div>
      )}

      {status && status.status !== "failed" && (isActive || status.status === "ready") && (
        <div className="flex flex-col gap-1">
          <progress className="progress progress-primary w-full" value={status.progressPercentage} max={100} />
          <p className="text-base-content/60 text-xs">
            {status.status === "ready"
              ? `Completato · ${status.pdfFileName}`
              : status.currentStep
                ? STEP_LABEL[status.currentStep]
                : "In attesa"}
          </p>
        </div>
      )}

      {status?.status === "failed" && (
        <div className="alert alert-error text-sm">
          <AlertCircle className="size-4" />
          <span>{status.errorMessage ?? "Generazione non riuscita."}</span>
        </div>
      )}

      <Modal open={confirmOpen} title="Genera sessione studio" onClose={() => setConfirmOpen(false)} boxClassName="max-w-md">
        <div className="flex flex-col gap-3 text-sm">
          <p>Verranno elaborate tutte le lezioni attualmente incluse nel corso ({lessons.length}).</p>
          <p>La generazione è un processo multi-fase e può richiedere alcuni minuti.</p>
          {hasExistingPdf && <p className="text-warning">Il PDF esistente verrà sostituito da quello nuovo una volta completata la generazione.</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className="btn btn-sm" onClick={() => setConfirmOpen(false)}>
              Annulla
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleConfirm()}>
              Genera
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
