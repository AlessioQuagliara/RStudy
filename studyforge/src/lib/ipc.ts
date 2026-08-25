import type { StudyForgeApi } from "@/types/ipc";

/**
 * Unico punto da cui le feature del renderer accedono al main process.
 * Non importare mai `window.studyforge` direttamente altrove: passare da qui
 * mantiene un solo posto da aggiornare se il contratto IPC cambia.
 */
export function getIpc(): StudyForgeApi {
  if (!window.studyforge) {
    throw new Error("API StudyForge non disponibile: l'app non è in esecuzione dentro Electron con preload attivo.");
  }
  return window.studyforge;
}
