import { z } from "zod";

/**
 * Schemi Zod condivisi tra main (validazione IPC) e renderer (tipi).
 * Ogni handler IPC nel main DEVE validare il payload in ingresso con questi schemi
 * prima di toccare il database o chiamare servizi esterni.
 */

export const courseStatusSchema = z.enum(["active", "completed", "archived"]);
export type CourseStatus = z.infer<typeof courseStatusSchema>;
export const lessonStatusSchema = z.enum(["draft", "completed"]);
export type LessonStatus = z.infer<typeof lessonStatusSchema>;
export const aiStatusSchema = z.enum(["idle", "queued", "processing", "completed", "failed"]);
export type AiStatus = z.infer<typeof aiStatusSchema>;
export const materialTypeSchema = z.enum(["lecture", "notes", "exercise", "deepening", "other"]);
export type MaterialType = z.infer<typeof materialTypeSchema>;
export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof difficultySchema>;
export const flashcardSourceSchema = z.enum(["ai", "manual"]);
export type FlashcardSource = z.infer<typeof flashcardSourceSchema>;
export const themeModeSchema = z.enum(["light", "dark", "system"]);
export type ThemeMode = z.infer<typeof themeModeSchema>;

export const courseSchema = z.object({
  id: z.string(),
  title: z.string(),
  code: z.string().nullable(),
  cfu: z.number().int().nonnegative(),
  examDate: z.string().nullable(),
  introduction: z.string().nullable(),
  objectives: z.string().nullable(),
  targetLessons: z.number().int().nonnegative().nullable(),
  status: courseStatusSchema,
  color: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Course = z.infer<typeof courseSchema>;

export const createCourseInputSchema = z.object({
  title: z.string().min(1).max(200),
  code: z.string().max(50).nullable().optional(),
  cfu: z.number().int().min(0).max(60),
  examDate: z.string().nullable().optional(),
  introduction: z.string().max(5000).nullable().optional(),
  objectives: z.string().max(5000).nullable().optional(),
  targetLessons: z.number().int().min(0).max(200).nullable().optional(),
  status: courseStatusSchema.optional(),
  color: z.string().max(20).nullable().optional(),
});
export type CreateCourseInput = z.infer<typeof createCourseInputSchema>;

export const updateCourseInputSchema = createCourseInputSchema.partial().extend({
  id: z.string().min(1),
});
export type UpdateCourseInput = z.infer<typeof updateCourseInputSchema>;

export const idInputSchema = z.object({ id: z.string().min(1) });
export type IdInput = z.infer<typeof idInputSchema>;

export const lessonSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  lessonNumber: z.number().int(),
  title: z.string(),
  lessonDate: z.string().nullable(),
  status: lessonStatusSchema,
  notesJson: z.string().nullable(),
  notesPlainText: z.string().nullable(),
  aiStatus: aiStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Lesson = z.infer<typeof lessonSchema>;

export const createLessonInputSchema = z.object({
  courseId: z.string().min(1),
  lessonNumber: z.number().int().min(1),
  title: z.string().min(1).max(200),
  lessonDate: z.string().nullable().optional(),
});
export type CreateLessonInput = z.infer<typeof createLessonInputSchema>;

export const updateLessonInputSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  lessonDate: z.string().nullable().optional(),
  status: lessonStatusSchema.optional(),
  lessonNumber: z.number().int().min(1).optional(),
});
export type UpdateLessonInput = z.infer<typeof updateLessonInputSchema>;

export const saveLessonNotesInputSchema = z.object({
  id: z.string().min(1),
  notesJson: z.string(),
  notesPlainText: z.string(),
});
export type SaveLessonNotesInput = z.infer<typeof saveLessonNotesInputSchema>;

export const materialSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  lessonId: z.string().nullable(),
  title: z.string(),
  originalFilename: z.string(),
  mimeType: z.string(),
  filePath: z.string(),
  fileSize: z.number().int(),
  materialType: materialTypeSchema,
  extractedText: z.string().nullable(),
  extractionStatus: z.enum(["pending", "done", "unsupported", "failed"]),
  createdAt: z.string(),
});
export type Material = z.infer<typeof materialSchema>;

export const importMaterialInputSchema = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().nullable().optional(),
  materialType: materialTypeSchema,
  filePaths: z.array(z.string().min(1)).min(1),
});
export type ImportMaterialInput = z.infer<typeof importMaterialInputSchema>;

export const listByCourseInputSchema = z.object({ courseId: z.string().min(1) });
export type ListByCourseInput = z.infer<typeof listByCourseInputSchema>;

export const keyPointSchema = z.object({ title: z.string(), explanation: z.string() });
export type KeyPoint = z.infer<typeof keyPointSchema>;
export const studyOutlineTopicSchema = z.object({
  topic: z.string(),
  subtopics: z.array(z.string()),
});
export type StudyOutlineTopic = z.infer<typeof studyOutlineTopicSchema>;
export const aiFlashcardSchema = z.object({
  front: z.string(),
  back: z.string(),
  tags: z.array(z.string()).default([]),
  difficulty: difficultySchema,
});
export const selfCheckQuestionSchema = z.object({ question: z.string(), answer: z.string() });
export type SelfCheckQuestion = z.infer<typeof selfCheckQuestionSchema>;

