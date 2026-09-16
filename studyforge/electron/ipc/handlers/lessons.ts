import type { Db } from "../../db/client";
import { LessonsRepo } from "../../db/repositories";
import { createEmbeddingProvider, tryCreateLocalAiClient } from "../../ai/factory";
import { RagService } from "../../rag/ragService";
import { safeHandle, type IpcContext } from "../safeHandle";

export function registerLessonHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("lessons:listByCourse", ctx, (input) => LessonsRepo.listByCourse(db, input.courseId));
  safeHandle("lessons:get", ctx, (input) => LessonsRepo.get(db, input.id));
  safeHandle("lessons:create", ctx, (input) => LessonsRepo.create(db, input));
  safeHandle("lessons:update", ctx, (input) => LessonsRepo.update(db, input));
  safeHandle("lessons:delete", ctx, (input) => {
    LessonsRepo.delete(db, input.id);
    return { ok: true };
  });

  safeHandle("lessons:saveNotes", ctx, async (input) => {
    const lesson = LessonsRepo.saveNotes(db, input);
    if (lesson) {
      const embeddingProvider = await createEmbeddingProvider(db);
      const localAiClient = await tryCreateLocalAiClient(db);
      const rag = new RagService({ db, embeddingProvider, localAiClient });
      // L'indicizzazione RAG degli appunti non deve bloccare/rompere il salvataggio.
      rag.indexLessonNotes(lesson.courseId, lesson.id, input.notesPlainText).catch((error) => {
         
        console.warn("[RAG] Indicizzazione appunti fallita:", error instanceof Error ? error.message : error);
      });
    }
    return lesson;
  });
}
