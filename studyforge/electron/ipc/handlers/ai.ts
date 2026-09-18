import type { Db } from "../../db/client";
import { createAiClient, tryCreateAiClient } from "../../ai/factory";
import { generateLessonStudyPack } from "../../ai/studyPack";
import { generateCourseSummary } from "../../ai/courseSummary";
import { CourseAiOutputsRepo, LessonAiOutputsRepo } from "../../db/repositories";
import { getModelStatus, startModelDownload } from "../../services/localModelService";
import { getSettings } from "../../services/settingsService";
import { safeHandle, type IpcContext } from "../safeHandle";

/** Nome del modello effettivamente in uso secondo il provider selezionato, per la colonna `model` persistita insieme all'output AI. */
function activeModelLabel(settings: ReturnType<typeof getSettings>): string {
  return settings.aiProvider === "cloud" ? (settings.cloudModel ?? "cloud") : settings.localModelUri;
}

export function registerAiHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("ai:generateLessonStudyPack", ctx, async (input) => {
    const settings = getSettings(db);
    const client = await createAiClient(db);
    return generateLessonStudyPack(db, client, activeModelLabel(settings), input.lessonId);
  });

  safeHandle("ai:generateCourseSummary", ctx, async (input) => {
    const client = await createAiClient(db);
    return generateCourseSummary(db, client, input.courseId);
  });

  safeHandle("ai:getCourseSummary", ctx, (input) => CourseAiOutputsRepo.getLatest(db, input.courseId));
  safeHandle("ai:getLessonAiOutput", ctx, (input) => LessonAiOutputsRepo.getByLesson(db, input.lessonId));

  safeHandle("ai:testConnection", ctx, async () => {
    const client = await tryCreateAiClient(db);
    if (!client) {
      const settings = getSettings(db);
      return {
        ok: false,
        message:
          settings.aiProvider === "cloud"
            ? "Provider AI cloud non configurato. Vai in Impostazioni per inserire chiave API, endpoint e modello."
            : "Modello AI locale non ancora scaricato. Vai in Impostazioni per scaricarlo.",
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
