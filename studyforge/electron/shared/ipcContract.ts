import { z } from "zod";
import {
  createCourseInputSchema,
  updateCourseInputSchema,
  idInputSchema,
  createLessonInputSchema,
  updateLessonInputSchema,
  saveLessonNotesInputSchema,
  listByCourseInputSchema,
  importMaterialInputSchema,
  generateLessonStudyPackInputSchema,
  createFlashcardInputSchema,
  updateFlashcardInputSchema,
  reviewFlashcardInputSchema,
  generateCourseSummaryInputSchema,
  ragQueryInputSchema,
  updateSettingsInputSchema,
  generateLessonExercisesInputSchema,
  generateLessonPresentationInputSchema,
  activateLicenseInputSchema,
  transcribeAudioInputSchema,
  generateStudySessionInputSchema,
  getStudySessionStatusInputSchema,
  downloadStudySessionInputSchema,
} from "./schemas";

/**
 * Contratto unico dei canali IPC: nome canale -> schema Zod dell'input.
 * Usato dal main per validare (ipcHandlers.ts) e dal preload per esporre
 * metodi granulari tipizzati (mai ipcRenderer diretto nel renderer).
 */
export const ipcInputSchemas = {
  "courses:list": z.undefined(),
  "courses:get": idInputSchema,
  "courses:create": createCourseInputSchema,
  "courses:update": updateCourseInputSchema,
  "courses:delete": idInputSchema,

  "lessons:listByCourse": listByCourseInputSchema,
  "lessons:get": idInputSchema,
  "lessons:create": createLessonInputSchema,
  "lessons:update": updateLessonInputSchema,
  "lessons:delete": idInputSchema,
  "lessons:saveNotes": saveLessonNotesInputSchema,

  "materials:listByCourse": listByCourseInputSchema,
  "materials:delete": idInputSchema,
  "materials:import": importMaterialInputSchema,
  "materials:pickFiles": z.undefined(),

  "flashcards:listByCourse": listByCourseInputSchema,
  "flashcards:dueToday": z.undefined(),
  "flashcards:create": createFlashcardInputSchema,
  "flashcards:update": updateFlashcardInputSchema,
  "flashcards:delete": idInputSchema,
  "flashcards:duplicate": idInputSchema,
  "flashcards:review": reviewFlashcardInputSchema,

  "ai:generateLessonStudyPack": generateLessonStudyPackInputSchema,
  "ai:generateCourseSummary": generateCourseSummaryInputSchema,
  "ai:getCourseSummary": generateCourseSummaryInputSchema,
  "ai:getLessonAiOutput": generateLessonStudyPackInputSchema,
  "ai:testConnection": z.undefined(),
  "ai:getModelStatus": z.undefined(),
  "ai:downloadModel": z.undefined(),
  "ai:transcribeAudio": transcribeAudioInputSchema,
  "ai:getCloudProviderInfo": z.undefined(),

  "studyAi:generateExercises": generateLessonExercisesInputSchema,
  "studyAi:generatePresentation": generateLessonPresentationInputSchema,

  "rag:query": ragQueryInputSchema,

  "usage:getCloudAiToday": z.undefined(),

  "studySession:generate": generateStudySessionInputSchema,
  "studySession:getStatus": getStudySessionStatusInputSchema,
  "studySession:download": downloadStudySessionInputSchema,

  "settings:get": z.undefined(),
  "settings:update": updateSettingsInputSchema,
  "settings:pickImportFolder": z.undefined(),

  "backup:export": z.undefined(),
  "backup:pickImportFile": z.undefined(),
  "backup:import": z.object({ filePath: z.string().min(1) }),

  "license:getStatus": z.undefined(),
  "license:activate": activateLicenseInputSchema,

  "app:getVersion": z.undefined(),

  "updates:getStatus": z.undefined(),
  "updates:check": z.undefined(),
  "updates:quitAndInstall": z.undefined(),
} as const;

export type IpcChannel = keyof typeof ipcInputSchemas;
export type IpcInput<C extends IpcChannel> = z.infer<(typeof ipcInputSchemas)[C]>;
