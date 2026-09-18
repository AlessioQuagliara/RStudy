import { dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../../db/client";
import { MaterialsRepo } from "../../db/repositories";
import { getMaterialsDir } from "../../services/paths";
import { extractTextFromFile } from "../../rag/documentParser";
import { chunkText } from "../../rag/chunker";
import { RagService, resolveMaterialSourceLabel } from "../../rag/ragService";
import { createEmbeddingProvider, tryCreateAiClient } from "../../ai/factory";
import { safeHandle, type IpcContext } from "../safeHandle";

const MIME_BY_EXT: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function registerMaterialHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("materials:listByCourse", ctx, (input) => MaterialsRepo.listByCourse(db, input.courseId));

  safeHandle("materials:delete", ctx, (input) => {
    const material = MaterialsRepo.get(db, input.id);
    if (material) {
      try {
        fs.rmSync(material.filePath, { force: true });
      } catch {
        // Il file potrebbe già essere stato rimosso manualmente: non bloccare l'eliminazione del record.
      }
    }
    MaterialsRepo.delete(db, input.id);
    return { ok: true };
  });

  safeHandle("materials:pickFiles", ctx, async () => {
    const result = await dialog.showOpenDialog({
      title: "Seleziona materiali da importare",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Documenti supportati", extensions: ["txt", "md", "markdown", "pdf", "docx"] },
        { name: "Tutti i file", extensions: ["*"] },
      ],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  safeHandle("materials:import", ctx, async (input) => {
    const materialsDir = getMaterialsDir();
    const embeddingProvider = await createEmbeddingProvider(db);
    const aiClient = await tryCreateAiClient(db);
    const rag = new RagService({ db, embeddingProvider, aiClient });

    const created = [];
    for (const sourcePath of input.filePaths) {
      const originalFilename = path.basename(sourcePath);
      const ext = path.extname(sourcePath).toLowerCase();
      const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
      const destName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      const destPath = path.join(materialsDir, destName);

      fs.copyFileSync(sourcePath, destPath);
      const stat = fs.statSync(destPath);

      const material = MaterialsRepo.create(db, {
        courseId: input.courseId,
        lessonId: input.lessonId ?? null,
        title: originalFilename.replace(/\.[^.]+$/, ""),
        originalFilename,
        mimeType,
        filePath: destPath,
        fileSize: stat.size,
        materialType: input.materialType,
      });

      const extraction = await extractTextFromFile(destPath, mimeType);
      MaterialsRepo.setExtraction(db, material.id, extraction.text, extraction.status);

      if (extraction.status === "done" && extraction.text) {
        const chunks = chunkText(extraction.text).map((c) => c.content);
        const label = resolveMaterialSourceLabel(material.title, input.lessonId ?? null, db);
        await rag.indexMaterial(input.courseId, input.lessonId ?? null, material.id, label, chunks);
      }

      created.push(MaterialsRepo.get(db, material.id));
    }
    return created;
  });
}
