import type { IpcMainInvokeEvent, Session } from "electron";

/**
 * Origini fidate da cui possono provenire richieste IPC: la finestra
 * applicativa in dev (server Vite) o in produzione (file:// del bundle).
 */
export function buildAllowedOrigins(isDev: boolean): string[] {
  return isDev ? ["http://localhost:5173/"] : ["file://"];
}

/**
 * Verifica che l'evento IPC provenga dal frame principale della finestra
 * applicativa e non da un frame estraneo (es. una webview o popup non attesi).
 * Ogni handler IPC deve chiamare questa funzione prima di eseguire logica.
 */
export function assertTrustedSender(event: IpcMainInvokeEvent, allowedOrigins: string[]): void {
  const frameUrl = event.senderFrame?.url ?? "";
  const trusted = allowedOrigins.some((origin) => frameUrl.startsWith(origin));
  if (!trusted) {
    throw new Error(`IPC rifiutato: mittente non fidato (${frameUrl || "sconosciuto"})`);
  }
}

/**
 * Autorizza SOLO la richiesta di permesso "media" (microfono, usato dal
 * dettato in electron/features/lessons: MediaRecorder + getUserMedia nel
 * renderer, vedi src/features/lessons/shared/DictationButton.tsx), negando
 * esplicitamente ogni altro permesso che Chromium potrebbe richiedere
 * (notifiche, geolocalizzazione, fotocamera...). Senza questo handler,
 * Electron nega di default qualunque richiesta di permesso: il dettato
 * fallirebbe silenziosamente con un errore "NotAllowedError" nel renderer.
 * Su macOS serve anche `NSMicrophoneUsageDescription` in Info.plist
 * (electron-builder.yml → mac.extendInfo) perché il sistema operativo mostri
 * il proprio dialogo di consenso: senza, macOS nega a monte di Electron.
 */
export function applyPermissionPolicy(session: Session): void {
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
}

/**
 * Applica una Content-Security-Policy alle risposte servite alla finestra
 * applicativa. In produzione (bundle caricato da file://) è rigida: solo
 * risorse locali, niente eval/inline script. In sviluppo il renderer viene
 * servito dal dev server Vite, che si appoggia a `eval`/sourcemap inline e a
 * una connessione WebSocket per l'HMR: una CSP production-grade qui
 * bloccherebbe l'esecuzione dei moduli e la pagina resterebbe vuota/grigia,
 * quindi in dev non viene applicata alcuna restrizione aggiuntiva.
 */
export function applyContentSecurityPolicy(session: Session, isDev: boolean): void {
  if (isDev) return;

  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';",
        ],
      },
    });
  });
}
