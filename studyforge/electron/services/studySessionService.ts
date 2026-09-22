import fs from "node:fs";
import path from "node:path";
import type { Db } from "../db/client";
import { StudySessionGenerationsRepo, StudySessionGenerationStepsRepo } from "../db/repositories";
import { collectCourseContent } from "../ai/studySession/contentCollector";
import { runStudySessionPipeline, type StudySessionStep } from "../ai/studySession/pipeline";
import {
  createCallBudget,
  getStudySessionMaxCallsPerJob,
  getStudySessionMinIntervalHours,
} from "../ai/studySession/callBudget";
import { renderStudySessionPdf, sanitizeStudySessionFileName } from "../ai/studySession/pdfRenderer";
import { getStudySessionsDir } from "./paths";
import { createAiClientForStudySession } from "../ai/factory";
import type { GenerateStudySessionResult, StudySessionGeneration } from "../shared/schemas";

const STEP_ORDER: StudySessionStep[] = ["collect", "analyze", "design", "author", "review", "render"];

function toPublicStatus(row: NonNullable<ReturnType<typeof StudySessionGenerationsRepo.get>>): StudySessionGeneration {
  return {
    id: row.id,
    courseId: row.courseId,
    status: row.status,
    currentStep: row.currentStep,
    progressPercentage: row.progressPercentage,
    pdfFileName: row.pdfFileName,
    pdfFileSize: row.pdfFileSize,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

/** Messaggio sempre "safe": mai il messaggio grezzo di un errore imprevisto (potrebbe contenere dettagli del provider). */
function toSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Le nostre classi di errore applicative hanno già un messaggio pensato per l'utente finale.
    const knownSafe = [
      "CloudAiDailyLimitReachedError",
      "StudySessionCallBudgetExceededError",
    ].includes(error.constructor.name);
    if (knownSafe) return error.message;
  }
  console.warn(`[studySessionService] generazione fallita: ${error instanceof Error ? error.message : String(error)}`);
  return "La generazione della sessione studio non è riuscita. Riprova più tardi o verifica le Impostazioni AI.";
}

/**
 * Avvia una nuova generazione, oppure la rifiuta con un motivo esplicito
 * PRIMA di consumare qualunque budget: nessuna lezione elaborabile, un job
 * già attivo per questo corso, o una rigenerazione troppo ravvicinata a
 * quella riuscita più di recente (CLOUD_STUDY_SESSION_MIN_INTERVAL_HOURS).
 * Il job vero e proprio gira in background (fire-and-forget): questa
 * funzione ritorna non appena la riga "queued" è stata creata.
 */
export async function generateStudySession(db: Db, courseId: string): Promise<GenerateStudySessionResult> {
  const content = collectCourseContent(db, courseId);
  if (!content) {
    return {
      status: "rejected",
      code: "no_valid_lessons",
      message: "Nessuna lezione con appunti o riepilogo AI disponibile: completa almeno una lezione prima di generare la sessione studio.",
    };
  }

  if (StudySessionGenerationsRepo.getActiveForCourse(db, courseId)) {
    return {
      status: "rejected",
      code: "already_running",
      message: "Una generazione per questo corso è già in corso: attendi che finisca prima di avviarne un'altra.",
    };
  }

  const latestReady = StudySessionGenerationsRepo.getLatestReadyForCourse(db, courseId);
  if (latestReady) {
    const minIntervalHours = getStudySessionMinIntervalHours();
    const elapsedHours = (Date.now() - new Date(latestReady.createdAt).getTime()) / (1000 * 60 * 60);
    if (elapsedHours < minIntervalHours) {
      const remainingHours = Math.ceil(minIntervalHours - elapsedHours);
      return {
        status: "rejected",
        code: "too_soon",
        message: `Hai già generato una sessione studio per questo corso di recente. Potrai rigenerarla tra circa ${remainingHours} ${remainingHours === 1 ? "ora" : "ore"}.`,
      };
    }
  }

  let row: ReturnType<typeof StudySessionGenerationsRepo.create>;
  try {
    row = StudySessionGenerationsRepo.create(db, {
      courseId,
      sourceContentVersionHash: content.contentHash,
      sourceLessonsCount: content.lessons.length,
    });
  } catch {
    // Race: un'altra richiesta ha creato il job attivo tra il check sopra e
    // questo insert (vincolo unico parziale del DB, electron/db/schema.ts).
    return {
      status: "rejected",
      code: "already_running",
      message: "Una generazione per questo corso è già in corso: attendi che finisca prima di avviarne un'altra.",
    };
  }

  void runGeneration(db, row.id, content);

  return { status: "started", generationId: row.id };
}

