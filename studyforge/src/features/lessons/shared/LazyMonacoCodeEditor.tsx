import { lazy, Suspense } from "react";
import type { SupportedCodeLanguage } from "@shared/schemas";
import { MonacoErrorBoundary } from "./MonacoErrorBoundary";

// Import dinamico: Monaco (alcuni MB, tutte le lingue registrate anche se
// caricate poi pigramente per lingua) entra nel bundle solo quando lo
// studente incontra davvero del codice (esercizio o slide), non nel
// caricamento iniziale dell'app per tutti gli altri.
const MonacoCodeEditor = lazy(() => import("./MonacoCodeEditor").then((m) => ({ default: m.MonacoCodeEditor })));

/**
 * Wrapper condiviso: lazy-loading + fallback di caricamento + error boundary
 * attorno a MonacoCodeEditor. Un solo punto dove vivono questi tre livelli,
 * usato sia da CodingChallengeQuestion (editor modificabile) sia da
 * PresentationCodeSlideBlock (sempre `readOnly`).
 */
export function LazyMonacoCodeEditor({
  value,
  language,
  readOnly,
  onChange,
  height,
}: {
  value: string;
  language: SupportedCodeLanguage;
  readOnly: boolean;
  onChange: (value: string) => void;
  height?: string;
}) {
  return (
    <MonacoErrorBoundary>
      <Suspense
        fallback={
          <div className="bg-base-200 flex h-60 items-center justify-center gap-2 rounded-lg text-sm" role="status">
            <span className="loading loading-spinner loading-sm" />
            Caricamento editor di codice...
          </div>
        }
      >
        <MonacoCodeEditor value={value} language={language} readOnly={readOnly} onChange={onChange} height={height} />
      </Suspense>
    </MonacoErrorBoundary>
  );
}
