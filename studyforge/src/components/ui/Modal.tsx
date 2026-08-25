import { type ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
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
      <div className="modal-box">
        <div className="mb-2 flex items-center justify-between">
          <h3 id="modal-title" className="text-lg font-semibold">
            {title}
          </h3>
          <button type="button" className="btn btn-sm btn-circle btn-ghost" aria-label="Chiudi" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
      <form method="dialog" className="modal-backdrop">
        <button aria-label="Chiudi modale">chiudi</button>
      </form>
    </dialog>
  );
}
