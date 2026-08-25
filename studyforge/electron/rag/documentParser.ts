import fs from "node:fs/promises";
import path from "node:path";

export type ExtractionResult =
  | { status: "done"; text: string }
  | { status: "unsupported"; text: null }
  | { status: "failed"; text: null };

function normalizeWhitespace(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Estrae testo da un file importato. Supporta in modo solido txt/md/pdf.
 * DOCX è best-effort tramite `mammoth`: se l'estrazione fallisce, il materiale
 * viene marcato "unsupported" senza interrompere il flusso di import.
 */
export async function extractTextFromFile(filePath: string, mimeType: string): Promise<ExtractionResult> {
  const ext = path.extname(filePath).toLowerCase();

  try {
    if (ext === ".txt" || mimeType === "text/plain") {
      const raw = await fs.readFile(filePath, "utf-8");
      return { status: "done", text: normalizeWhitespace(raw) };
    }

    if (ext === ".md" || ext === ".markdown" || mimeType === "text/markdown") {
      const raw = await fs.readFile(filePath, "utf-8");
      return { status: "done", text: normalizeWhitespace(raw) };
    }

    if (ext === ".pdf" || mimeType === "application/pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      const buffer = await fs.readFile(filePath);
      const parsed = await pdfParse(buffer);
      const text = normalizeWhitespace(parsed.text ?? "");
      if (!text) return { status: "unsupported", text: null };
      return { status: "done", text };
    }

    if (
      ext === ".docx" ||
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      try {
        const mammoth = await import("mammoth");
        const buffer = await fs.readFile(filePath);
        const result = await mammoth.extractRawText({ buffer });
        const text = normalizeWhitespace(result.value ?? "");
        if (!text) return { status: "unsupported", text: null };
        return { status: "done", text };
      } catch {
        return { status: "unsupported", text: null };
      }
    }

    return { status: "unsupported", text: null };
  } catch {
    return { status: "failed", text: null };
  }
}
