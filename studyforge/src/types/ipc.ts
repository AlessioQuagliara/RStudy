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
  CourseAiOutput,
  LessonAiOutput,
  RagQueryResult,
  AppSettings,
  UpdateSettingsInput,
  TestConnectionResult,
  ModelStatus,
  LicenseStatus,
  UpdateStatus,
  GenerateLessonExercisesInput,
  GenerateLessonPresentationInput,
  ExerciseSetGenerationOutcome,
  PresentationGenerationOutcome,
} from "@shared/schemas";

/**
 * Forma dell'API esposta dal preload su `window.rstudy`. Duplica (invece
 * di importare) la definizione di electron/preload/index.ts per tenere il
 * typecheck del renderer isolato dai moduli Node/Electron del main process.
 */
export interface RStudyApi {
  courses: {
    list: () => Promise<Course[]>;
    get: (id: string) => Promise<Course | null>;
    create: (input: CreateCourseInput) => Promise<Course>;
    update: (input: UpdateCourseInput) => Promise<Course | null>;
    delete: (id: string) => Promise<{ ok: true }>;
  };
  lessons: {
    listByCourse: (courseId: string) => Promise<Lesson[]>;
    get: (id: string) => Promise<Lesson | null>;
    create: (input: CreateLessonInput) => Promise<Lesson>;
    update: (input: UpdateLessonInput) => Promise<Lesson | null>;
    delete: (id: string) => Promise<{ ok: true }>;
    saveNotes: (input: SaveLessonNotesInput) => Promise<Lesson | null>;
  };
  materials: {
    listByCourse: (courseId: string) => Promise<Material[]>;
    delete: (id: string) => Promise<{ ok: true }>;
    pickFiles: () => Promise<string[]>;
    import: (input: ImportMaterialInput) => Promise<Array<Material | null>>;
  };
  flashcards: {
    listByCourse: (courseId: string) => Promise<Flashcard[]>;
    dueToday: () => Promise<Flashcard[]>;
    create: (input: CreateFlashcardInput) => Promise<Flashcard>;
    update: (input: UpdateFlashcardInput) => Promise<Flashcard | null>;
    duplicate: (id: string) => Promise<Flashcard | null>;
    delete: (id: string) => Promise<{ ok: true }>;
    review: (input: ReviewFlashcardInput) => Promise<Flashcard | null>;
  };
  ai: {
    generateLessonStudyPack: (
      lessonId: string,
    ) => Promise<{ lessonId: string; summaryMarkdown: string; mermaidDiagram: string }>;
    generateCourseSummary: (courseId: string) => Promise<CourseAiOutput>;
    getCourseSummary: (courseId: string) => Promise<CourseAiOutput | null>;
    getLessonAiOutput: (lessonId: string) => Promise<LessonAiOutput | null>;
    testConnection: () => Promise<TestConnectionResult>;
    getModelStatus: () => Promise<ModelStatus>;
    downloadModel: () => Promise<{ ok: true }>;
  };
  studyAi: {
    generateExercises: (
      input: GenerateLessonExercisesInput,
    ) => Promise<ExerciseSetGenerationOutcome>;
    generatePresentation: (
      input: GenerateLessonPresentationInput,
    ) => Promise<PresentationGenerationOutcome>;
  };
  rag: {
    query: (
      courseId: string,
      question: string,
      activeLessonId?: string | null,
    ) => Promise<RagQueryResult>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    update: (input: UpdateSettingsInput) => Promise<AppSettings>;
    pickImportFolder: () => Promise<string | null>;
  };
  backup: {
    export: () => Promise<{ ok: boolean; filePath: string | null }>;
    pickImportFile: () => Promise<string | null>;
    import: (filePath: string) => Promise<{ ok: true }>;
  };
  app: {
    getVersion: () => Promise<string>;
  };
  license: {
    getStatus: () => Promise<LicenseStatus>;
    activate: (licenseKey: string) => Promise<LicenseStatus>;
  };
  updates: {
    getStatus: () => Promise<UpdateStatus>;
    check: () => Promise<{ ok: true }>;
    quitAndInstall: () => Promise<{ ok: true }>;
  };
}

declare global {
  interface Window {
    rstudy: RStudyApi;
  }
}
