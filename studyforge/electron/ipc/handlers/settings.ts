import { dialog } from "electron";
import type { Db } from "../../db/client";
import { getSettings, updateSettings } from "../../services/settingsService";
import { safeHandle, type IpcContext } from "../safeHandle";

export function registerSettingsHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("settings:get", ctx, () => getSettings(db));
  safeHandle("settings:update", ctx, (input) => updateSettings(db, input));

  safeHandle("settings:pickImportFolder", ctx, async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folder = result.filePaths[0]!;
    updateSettings(db, { importFolder: folder });
    return folder;
  });
}
