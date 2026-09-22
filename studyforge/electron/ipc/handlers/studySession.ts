import { dialog } from "electron";
import type { Db } from "../../db/client";
import {
  generateStudySession,
  getStudySessionStatus,
  downloadStudySessionPdf,
} from "../../services/studySessionService";
import { safeHandle, type IpcContext } from "../safeHandle";

export function registerStudySessionHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("studySession:generate", ctx, (input) => generateStudySession(db, input.courseId));

  safeHandle("studySession:getStatus", ctx, (input) => getStudySessionStatus(db, input.courseId));

  safeHandle("studySession:download", ctx, (input) =>
    downloadStudySessionPdf(db, input.courseId, async (defaultPath) => {
      const result = await dialog.showSaveDialog({
        title: "Salva sessione studio",
        defaultPath,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      return result.canceled || !result.filePath ? null : result.filePath;
    }),
  );
}
