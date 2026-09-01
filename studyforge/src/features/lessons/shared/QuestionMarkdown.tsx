import ReactMarkdown, { type Components } from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
// Importato qui (unico punto d'uso nel repo di Markdown/LaTeX): il modulo
// CSS viene caricato una sola volta dal bundler indipendentemente da quante
// volte QuestionMarkdown viene renderizzato o importato altrove (esercizi,
// presentazione).
import "katex/dist/katex.min.css";

/**
 * Il progetto non ha il plugin @tailwindcss/typography (niente classe
 * `prose`): styling minimo esplicito sugli elementi Markdown più comuni
 * invece di aggiungere una dipendenza in più non richiesta dal task.
 */
const markdownComponents: Components = {
  p: (props) => <p className="mb-2 leading-relaxed last:mb-0" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  em: (props) => <em className="italic" {...props} />,
  ul: (props) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: (props) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  code: (props) => <code className="bg-base-200 rounded px-1 py-0.5 text-[0.85em]" {...props} />,
};

/**
 * Renderizza testo Markdown con supporto matematica LaTeX (`$...$`/`$$...$$`,
 * via remark-math + rehype-katex). react-markdown produce alberi React, mai
 * `dangerouslySetInnerHTML`: nessun HTML grezzo (generato dall'AI o da un
 * utente) viene mai iniettato direttamente nel DOM. Condiviso tra
 * DuolingoQuiz (domande) e PresentationPlayer (titoli/bullet/note).
 */
export function QuestionMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
      {children}
    </ReactMarkdown>
  );
}
