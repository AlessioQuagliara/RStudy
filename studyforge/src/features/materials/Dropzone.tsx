import { useState, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";

/**
 * Il drag&drop nel renderer fornisce solo i percorsi dei file trascinati
 * (`webUtils.getPathForFile` non è necessario: usiamo `file.path`, esposto da
 * Electron per i File trascinati anche con sandbox attivo). L'import vero e
 * proprio (copia + estrazione + indicizzazione) avviene nel main process.
 */
export function Dropzone({
  onFilesPicked,
  onFilesDropped,
}: {
  onFilesPicked: () => void;
  onFilesDropped: (paths: string[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => Boolean(p));
    if (paths.length > 0) onFilesDropped(paths);
  };

  return (
    <div
      className={`rounded-box border-2 border-dashed p-8 text-center transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-base-300"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      aria-label="Trascina qui i file oppure premi Invio per selezionarli"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onFilesPicked();
      }}
      onClick={onFilesPicked}
    >
      <UploadCloud className="text-base-content/40 mx-auto mb-2 size-8" aria-hidden="true" />
      <p className="text-sm font-medium">Trascina qui i materiali oppure clicca per selezionarli</p>
      <p className="text-base-content/50 mt-1 text-xs">Supportati: TXT, MD, PDF · DOCX best-effort</p>
    </div>
  );
}
