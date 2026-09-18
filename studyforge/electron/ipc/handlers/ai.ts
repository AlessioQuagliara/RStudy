import type { Db } from "../../db/client";
import { createAiClient, tryCreateAiClient } from "../../ai/factory";
import { generateLessonStudyPack } from "../../ai/studyPack";
import { generateCourseSummary } from "../../ai/courseSummary";
import { transcribeAudio } from "../../ai/transcriptionClient";
import { CourseAiOutputsRepo, LessonAiOutputsRepo } from "../../db/repositories";
import { getModelStatus, startModelDownload } from "../../services/localModelService";
import { getSettings } from "../../services/settingsService";
import { safeHandle, type IpcContext } from "../safeHandle";
import type { TranscribeAudioResult } from "../../shared/schemas";

/**
 * Override facoltativo via variabile d'ambiente per la chiave API di
 * trascrizione: stesso ruolo di RSTUDY_CLOUD_API_KEY (electron/ai/factory.ts)
 * per sviluppo/CI senza passare dalla UI Impostazioni.
 */
const ENV_TRANSCRIPTION_API_KEY = "RSTUDY_TRANSCRIPTION_API_KEY";

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

  safeHandle("ai:transcribeAudio", ctx, async (input): Promise<TranscribeAudioResult> => {
    const settings = getSettings(db);
    const apiKey = process.env[ENV_TRANSCRIPTION_API_KEY]?.trim() || settings.transcriptionApiKey;
    if (!apiKey || !settings.transcriptionBaseUrl || !settings.transcriptionModel) {
      return {
        status: "error",
        code: "not_configured",
        message: "Trascrizione non configurata. Vai in Impostazioni per inserire una chiave API.",
      };
    }
    return transcribeAudio(
      { apiKey, baseUrl: settings.transcriptionBaseUrl, model: settings.transcriptionModel },
      { buffer: Buffer.from(input.audioBase64, "base64"), mimeType: input.mimeType },
    );
  });
}
