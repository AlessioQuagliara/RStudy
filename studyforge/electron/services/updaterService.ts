import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateStatus } from "../shared/schemas";

type UpdaterState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "downloading"; version: string; progressPercent: number }
  | { kind: "downloaded"; version: string }
  | { kind: "not_available" }
  | { kind: "error"; message: string };

let state: UpdaterState = { kind: "idle" };
let listenersWired = false;

/**
 * Scarica automaticamente un aggiornamento trovato (non disturba l'utente:
 * il file scaricato resta in attesa, l'app corrente continua a funzionare
 * invariata), ma non lo installa mai da solo alla chiusura
 * (autoInstallOnAppQuit=false): l'installazione (che richiede un riavvio)
 * parte solo su azione esplicita dell'utente tramite `quitAndInstall()`,
 * stesso principio delle altre azioni "hard to reverse" dell'app.
 */
function wireListeners(): void {
  if (listenersWired) return;
  listenersWired = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    state = { kind: "checking" };
  });
  autoUpdater.on("update-available", (info) => {
    state = { kind: "downloading", version: info.version, progressPercent: 0 };
  });
  autoUpdater.on("update-not-available", () => {
    state = { kind: "not_available" };
  });
  autoUpdater.on("download-progress", (progress) => {
    if (state.kind === "downloading") {
      state = { ...state, progressPercent: Math.round(progress.percent) };
    }
  });
  autoUpdater.on("update-downloaded", (info) => {
    state = { kind: "downloaded", version: info.version };
  });
  autoUpdater.on("error", (error) => {
    console.warn("[UpdaterService] Controllo/download aggiornamento fallito:", error.message);
    state = { kind: "error", message: error.message };
  });
}

export function initUpdater(): void {
  wireListeners();
}

export function getUpdateStatus(): UpdateStatus {
  return {
    state: state.kind,
    currentVersion: app.getVersion(),
    latestVersion: "version" in state ? state.version : null,
    progressPercent: state.kind === "downloading" ? state.progressPercent : null,
    error: state.kind === "error" ? state.message : null,
  };
}

/**
 * In sviluppo (app non pacchettizzata) electron-updater non ha nulla da
 * controllare (nessun artefatto pubblicato per una build locale): niente
 * chiamata di rete, solo uno stato "error" esplicativo invece del generico
 * errore interno di electron-updater che comparirebbe altrimenti.
 */
export function checkForUpdates(): void {
  if (!app.isPackaged) {
    state = {
      kind: "error",
      message: "Il controllo aggiornamenti è disponibile solo nella versione installata dell'app.",
    };
    return;
  }
  wireListeners();
  state = { kind: "checking" };
  void autoUpdater.checkForUpdates().catch((error) => {
    state = {
      kind: "error",
      message: error instanceof Error ? error.message : "Controllo aggiornamenti fallito.",
    };
  });
}

/**
 * Riavvia l'app e installa l'aggiornamento già scaricato. Da chiamare solo
 * quando lo stato è "downloaded". Su macOS l'installazione self-update di
 * Squirrel.Mac richiede che l'app sia firmata E lanciata da una posizione
 * scrivibile stabile (tipicamente /Applications, non da un .dmg montato o
 * da `release/mac-arm64/` in locale): se una di queste condizioni manca,
 * l'errore arriva qui in modo sincrono o tramite l'evento "error" di
 * autoUpdater (già gestito in wireListeners) — in entrambi i casi lo stato
 * torna "error" invece di restare silenzioso, così il pulsante "Riavvia e
 * installa" in Impostazioni può mostrare il motivo reale invece di sembrare
 * che non abbia fatto nulla.
 */
export function quitAndInstall(): void {
  try {
    autoUpdater.quitAndInstall();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Installazione aggiornamento fallita.";
    console.warn("[UpdaterService] quitAndInstall fallito:", message);
    state = { kind: "error", message };
    throw error instanceof Error ? error : new Error(message);
  }
}
