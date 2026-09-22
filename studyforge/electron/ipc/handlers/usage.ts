import type { Db } from "../../db/client";
import { getTodayUsage } from "../../services/cloudUsageService";
import { safeHandle, type IpcContext } from "../safeHandle";

export function registerUsageHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("usage:getCloudAiToday", ctx, () => getTodayUsage(db));
}
