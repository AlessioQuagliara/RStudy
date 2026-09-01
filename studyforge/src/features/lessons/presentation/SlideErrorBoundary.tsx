import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Difesa per lo stato vuoto/fallback richiesto: se il rendering di UNA slide
 * lancia un'eccezione imprevista (dato malformato sfuggito alla validazione
 * Zod, bug futuro in un renderer di slide), mostra un messaggio chiaro al
 * posto di quella sola slide invece di far crashare l'intero
 * PresentationPlayer (header/controlli/chiudi restano sempre utilizzabili,
 * dato che vivono fuori da questo boundary).
 * Il chiamante deve montare questo componente con `key={slide.id}`: cambiare
 * `key` forza React a rimontarlo, azzerando lo stato di errore quando si
 * naviga a un'altra slide.
 */
export class SlideErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[SlideErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <AlertTriangle className="text-warning size-8" aria-hidden="true" />
          <p className="font-medium">Questa slide non può essere visualizzata</p>
          <p className="text-base-content/60 text-sm">Usa i controlli per passare a un'altra slide.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
