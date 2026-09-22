import type { Db } from "../../db/client";
import {
  createAiClient,
  tryCreateAiClient,
  getCloudProviderInfo,
  getTranscriptionCredentialsFromEnv,
} from "../../ai/factory";
import { generateLessonStudyPack } from "../../ai/studyPack";
import { generateCourseSummary } from "../../ai/courseSummary";
import { transcribeAudio } from "../../ai/transcriptionClient";
import { CourseAiOutputsRepo, LessonAiOutputsRepo } from "../../db/repositories";
import { getModelStatus, startModelDownload } from "../../services/localModelService";
import { getSettings } from "../../services/settingsService";
import { reserveCloudAiCall, CloudAiDailyLimitReachedError } from "../../services/cloudUsageService";
import { safeHandle, type IpcContext } from "../safeHandle";
import type { TranscribeAudioResult } from "../../shared/schemas";

/** Nome del modello effettivamente in uso secondo il provider selezionato, per la colonna `model` persistita insieme all'output AI. */
function activeModelLabel(settings: ReturnType<typeof getSettings>): string {
  if (settings.aiProvider !== "cloud") return settings.localModelUri;
  return getCloudProviderInfo().chat.model ?? "cloud";
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
            ? "Il servizio AI cloud non è temporaneamente disponibile. Puoi usare il modello locale."
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
    let credentials: { apiKey: string; baseUrl: string; model: string };
    try {
      credentials = getTranscriptionCredentialsFromEnv();
    } catch {
      return {
        status: "error",
        code: "not_configured",
        message: "Trascrizione non disponibile in questa build.",
      };
    }

    try {
      reserveCloudAiCall(db, "dictation");
    } catch (error) {
      if (error instanceof CloudAiDailyLimitReachedError) {
        return { status: "error", code: "daily_limit_reached", message: error.message };
      }
      throw error;
    }

    return transcribeAudio(credentials, {
      buffer: Buffer.from(input.audioBase64, "base64"),
      mimeType: input.mimeType,
    });
  });

  safeHandle("ai:getCloudProviderInfo", ctx, () => getCloudProviderInfo());
}
