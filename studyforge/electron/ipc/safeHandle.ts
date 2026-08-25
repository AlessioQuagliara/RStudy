import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { assertTrustedSender } from "../main/security";
import { ipcInputSchemas, type IpcChannel, type IpcInput } from "../shared/ipcContract";

export interface IpcContext {
  getAllowedOrigins: () => string[];
}

/**
 * Registra un handler IPC che valida sempre, in quest'ordine:
 * 1) il sender (deve essere il frame della finestra applicativa),
 * 2) il payload (contro lo schema Zod del canale in ipcContract.ts).
 * Nessun handler dell'app deve usare ipcMain.handle direttamente: questo è
 * l'unico punto di ingresso.
 */
export function safeHandle<C extends IpcChannel>(
  channel: C,
  ctx: IpcContext,
  handler: (input: IpcInput<C>, event: IpcMainInvokeEvent) => Promise<unknown> | unknown,
): void {
  ipcMain.handle(channel, async (event, payload) => {
    assertTrustedSender(event, ctx.getAllowedOrigins());
    const schema = ipcInputSchemas[channel];
    const parsed = schema.parse(payload) as IpcInput<C>;
    return handler(parsed, event);
  });
}
