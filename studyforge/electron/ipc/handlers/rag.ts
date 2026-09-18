import type { Db } from "../../db/client";
import { createEmbeddingProvider, tryCreateAiClient } from "../../ai/factory";
import { RagService } from "../../rag/ragService";
import { safeHandle, type IpcContext } from "../safeHandle";

export function registerRagHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("rag:query", ctx, async (input) => {
    const embeddingProvider = await createEmbeddingProvider(db);
    const aiClient = await tryCreateAiClient(db);
    const rag = new RagService({ db, embeddingProvider, aiClient });
    return rag.query(input.courseId, input.question, input.activeLessonId ?? null);
  });
}
