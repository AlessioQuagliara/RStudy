import type { Db } from "../../db/client";
import { CoursesRepo } from "../../db/repositories";
import { safeHandle, type IpcContext } from "../safeHandle";

export function registerCourseHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("courses:list", ctx, () => CoursesRepo.list(db));
  safeHandle("courses:get", ctx, (input) => CoursesRepo.get(db, input.id));
  safeHandle("courses:create", ctx, (input) => CoursesRepo.create(db, input));
  safeHandle("courses:update", ctx, (input) => CoursesRepo.update(db, input));
  safeHandle("courses:delete", ctx, (input) => {
    CoursesRepo.delete(db, input.id);
    return { ok: true };
  });
}
