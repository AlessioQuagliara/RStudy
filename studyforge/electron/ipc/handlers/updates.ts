import type { Db } from "../../db/client";
import { getUpdateStatus, checkForUpdates, quitAndInstall } from "../../services/updaterService";
import { safeHandle, type IpcContext } from "../safeHandle";

export function registerUpdateHandlers(_db: Db, ctx: IpcContext): void {
  safeHandle("updates:getStatus", ctx, () => getUpdateStatus());
  safeHandle("updates:check", ctx, () => {
    checkForUpdates();
    return { ok: true };
  });
  safeHandle("updates:quitAndInstall", ctx, () => {
    quitAndInstall();
    return { ok: true };
  });
}
