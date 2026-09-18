import * as monaco from "monaco-editor";
import { typescript } from "monaco-editor";
import Editor, { loader } from "@monaco-editor/react";
import type { SupportedCodeLanguage } from "@shared/schemas";

// Carica Monaco dal pacchetto locale bundlato da Vite, MAI da CDN: senza
// questa chiamata @monaco-editor/loader punterebbe di default a
// https://cdn.jsdelivr.net/npm/monaco-editor@.../min/vs/loader.js, il che
// violerebbe sia la CSP di produzione (script-src 'self', electron/main/
// security.ts) sia il requisito "l'app deve funzionare offline" già seguito
// per mermaid/katex. `loader.config({ monaco })` fa sì che il loader usi
// direttamente l'istanza importata qui sopra e non tenti mai la rete.
loader.config({ monaco });

// Il servizio linguistico "ricco" per TS/JS (diagnostica semantica, il suo
// web worker dedicato) è importato di default dal pacchetto monaco-editor
// (esm/vs/editor/editor.main.js -> languages/features/typescript/register.js,
// esposto come export nominato `typescript`, non più sotto
// `monaco.languages.typescript` come nelle versioni precedenti). Qui serve
// solo editing/visualizzazione con syntax highlighting per un breve snippet,
// non un vero ambiente di sviluppo: disattivare la diagnostica evita di
// dipendere dal worker (e dai relativi rischi di CSP worker-src/blob: su
// file://) restando comunque pienamente funzionante — la tokenizzazione per
// l'evidenziazione sintattica non passa mai da un worker per nessuna delle
// lingue usate qui (vedi MONACO_LANGUAGE_BY_EXERCISE_LANGUAGE sotto).
typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});
typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});

const MONACO_LANGUAGE_BY_EXERCISE_LANGUAGE: Record<SupportedCodeLanguage, string> = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  c: "c",
  cpp: "cpp",
  java: "java",
  csharp: "csharp",
  go: "go",
  rust: "rust",
  sql: "sql",
  bash: "shell",
  html: "html",
  css: "css",
  php: "php",
  ruby: "ruby",
};

/**
 * Editor di codice non eseguibile: mostra/modifica testo con syntax
 * highlighting per il linguaggio dato. Nessuna esecuzione di codice qui
 * dentro (nessun eval/Function/child_process): questo componente si limita
 * a leggere/scrivere una stringa. Usato sia da CodingChallengeQuestion
 * (modificabile, valutato da codingEvaluation.ts) sia da PresentationPlayer
 * (sempre `readOnly`, solo visualizzazione).
 */
export function MonacoCodeEditor({
  value,
  language,
  readOnly,
  onChange,
  height = "240px",
}: {
  value: string;
  language: SupportedCodeLanguage;
  readOnly: boolean;
  onChange: (value: string) => void;
  height?: string;
}) {
  return (
    <Editor
      height={height}
      language={MONACO_LANGUAGE_BY_EXERCISE_LANGUAGE[language]}
      value={value}
      onChange={(next) => onChange(next ?? "")}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: "on",
        ariaLabel: "Editor di codice",
      }}
    />
  );
}
