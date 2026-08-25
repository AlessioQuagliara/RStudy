import type { Db } from "../../db/client";
import { FlashcardsRepo } from "../../db/repositories";
import { safeHandle, type IpcContext } from "../safeHandle";

export function registerFlashcardHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("flashcards:listByCourse", ctx, (input) => FlashcardsRepo.listByCourse(db, input.courseId));
  safeHandle("flashcards:dueToday", ctx, () => FlashcardsRepo.dueToday(db));
  safeHandle("flashcards:create", ctx, (input) => FlashcardsRepo.create(db, input));
  safeHandle("flashcards:update", ctx, (input) => FlashcardsRepo.update(db, input));
  safeHandle("flashcards:duplicate", ctx, (input) => FlashcardsRepo.duplicate(db, input.id));
  safeHandle("flashcards:delete", ctx, (input) => {
    FlashcardsRepo.delete(db, input.id);
    return { ok: true };
  });
  safeHandle("flashcards:review", ctx, (input) => FlashcardsRepo.review(db, input.id, input.grade));
}
