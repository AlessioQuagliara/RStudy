import { useEffect, useId, useRef, useState } from "react";
import { Copy, Maximize2, X, AlertTriangle } from "lucide-react";
import { useUiStore } from "@/lib/uiStore";
import { looksLikeMermaidDiagram, removeLeakedMermaidNodes, stripMermaidCodeFence } from "@/lib/mermaidFallback";
import { toast } from "@/lib/toastStore";

export function MermaidDiagram({ code }: { code: string }) {
  const id = useId().replace(/:/g, "-");
  const containerRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const theme = useUiStore((s) => s.theme);
  const cleaned = stripMermaidCodeFence(code);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!cleaned || !looksLikeMermaidDiagram(cleaned)) {
        setError("Il diagramma generato non è in un formato Mermaid riconosciuto.");
        setSvg(null);
        return;
      }
      const renderId = `mermaid-${id}-${Date.now()}`;
      try {
        const mermaid = (await import("mermaid")).default;
        const isDark =
          theme === "dark" ||
          (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: isDark ? "dark" : "default",
        });
        const { svg: rendered } = await mermaid.render(renderId, cleaned);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError("Impossibile renderizzare il diagramma Mermaid.");
          setSvg(null);
        }
        removeLeakedMermaidNodes(renderId);
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [cleaned, id, theme]);

  useEffect(() => {
    if (containerRef.current && svg) {
      containerRef.current.innerHTML = svg;
    }
  }, [svg]);

  useEffect(() => {
    if (expandedRef.current && svg && expanded) {
      expandedRef.current.innerHTML = svg;
    }
  }, [svg, expanded]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(cleaned);
      toast.success("Codice Mermaid copiato");
    } catch {
      toast.error("Impossibile copiare il codice");
    }
  };

  return (
    <div className="rounded-box border-base-300 bg-base-100 border">
      <div className="flex items-center justify-between gap-2 border-b border-base-300 px-3 py-2">
        <span className="text-base-content/60 text-xs font-medium">Diagramma Mermaid</span>
        <div className="flex gap-1">
          <button type="button" className="btn btn-ghost btn-xs" onClick={copyCode} aria-label="Copia codice Mermaid">
            <Copy className="size-3.5" />
          </button>
          {svg && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setExpanded(true)}
              aria-label="Espandi diagramma"
            >
              <Maximize2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-3">
        {error && (
          <div className="alert alert-warning items-start text-sm">
            <AlertTriangle className="size-4 shrink-0" />
            <div>
              <p>{error}</p>
              <pre className="bg-base-200 mt-2 max-h-40 overflow-auto rounded p-2 text-xs whitespace-pre-wrap">
                {cleaned || "(vuoto)"}
              </pre>
            </div>
          </div>
        )}
        {!error && svg && <div ref={containerRef} className="flex justify-center overflow-x-auto" />}
        {!error && !svg && <div className="skeleton h-40 w-full" aria-label="Rendering diagramma in corso" />}
      </div>

      {expanded && svg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Diagramma Mermaid espanso"
        >
          <div className="bg-base-100 relative max-h-full max-w-full overflow-auto rounded-box p-6">
            <button
              type="button"
              className="btn btn-sm btn-circle btn-ghost absolute top-2 right-2"
              onClick={() => setExpanded(false)}
              aria-label="Chiudi vista espansa"
            >
              <X className="size-4" />
            </button>
            <div ref={expandedRef} />
          </div>
        </div>
      )}
    </div>
  );
}
