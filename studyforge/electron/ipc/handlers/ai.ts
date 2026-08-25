import type { Db } from "../../db/client";
import { getSettings } from "../../services/settingsService";
import { createDeepSeekClient, tryCreateDeepSeekClient } from "../../ai/factory";
import { generateLessonStudyPack } from "../../ai/studyPack";
import { generateCourseSummary } from "../../ai/courseSummary";
import { CourseAiOutputsRepo, LessonAiOutputsRepo } from "../../db/repositories";
import { safeHandle, type IpcContext } from "../safeHandle";

export function registerAiHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("ai:generateLessonStudyPack", ctx, async (input) => {
    const settings = getSettings(db);
    const client = await createDeepSeekClient(db);
    return generateLessonStudyPack(db, client, settings.deepseekModel, input.lessonId);
  });

  safeHandle("ai:generateCourseSummary", ctx, async (input) => {
    const client = await createDeepSeekClient(db);
    return generateCourseSummary(db, client, input.courseId);
  });

  safeHandle("ai:getCourseSummary", ctx, (input) => CourseAiOutputsRepo.getLatest(db, input.courseId));
  safeHandle("ai:getLessonAiOutput", ctx, (input) => LessonAiOutputsRepo.getByLesson(db, input.lessonId));

  safeHandle("ai:testConnection", ctx, async () => {
    const client = await tryCreateDeepSeekClient(db);
    if (!client) return { ok: false, message: "Nessuna API key DeepSeek configurata." };
    return client.testConnection();
  });
}
