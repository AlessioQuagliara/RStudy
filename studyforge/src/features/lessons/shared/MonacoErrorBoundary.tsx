import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Variante compatta di src/app/ErrorBoundary.tsx (stessa struttura/logica),
 * pensata per un riquadro inline (nel quiz o nella presentazione) invece che
 * per un errore a schermo intero: se Monaco non riesce a caricarsi/
 * inizializzarsi (bundle mancante, ambiente non supportato), mostra un
 * fallback chiaro invece di far crashare l'intero componente ospite.
 */
export class MonacoErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[MonacoErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="alert alert-warning flex-col items-start gap-2 text-left text-sm">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Editor di codice non disponibile
          </div>
          <p>
            Non è stato possibile inizializzare l&apos;editor in questo momento. Puoi comunque leggere il resto del
            contenuto e proseguire.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => this.setState({ error: null })}>
            Riprova
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
