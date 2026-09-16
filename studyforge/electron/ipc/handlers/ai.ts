import type { Db } from "../../db/client";
import { createLocalAiClient, tryCreateLocalAiClient } from "../../ai/factory";
import { generateLessonStudyPack } from "../../ai/studyPack";
import { generateCourseSummary } from "../../ai/courseSummary";
import { CourseAiOutputsRepo, LessonAiOutputsRepo } from "../../db/repositories";
import { getModelStatus, startModelDownload } from "../../services/localModelService";
import { getSettings } from "../../services/settingsService";
import { safeHandle, type IpcContext } from "../safeHandle";

export function registerAiHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("ai:generateLessonStudyPack", ctx, async (input) => {
    const settings = getSettings(db);
    const client = await createLocalAiClient(db);
    return generateLessonStudyPack(db, client, settings.localModelUri, input.lessonId);
  });

  safeHandle("ai:generateCourseSummary", ctx, async (input) => {
    const client = await createLocalAiClient(db);
    return generateCourseSummary(db, client, input.courseId);
  });

  safeHandle("ai:getCourseSummary", ctx, (input) => CourseAiOutputsRepo.getLatest(db, input.courseId));
  safeHandle("ai:getLessonAiOutput", ctx, (input) => LessonAiOutputsRepo.getByLesson(db, input.lessonId));

  safeHandle("ai:testConnection", ctx, async () => {
    const client = await tryCreateLocalAiClient(db);
    if (!client) {
      return {
        ok: false,
        message: "Modello AI locale non ancora scaricato. Vai in Impostazioni per scaricarlo.",
      };
    }
    return client.testConnection();
  });

  safeHandle("ai:getModelStatus", ctx, () => getModelStatus(db));
  safeHandle("ai:downloadModel", ctx, () => {
    startModelDownload(db);
    return { ok: true };
  });
}
