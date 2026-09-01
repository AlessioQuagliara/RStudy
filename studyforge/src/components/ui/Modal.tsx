import { type ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  title,
  onClose,
  children,
  boxClassName,
  hideHeader,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Classi aggiuntive per `modal-box` (es. larghezza custom): il default resta invariato per tutti gli usi esistenti. */
  boxClassName?: string;
  /**
   * Nasconde la riga titolo+X visibile (il titolo resta come heading
   * `sr-only`, così `aria-labelledby` continua a dare un nome accessibile al
   * dialog nativo). Usato quando il contenuto vuole gestire da sé il proprio
   * header/pulsante di chiusura (es. DuolingoQuiz) invece di duplicarlo.
   */
  hideHeader?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="modal-title"
    >
      <div className={cn("modal-box", boxClassName)}>
        {hideHeader ? (
          <h3 id="modal-title" className="sr-only">
            {title}
          </h3>
        ) : (
          <div className="mb-2 flex items-center justify-between">
            <h3 id="modal-title" className="text-lg font-semibold">
              {title}
            </h3>
            <button type="button" className="btn btn-sm btn-circle btn-ghost" aria-label="Chiudi" onClick={onClose}>
              <X className="size-4" />
            </button>
          </div>
        )}
        {children}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button aria-label="Chiudi modale">chiudi</button>
      </form>
    </dialog>
  );
}
