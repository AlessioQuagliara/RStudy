import { CheckCircle2, Info, XCircle, X } from "lucide-react";
import { useToastStore, type ToastKind } from "@/lib/toastStore";

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const ALERT_CLASS: Record<ToastKind, string> = {
  success: "alert-success",
  error: "alert-error",
  info: "alert-info",
};

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="toast toast-end toast-bottom z-50" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div key={t.id} className={`alert ${ALERT_CLASS[t.kind]} shadow-lg`}>
            <Icon className="size-4" aria-hidden="true" />
            <span className="text-sm">{t.message}</span>
            <button
              type="button"
              className="btn btn-ghost btn-xs btn-circle"
              aria-label="Chiudi notifica"
              onClick={() => dismiss(t.id)}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
