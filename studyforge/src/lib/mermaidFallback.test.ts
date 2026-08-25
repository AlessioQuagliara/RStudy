import { describe, expect, it } from "vitest";
import { looksLikeMermaidDiagram, removeLeakedMermaidNodes, stripMermaidCodeFence } from "./mermaidFallback";

describe("stripMermaidCodeFence", () => {
  it("rimuove i blocchi ```mermaid ... ```", () => {
    const raw = "```mermaid\nflowchart TD\nA-->B\n```";
    expect(stripMermaidCodeFence(raw)).toBe("flowchart TD\nA-->B");
  });

  it("lascia invariato codice senza fence", () => {
    expect(stripMermaidCodeFence("flowchart TD\nA-->B")).toBe("flowchart TD\nA-->B");
  });
});

describe("looksLikeMermaidDiagram", () => {
  it("riconosce flowchart e mindmap validi", () => {
    expect(looksLikeMermaidDiagram("flowchart TD\nA-->B")).toBe(true);
    expect(looksLikeMermaidDiagram("mindmap\n  root((Corso))")).toBe(true);
  });

  it("rifiuta testo vuoto o non-mermaid", () => {
    expect(looksLikeMermaidDiagram("")).toBe(false);
    expect(looksLikeMermaidDiagram("Questo non è un diagramma, solo testo libero.")).toBe(false);
  });
});

describe("removeLeakedMermaidNodes", () => {
  it("rimuove il div e l'iframe temporanei che mermaid.render lascia in document.body su errore di parsing", () => {
    const renderId = "mermaid-test-123";
    const div = document.createElement("div");
    div.id = `d${renderId}`;
    const iframe = document.createElement("div");
    iframe.id = `i${renderId}`;
    document.body.append(div, iframe);

    expect(document.getElementById(`d${renderId}`)).not.toBeNull();
    removeLeakedMermaidNodes(renderId);
    expect(document.getElementById(`d${renderId}`)).toBeNull();
    expect(document.getElementById(`i${renderId}`)).toBeNull();
  });

  it("non lancia se non c'è nulla da rimuovere", () => {
    expect(() => removeLeakedMermaidNodes("id-inesistente")).not.toThrow();
  });
});
