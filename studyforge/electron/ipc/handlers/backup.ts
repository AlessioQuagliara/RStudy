import { dialog } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../../db/client";
import { buildBackup, restoreBackup } from "../../services/backupService";
import { getBackupsDir } from "../../services/paths";
import { backupDataSchema } from "../../shared/schemas";
import { safeHandle, type IpcContext } from "../safeHandle";

export function registerBackupHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("backup:export", ctx, async () => {
    const backup = buildBackup(db);
    const defaultPath = path.join(getBackupsDir(), `rstudy-backup-${Date.now()}.json`);
    const result = await dialog.showSaveDialog({
      title: "Esporta backup RStudy",
      defaultPath,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, filePath: null };
    fs.writeFileSync(result.filePath, JSON.stringify(backup, null, 2), "utf-8");
    return { ok: true, filePath: result.filePath };
  });

  safeHandle("backup:pickImportFile", ctx, async () => {
    const result = await dialog.showOpenDialog({
      title: "Importa backup RStudy",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0]!;
  });

  safeHandle("backup:import", ctx, (input) => {
    const raw = fs.readFileSync(input.filePath, "utf-8");
    const parsed = backupDataSchema.parse(JSON.parse(raw));
    restoreBackup(db, parsed);
    return { ok: true };
  });
}
