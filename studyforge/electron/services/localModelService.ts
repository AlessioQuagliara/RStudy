import path from "node:path";
import fs from "node:fs";
import type { Db } from "../db/client";
import { getSettings, updateSettings } from "./settingsService";
import { getUserDataDir } from "./paths";
import type { ModelStatus } from "../shared/schemas";

/**
 * Stato del download in corso (se presente), tenuto in memoria a livello di
 * modulo: il main process è singolo (single-instance lock in
 * electron/main/index.ts), quindi non serve persistenza né coordinamento
 * multi-processo. Il completamento persiste `localModelPath` nei settings
 * (SQLite) così l'app sa che il modello è pronto anche dopo un riavvio.
 */
type DownloadState =
  | { kind: "idle" }
  | { kind: "downloading"; progress: number }
  | { kind: "error"; message: string };

let downloadState: DownloadState = { kind: "idle" };

export function getModelsDir(): string {
  const dir = path.join(getUserDataDir(), "models");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Non ci fidiamo ciecamente di `settings.localModelPath`: se il file è stato
 * cancellato manualmente dall'utente (o da una pulizia disco), lo stato deve
 * tornare "not_downloaded" invece di "ready" con un path morto.
 */
export function getModelStatus(db: Db): ModelStatus {
  const settings = getSettings(db);

  if (downloadState.kind === "downloading") {
    return {
      state: "downloading",
      progress: downloadState.progress,
      error: null,
      modelUri: settings.localModelUri,
    };
  }
  if (downloadState.kind === "error") {
    return {
      state: "error",
      progress: null,
      error: downloadState.message,
      modelUri: settings.localModelUri,
    };
  }

  const ready = settings.localModelPath !== null && fs.existsSync(settings.localModelPath);
  return {
    state: ready ? "ready" : "not_downloaded",
    progress: null,
    error: null,
    modelUri: settings.localModelUri,
  };
}

export function getLocalModelPath(db: Db): string | null {
  const settings = getSettings(db);
  if (settings.localModelPath && fs.existsSync(settings.localModelPath)) {
    return settings.localModelPath;
  }
  return null;
}

/**
 * Avvia il download in background (fire-and-forget): il chiamante IPC
 * (`ai:downloadModel`) ritorna subito, il renderer fa polling dello stato
 * via `ai:getModelStatus`. Non avvia mai due download in parallelo.
 */
export function startModelDownload(db: Db): void {
  const status = getModelStatus(db);
  if (status.state === "downloading" || status.state === "ready") return;

  const settings = getSettings(db);
  downloadState = { kind: "downloading", progress: 0 };

  void runDownload(db, settings.localModelUri);
}

async function runDownload(db: Db, modelUri: string): Promise<void> {
  try {
    const { createModelDownloader } = await import("node-llama-cpp");
    const downloader = await createModelDownloader({
      modelUri,
      dirPath: getModelsDir(),
      onProgress: ({ totalSize, downloadedSize }) => {
        downloadState = {
          kind: "downloading",
          progress: totalSize > 0 ? downloadedSize / totalSize : 0,
        };
      },
    });

    const modelPath = await downloader.download();
    updateSettings(db, { localModelPath: modelPath });
    downloadState = { kind: "idle" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Download del modello fallito.";
    console.warn(`[LocalModelService] Download modello fallito: ${message}`);
    downloadState = { kind: "error", message };
  }
}
