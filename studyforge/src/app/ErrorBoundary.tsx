import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
     
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-base-100 p-8">
          <div className="card max-w-md bg-base-200 shadow-xl">
            <div className="card-body items-center text-center">
              <AlertTriangle className="size-10 text-warning" />
              <h2 className="card-title">Qualcosa è andato storto</h2>
              <p className="text-base-content/70 text-sm">{this.state.error.message}</p>
              <button className="btn btn-primary btn-sm mt-2" onClick={() => this.setState({ error: null })}>
                Riprova
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
