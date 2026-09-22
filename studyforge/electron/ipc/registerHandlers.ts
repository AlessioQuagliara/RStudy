import { app } from "electron";
import { getDb } from "../db/client";
import { registerCourseHandlers } from "./handlers/courses";
import { registerLessonHandlers } from "./handlers/lessons";
import { registerMaterialHandlers } from "./handlers/materials";
import { registerFlashcardHandlers } from "./handlers/flashcards";
import { registerAiHandlers } from "./handlers/ai";
import { registerStudyAiHandlers } from "./handlers/studyAi";
import { registerRagHandlers } from "./handlers/rag";
import { registerSettingsHandlers } from "./handlers/settings";
import { registerBackupHandlers } from "./handlers/backup";
import { registerLicenseHandlers } from "./handlers/license";
import { registerUpdateHandlers } from "./handlers/updates";
import { registerUsageHandlers } from "./handlers/usage";
import { registerStudySessionHandlers } from "./handlers/studySession";
import { safeHandle, type IpcContext } from "./safeHandle";

export function registerIpcHandlers(ctx: IpcContext): void {
  const db = getDb();

  registerCourseHandlers(db, ctx);
  registerLessonHandlers(db, ctx);
  registerMaterialHandlers(db, ctx);
  registerFlashcardHandlers(db, ctx);
  registerAiHandlers(db, ctx);
  registerStudyAiHandlers(db, ctx);
  registerRagHandlers(db, ctx);
  registerSettingsHandlers(db, ctx);
  registerBackupHandlers(db, ctx);
  registerLicenseHandlers(db, ctx);
  registerUpdateHandlers(db, ctx);
  registerUsageHandlers(db, ctx);
  registerStudySessionHandlers(db, ctx);

  safeHandle("app:getVersion", ctx, () => app.getVersion());
}
