const KNOWN_DIAGRAM_KEYWORDS = [
  "mindmap",
  "flowchart",
  "graph",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "erDiagram",
  "journey",
  "gantt",
  "pie",
  "timeline",
];

/**
 * Ripulisce codice Mermaid da eventuali blocchi markdown (```mermaid ... ```)
 * che il modello potrebbe aver aggiunto nonostante le istruzioni del prompt.
 */
export function stripMermaidCodeFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```mermaid\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Controllo euristico rapido, usato prima di invocare mermaid.parse, per
 * decidere se vale la pena tentare il rendering o mostrare subito il
 * fallback testuale (diagramma vuoto o palesemente non-Mermaid).
 */
export function looksLikeMermaidDiagram(raw: string): boolean {
  const cleaned = stripMermaidCodeFence(raw);
  if (!cleaned) return false;
  const firstLine = cleaned.split("\n")[0]?.trim().toLowerCase() ?? "";
  return KNOWN_DIAGRAM_KEYWORDS.some((keyword) => firstLine.startsWith(keyword.toLowerCase()));
}

/**
 * Quando `mermaid.render(id, text)` incontra un errore di parsing, lancia
 * un'eccezione PRIMA di rimuovere il contenitore temporaneo (`div#d<id>`,
 * eventuale `iframe#i<id>`) che crea in `document.body` per disegnare il suo
 * stesso diagramma d'errore ("Syntax error in text..."): senza questa pulizia
 * manuale, quel diagramma resterebbe visibile in pagina sotto il nostro
 * fallback. Va chiamata nel catch, con lo stesso `renderId` passato a render().
 */
export function removeLeakedMermaidNodes(renderId: string, doc: Document = document): void {
  doc.getElementById(`d${renderId}`)?.remove();
  doc.getElementById(`i${renderId}`)?.remove();
}
