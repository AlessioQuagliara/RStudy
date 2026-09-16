import type { RStudyApi } from "@/types/ipc";

/**
 * Unico punto da cui le feature del renderer accedono al main process.
 * Non importare mai `window.rstudy` direttamente altrove: passare da qui
 * mantiene un solo posto da aggiornare se il contratto IPC cambia.
 */
export function getIpc(): RStudyApi {
  if (!window.rstudy) {
    throw new Error("API RStudy non disponibile: l'app non è in esecuzione dentro Electron con preload attivo.");
  }
  return window.rstudy;
}
