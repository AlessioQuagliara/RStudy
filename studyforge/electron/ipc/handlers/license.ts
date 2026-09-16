import type { Db } from "../../db/client";
import { getLicenseStatus, activateLicense } from "../../services/licenseService";
import { safeHandle, type IpcContext } from "../safeHandle";

export function registerLicenseHandlers(db: Db, ctx: IpcContext): void {
  safeHandle("license:getStatus", ctx, () => getLicenseStatus(db));
  safeHandle("license:activate", ctx, (input) => activateLicense(db, input.licenseKey));
}