async function runGeneration(db: Db, generationId: string, content: NonNullable<ReturnType<typeof collectCourseContent>>): Promise<void> {
  try {
    const client = await createAiClientForStudySession(db);
    const budget = createCallBudget(getStudySessionMaxCallsPerJob());

    const result = await runStudySessionPipeline(client, content, budget, {
      onProgress: (step, percentage) => {
        StudySessionGenerationsRepo.updateProgress(db, generationId, {
          currentStep: step,
          progressPercentage: percentage,
          cloudCallsUsed: budget.used,
        });
      },
      onStepDone: (step, index, outputJson) => {
        StudySessionGenerationStepsRepo.add(db, {
          generationId,
          stepName: step,
          stepIndex: STEP_ORDER.indexOf(step) * 1000 + index,
          status: "done",
          outputJson,
        });
      },
    });

    const fileName = sanitizeStudySessionFileName(content.course.title);
    const outputPath = path.join(getStudySessionsDir(), fileName);
    const fileSize = await renderStudySessionPdf(content.course, result, outputPath);

    StudySessionGenerationsRepo.markReady(db, generationId, { pdfPath: outputPath, pdfFileName: fileName, pdfFileSize: fileSize });
  } catch (error) {
    StudySessionGenerationStepsRepo.add(db, {
      generationId,
      stepName: "render",
      stepIndex: 999999,
      status: "failed",
      errorMessage: error instanceof Error ? error.message.slice(0, 500) : "errore sconosciuto",
    });
    StudySessionGenerationsRepo.markFailed(db, generationId, toSafeErrorMessage(error));
  }
}

export function getStudySessionStatus(db: Db, courseId: string): StudySessionGeneration | null {
  const row = StudySessionGenerationsRepo.getLatestForCourse(db, courseId);
  return row ? toPublicStatus(row) : null;
}

export interface DownloadStudySessionResult {
  ok: boolean;
  filePath: string | null;
}

/**
 * Apre un dialog "Salva come" per l'ultimo PDF completato con successo del
 * corso e ne scrive una copia nel percorso scelto: il download non
 * rigenera mai la pipeline AI, riusa sempre il file già su disco
 * (electron/services/paths.ts::getStudySessionsDir).
 */
export async function downloadStudySessionPdf(
  db: Db,
  courseId: string,
  showSaveDialog: (defaultPath: string) => Promise<string | null>,
): Promise<DownloadStudySessionResult> {
  const ready = StudySessionGenerationsRepo.getLatestReadyForCourse(db, courseId);
  if (!ready || !ready.pdfPath || !fs.existsSync(ready.pdfPath)) {
    return { ok: false, filePath: null };
  }

  const defaultPath = path.join(getStudySessionsDir(), ready.pdfFileName ?? path.basename(ready.pdfPath));
  const chosenPath = await showSaveDialog(defaultPath);
  if (!chosenPath) return { ok: false, filePath: null };

  fs.copyFileSync(ready.pdfPath, chosenPath);
  return { ok: true, filePath: chosenPath };
}

/**
 * Crash recovery: da chiamare una sola volta all'avvio dell'app (dopo le
 * migrazioni, prima di registrare gli IPC handler, vedi electron/main/index.ts).
 * Un job "queued"/"running" sopravvissuto a un riavvio non ha più un runner
 * in memoria che lo porti a termine: va marcato "failed" per liberare lo
 * slot (l'indice unico parziale altrimenti impedirebbe per sempre una nuova
 * generazione per quel corso) e dare all'utente un esito chiaro.
 */
export function recoverStaleStudySessionJobs(db: Db): void {
  const count = StudySessionGenerationsRepo.failAllStaleActive(
    db,
    "La generazione è stata interrotta da un riavvio dell'app. Riprova.",
  );
  if (count > 0) {
    console.warn(`[studySessionService] ${count} generazione/i "sessione studio" interrotte da un riavvio, marcate come fallite.`);
  }
}
