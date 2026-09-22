import { contextBridge, ipcRenderer } from "electron";
import type {
  Course,
  CreateCourseInput,
  UpdateCourseInput,
  Lesson,
  CreateLessonInput,
  UpdateLessonInput,
  SaveLessonNotesInput,
  Material,
  ImportMaterialInput,
  Flashcard,
  CreateFlashcardInput,
  UpdateFlashcardInput,
  ReviewFlashcardInput,
  LessonAiOutput,
  CourseAiOutput,
  RagQueryResult,
  AppSettings,
  UpdateSettingsInput,
  TestConnectionResult,
  ModelStatus,
  LicenseStatus,
  BackupData,
  UpdateStatus,
  TranscribeAudioInput,
  TranscribeAudioResult,
  GenerateLessonExercisesInput,
  GenerateLessonPresentationInput,
  ExerciseSetGenerationOutcome,
  PresentationGenerationOutcome,
  CloudProviderInfo,
  CloudAiUsageToday,
  GenerateStudySessionResult,
  StudySessionGeneration,
} from "../shared/schemas";

/**
 * Unico punto di contatto tra renderer e main. Ogni metodo è granulare e
 * tipizzato: il renderer non ha mai accesso a `ipcRenderer` grezzo né a Node.
 */
function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

const api = {
  courses: {
    list: () => invoke<Course[]>("courses:list"),
    get: (id: string) => invoke<Course | null>("courses:get", { id }),
    create: (input: CreateCourseInput) => invoke<Course>("courses:create", input),
    update: (input: UpdateCourseInput) => invoke<Course | null>("courses:update", input),
    delete: (id: string) => invoke<{ ok: true }>("courses:delete", { id }),
  },
  lessons: {
    listByCourse: (courseId: string) => invoke<Lesson[]>("lessons:listByCourse", { courseId }),
    get: (id: string) => invoke<Lesson | null>("lessons:get", { id }),
    create: (input: CreateLessonInput) => invoke<Lesson>("lessons:create", input),
    update: (input: UpdateLessonInput) => invoke<Lesson | null>("lessons:update", input),
    delete: (id: string) => invoke<{ ok: true }>("lessons:delete", { id }),
    saveNotes: (input: SaveLessonNotesInput) => invoke<Lesson | null>("lessons:saveNotes", input),
  },
  materials: {
    listByCourse: (courseId: string) => invoke<Material[]>("materials:listByCourse", { courseId }),
    delete: (id: string) => invoke<{ ok: true }>("materials:delete", { id }),
    pickFiles: () => invoke<string[]>("materials:pickFiles"),
    import: (input: ImportMaterialInput) =>
      invoke<Array<Material | null>>("materials:import", input),
  },
  flashcards: {
    listByCourse: (courseId: string) =>
      invoke<Flashcard[]>("flashcards:listByCourse", { courseId }),
    dueToday: () => invoke<Flashcard[]>("flashcards:dueToday"),
    create: (input: CreateFlashcardInput) => invoke<Flashcard>("flashcards:create", input),
    update: (input: UpdateFlashcardInput) => invoke<Flashcard | null>("flashcards:update", input),
    duplicate: (id: string) => invoke<Flashcard | null>("flashcards:duplicate", { id }),
    delete: (id: string) => invoke<{ ok: true }>("flashcards:delete", { id }),
    review: (input: ReviewFlashcardInput) => invoke<Flashcard | null>("flashcards:review", input),
  },
  ai: {
    generateLessonStudyPack: (lessonId: string) =>
      invoke<{ lessonId: string; summaryMarkdown: string; mermaidDiagram: string }>(
        "ai:generateLessonStudyPack",
        { lessonId },
      ),
    generateCourseSummary: (courseId: string) =>
      invoke<CourseAiOutput>("ai:generateCourseSummary", { courseId }),
    getCourseSummary: (courseId: string) =>
      invoke<CourseAiOutput | null>("ai:getCourseSummary", { courseId }),
    getLessonAiOutput: (lessonId: string) =>
      invoke<LessonAiOutput | null>("ai:getLessonAiOutput", { lessonId }),
    testConnection: () => invoke<TestConnectionResult>("ai:testConnection"),
    getModelStatus: () => invoke<ModelStatus>("ai:getModelStatus"),
    downloadModel: () => invoke<{ ok: true }>("ai:downloadModel"),
    transcribeAudio: (input: TranscribeAudioInput) =>
      invoke<TranscribeAudioResult>("ai:transcribeAudio", input),
    getCloudProviderInfo: () => invoke<CloudProviderInfo>("ai:getCloudProviderInfo"),
  },
  studyAi: {
    generateExercises: (input: GenerateLessonExercisesInput) =>
      invoke<ExerciseSetGenerationOutcome>("studyAi:generateExercises", input),
    generatePresentation: (input: GenerateLessonPresentationInput) =>
      invoke<PresentationGenerationOutcome>("studyAi:generatePresentation", input),
  },
  rag: {
    query: (courseId: string, question: string, activeLessonId?: string | null) =>
      invoke<RagQueryResult>("rag:query", { courseId, question, activeLessonId }),
  },
  usage: {
    getCloudAiToday: () => invoke<CloudAiUsageToday>("usage:getCloudAiToday"),
  },
  studySession: {
    generate: (courseId: string) => invoke<GenerateStudySessionResult>("studySession:generate", { courseId }),
    getStatus: (courseId: string) => invoke<StudySessionGeneration | null>("studySession:getStatus", { courseId }),
    download: (courseId: string) =>
      invoke<{ ok: boolean; filePath: string | null }>("studySession:download", { courseId }),
  },
  settings: {
    get: () => invoke<AppSettings>("settings:get"),
    update: (input: UpdateSettingsInput) => invoke<AppSettings>("settings:update", input),
    pickImportFolder: () => invoke<string | null>("settings:pickImportFolder"),
  },
  backup: {
    export: () => invoke<{ ok: boolean; filePath: string | null }>("backup:export"),
    pickImportFile: () => invoke<string | null>("backup:pickImportFile"),
    import: (filePath: string) => invoke<{ ok: true }>("backup:import", { filePath }),
  },
  app: {
    getVersion: () => invoke<string>("app:getVersion"),
  },
  license: {
    getStatus: () => invoke<LicenseStatus>("license:getStatus"),
    activate: (licenseKey: string) => invoke<LicenseStatus>("license:activate", { licenseKey }),
  },
  updates: {
    getStatus: () => invoke<UpdateStatus>("updates:getStatus"),
    check: () => invoke<{ ok: true }>("updates:check"),
    quitAndInstall: () => invoke<{ ok: true }>("updates:quitAndInstall"),
  },
};

export type RStudyApi = typeof api;
export type { LessonAiOutput, BackupData };

contextBridge.exposeInMainWorld("rstudy", api);
