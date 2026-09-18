import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CHANGELOG, LATEST_CHANGELOG_VERSION } from "@/lib/changelog";

const LAST_SEEN_KEY = "rstudy:lastSeenChangelogVersion";

/**
 * Legge/scrive `localStorage` in try/catch: può lanciare (private
 * browsing/policy del sistema) o essere semplicemente assente, e la
 * funzione non deve mai rompere il render della Sidebar per questo — nel
 * peggiore dei casi il pallino "novità" resta visibile più a lungo del
 * dovuto, non è un problema che giustifichi un crash.
 */
function readLastSeenVersion(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

function writeLastSeenVersion(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, version);
  } catch {
    // Ignorato di proposito: vedi commento sopra.
  }
}

/**
 * Punto d'ingresso "Novità" non invasivo: nessun popup automatico
 * all'avvio, solo un pulsante sempre presente in Sidebar con un pallino se
 * c'è una versione del changelog non ancora vista. L'utente apre quando
 * vuole, mai un'interruzione imposta.
 */
export function ChangelogPanel() {
  const [open, setOpen] = useState(false);
  const [hasUnseen, setHasUnseen] = useState(false);

  useEffect(() => {
    if (!LATEST_CHANGELOG_VERSION) return;
    setHasUnseen(readLastSeenVersion() !== LATEST_CHANGELOG_VERSION);
  }, []);

  const handleOpen = () => {
    setOpen(true);
    if (LATEST_CHANGELOG_VERSION) {
      writeLastSeenVersion(LATEST_CHANGELOG_VERSION);
      setHasUnseen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm mx-2 mb-1 justify-start gap-2 normal-case"
        onClick={handleOpen}
      >
        <span className="relative inline-flex">
          <Sparkles className="size-4" aria-hidden="true" />
          {hasUnseen && (
            <span className="bg-primary absolute -top-0.5 -right-0.5 size-1.5 rounded-full" aria-hidden="true" />
          )}
        </span>
        Novità
      </button>

      <Modal open={open} title="Novità" onClose={() => setOpen(false)} boxClassName="max-w-lg">
        <div className="flex flex-col gap-5">
          {CHANGELOG.map((entry) => (
            <div key={entry.version}>
              <p className="text-base-content/60 text-xs font-medium">
                Versione {entry.version} · {new Date(entry.date).toLocaleDateString("it-IT")}
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