export const lessonStudyPackSchema = z.object({
  summary_markdown: z.string(),
  key_points: z.array(keyPointSchema),
  study_outline: z.array(studyOutlineTopicSchema),
  mermaid_diagram: z.string(),
  // Il range 8-20 è imposto via prompt (vedi ai/prompts.ts); qui restiamo permissivi
  // (min 1) per non far fallire l'intera generazione se gli appunti sono scarni e il
  // modello, correttamente, riduce il numero di flashcard invece di allucinarne altre.
  flashcards: z.array(aiFlashcardSchema).min(1).max(30),
  self_check_questions: z.array(selfCheckQuestionSchema),
});
export type LessonStudyPack = z.infer<typeof lessonStudyPackSchema>;

export const lessonAiOutputSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  summaryMarkdown: z.string(),
  keyPointsJson: z.string(),
  studyOutlineJson: z.string(),
  mermaidDiagram: z.string(),
  selfCheckQuestionsJson: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LessonAiOutput = z.infer<typeof lessonAiOutputSchema>;

export const generateLessonStudyPackInputSchema = z.object({ lessonId: z.string().min(1) });
export type GenerateLessonStudyPackInput = z.infer<typeof generateLessonStudyPackInputSchema>;

export const flashcardSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  lessonId: z.string().nullable(),
  front: z.string(),
  back: z.string(),
  tagsJson: z.string(),
  difficulty: difficultySchema,
  source: flashcardSourceSchema,
  nextReviewAt: z.string().nullable(),
  reviewCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Flashcard = z.infer<typeof flashcardSchema>;

export const createFlashcardInputSchema = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().nullable().optional(),
  front: z.string().min(1).max(1000),
  back: z.string().min(1).max(2000),
  tags: z.array(z.string()).default([]),
  difficulty: difficultySchema.default("medium"),
  source: flashcardSourceSchema.default("manual"),
});
export type CreateFlashcardInput = z.infer<typeof createFlashcardInputSchema>;

export const updateFlashcardInputSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1).max(1000).optional(),
  back: z.string().min(1).max(2000).optional(),
  tags: z.array(z.string()).optional(),
  difficulty: difficultySchema.optional(),
});
export type UpdateFlashcardInput = z.infer<typeof updateFlashcardInputSchema>;

export const reviewFlashcardInputSchema = z.object({
  id: z.string().min(1),
  grade: z.enum(["easy", "medium", "hard"]),
});
export type ReviewFlashcardInput = z.infer<typeof reviewFlashcardInputSchema>;

export const courseAiOutputSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  comprehensiveSummaryMarkdown: z.string(),
  courseOutlineJson: z.string(),
  mermaidDiagram: z.string(),
  suggestedStudyPlanJson: z.string(),
  generatedFromLessonCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CourseAiOutput = z.infer<typeof courseAiOutputSchema>;

export const generateCourseSummaryInputSchema = z.object({ courseId: z.string().min(1) });
export type GenerateCourseSummaryInput = z.infer<typeof generateCourseSummaryInputSchema>;

export const ragCitationSchema = z.object({
  sourceLabel: z.string(),
  excerpt: z.string(),
  materialId: z.string().nullable(),
  lessonId: z.string().nullable(),
});
export const ragQueryInputSchema = z.object({
  courseId: z.string().min(1),
  question: z.string().min(1).max(2000),
  activeLessonId: z.string().nullable().optional(),
});
export type RagQueryInput = z.infer<typeof ragQueryInputSchema>;

export const ragQueryResultSchema = z.object({
  answer: z.string(),
  citations: z.array(ragCitationSchema),
  insufficientContext: z.boolean(),
});
export type RagQueryResult = z.infer<typeof ragQueryResultSchema>;

export const appSettingsSchema = z.object({
  deepseekBaseUrl: z.string().url(),
  deepseekModel: z.string().min(1),
  deepseekEmbeddingModel: z.string().nullable(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(256).max(16000),
  language: z.literal("it"),
  theme: themeModeSchema,
  importFolder: z.string().nullable(),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const updateSettingsInputSchema = appSettingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsInputSchema>;

export const setApiKeyInputSchema = z.object({ apiKey: z.string().min(10).max(500) });
export type SetApiKeyInput = z.infer<typeof setApiKeyInputSchema>;

export const testConnectionResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});
export type TestConnectionResult = z.infer<typeof testConnectionResultSchema>;

export const backupDataSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  courses: z.array(courseSchema),
  lessons: z.array(lessonSchema),
  materials: z.array(materialSchema.omit({ filePath: true })),
  flashcards: z.array(flashcardSchema),
  lessonAiOutputs: z.array(lessonAiOutputSchema),
  courseAiOutputs: z.array(courseAiOutputSchema),
});
export type BackupData = z.infer<typeof backupDataSchema>;
