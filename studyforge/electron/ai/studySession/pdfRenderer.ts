import { BrowserWindow } from "electron";
import { marked } from "marked";
import fs from "node:fs";
import path from "node:path";
import type { Course } from "../../shared/schemas";
import type { StudySessionPipelineResult } from "./pipeline";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PRINT_CSS = `
  @page { size: A4; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; line-height: 1.5; font-size: 11.5pt; }
  h1, h2, h3, h4 { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #10233f; }
  .title-page { text-align: center; padding-top: 30vh; page-break-after: always; }
  .title-page h1 { font-size: 30pt; margin-bottom: 0.5em; }
  .title-page p { font-size: 13pt; color: #444; }
  .toc { page-break-after: always; }
  .toc ol { padding-left: 1.2em; }
  .toc a { color: inherit; text-decoration: none; }
  .chapter { page-break-before: always; }
  .chapter h1 { font-size: 20pt; border-bottom: 2px solid #10233f; padding-bottom: 0.2em; }
  .chapter h2 { font-size: 14pt; margin-top: 1.4em; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 10pt; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #eef2f7; }
  pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 9.5pt; white-space: pre-wrap; word-break: break-word; }
  code { font-family: "SFMono-Regular", Consolas, monospace; }
  blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding-left: 1em; color: #555; }
  .glossary, .exam-prep { page-break-before: always; }
  .glossary dt { font-weight: bold; margin-top: 0.6em; }
  .glossary dd { margin-left: 0; color: #333; }
`;

function buildHtmlDocument(course: Course, result: StudySessionPipelineResult): string {
  const toc = result.chapters
    .map((c, i) => `<li><a href="#chapter-${i + 1}">${i + 1}. ${escapeHtml(c.title)}</a></li>`)
    .join("\n");

  const chaptersHtml = result.chapters
    .map((c, i) => `<section class="chapter" id="chapter-${i + 1}">${marked.parse(c.markdown, { async: false })}</section>`)
    .join("\n");

  const glossaryHtml =
    result.glossary.length > 0
      ? `<section class="glossary"><h2>Glossario</h2><dl>${result.glossary
          .map((g) => `<dt>${escapeHtml(g.term)}</dt><dd>${escapeHtml(g.definition)}</dd>`)
          .join("")}</dl></section>`
      : "";

  const examPrepHtml =
    result.examPrepTips.length > 0
      ? `<section class="exam-prep"><h2>Piano di ripasso</h2><ul>${result.examPrepTips
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join("")}</ul></section>`
      : "";

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(result.bookTitle)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
  <section class="title-page">
    <h1>${escapeHtml(result.bookTitle)}</h1>
    <p>Sessione di studio — ${escapeHtml(course.title)}</p>
  </section>
  <nav class="toc"><h2>Indice</h2><ol>${toc}</ol></nav>
  ${chaptersHtml}
  ${glossaryHtml}
  ${examPrepHtml}
</body>
</html>`;
}

/**
 * Renderizza il documento finale in PDF via `webContents.printToPDF()` su
 * una BrowserWindow nascosta (nessuna nuova dipendenza pesante: sfrutta
 * Chromium già incluso in Electron). L'HTML intermedio viene scritto su un
 * file temporaneo e caricato con `loadFile` invece di una data: URL, per non
 * dipendere da limiti pratici di lunghezza URL su un libro che può diventare
 * grande. Il PDF viene scritto su un path temporaneo e rinominato in modo
 * atomico solo a generazione riuscita: un fallimento qui non deve mai
 * lasciare un file parziale/corrotto al posto di un PDF precedente valido
 * (electron/services/studySessionService.ts si occupa di NON toccare il
 * pdfPath precedente finché questa funzione non ritorna con successo).
 */
export async function renderStudySessionPdf(
  course: Course,
  result: StudySessionPipelineResult,
  outputPath: string,
): Promise<number> {
  const html = buildHtmlDocument(course, result);
  const tmpHtmlPath = `${outputPath}.render.html`;
  const tmpPdfPath = `${outputPath}.tmp`;
  fs.writeFileSync(tmpHtmlPath, html, "utf8");

  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });

  try {
    await win.loadFile(tmpHtmlPath);
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#999;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      // Margini di default di Electron (~1cm): non li sovrascrivo per
      // lasciare spazio prevedibile a header/footer, la spaziatura fine del
      // contenuto resta gestita dal CSS (padding su body/sezioni).
    });
    fs.writeFileSync(tmpPdfPath, pdfBuffer);
    fs.renameSync(tmpPdfPath, outputPath);
    return pdfBuffer.length;
  } finally {
    win.destroy();
    fs.rm(tmpHtmlPath, { force: true }, () => {});
    fs.rm(tmpPdfPath, { force: true }, () => {});
  }
}

export function sanitizeStudySessionFileName(courseTitle: string): string {
  const slug = courseTitle
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `sessione-studio-${slug || "corso"}-${Date.now()}.pdf`;
}

export function studySessionOutputPath(fileName: string, dir: string): string {
  return path.join(dir, fileName);
}
