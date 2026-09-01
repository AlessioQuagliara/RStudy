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

// ---------- AI: esercizi interattivi progressivi ----------
// Contratto per la generazione di esercizi da una lezione. Solo tipi/schema:
// nessuna chiamata al provider, nessun canale IPC, nessuna tabella DB qui.

export const exerciseDifficultySchema = z.number().int().min(1).max(5);
export type ExerciseDifficulty = z.infer<typeof exerciseDifficultySchema>;

/**
 * Linguaggi di programmazione supportati per i coding_challenge (e per i
 * codeBlocks delle slide di presentazione). L'audit del repository non ha
 * trovato un elenco di linguaggi già supportato altrove nell'app: questo
 * enum ristretto è nuovo e va tenuto come unica fonte di verità.
 */
export const supportedCodeLanguageSchema = z.enum([
  "javascript",
  "typescript",
  "python",
  "c",
  "cpp",
]);
export type SupportedCodeLanguage = z.infer<typeof supportedCodeLanguageSchema>;

export const multipleChoiceExerciseSchema = z.object({
  type: z.literal("multiple_choice"),
  id: z.string().min(1),
  // Testo Markdown con eventuale LaTeX delimitato da $...$ o $$...$$.
  question: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  correctAnswer: z.string().min(1),
  explanation: z.string().min(1),
  difficulty: exerciseDifficultySchema,
});
export type MultipleChoiceExercise = z.infer<typeof multipleChoiceExerciseSchema>;

export const openAnswerExerciseSchema = z.object({
  type: z.literal("open_answer"),
  id: z.string().min(1),
  question: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  explanation: z.string().min(1),
  difficulty: exerciseDifficultySchema,
});
export type OpenAnswerExercise = z.infer<typeof openAnswerExerciseSchema>;

export const codingChallengeExerciseSchema = z.object({
  type: z.literal("coding_challenge"),
  id: z.string().min(1),
  question: z.string().min(1),
  language: supportedCodeLanguageSchema,
  // Stringa vuota ammessa: un esercizio può partire da un file bianco.
  starterCode: z.string(),
  expectedSolution: z.string().min(1),
  evaluationHints: z.array(z.string().min(1)).optional(),
  explanation: z.string().min(1),
  difficulty: exerciseDifficultySchema,
});
export type CodingChallengeExercise = z.infer<typeof codingChallengeExerciseSchema>;

/**
 * Unione discriminata dei tre tipi di esercizio. `discriminatedUnion` non
 * accetta membri con `.superRefine`/`.refine` (perde l'accesso diretto allo
 * shape per il discriminante), quindi la validazione incrociata
 * options/correctAnswer del multiple_choice è applicata con un
 * `.superRefine` sopra l'intera unione invece che sul singolo schema.
 */
const exerciseUnionSchema = z.discriminatedUnion("type", [
  multipleChoiceExerciseSchema,
  openAnswerExerciseSchema,
  codingChallengeExerciseSchema,
]);

export const exerciseSchema = exerciseUnionSchema.superRefine((exercise, ctx) => {
  if (exercise.type !== "multiple_choice") return;
  if (new Set(exercise.options).size !== exercise.options.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Le opzioni non possono contenere duplicati",
      path: ["options"],
    });
  }
  if (!exercise.options.includes(exercise.correctAnswer)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "correctAnswer deve essere una delle opzioni disponibili",
      path: ["correctAnswer"],
    });
  }
});
export type Exercise = z.infer<typeof exerciseSchema>;

export const exerciseSetSchema = z.object({
  // Versione dello schema del contenuto generato (non il prompt_version del
  // modello AI, vedi electron/ai/prompts.ts): permette di far evolvere la
  // forma di ExerciseSet in futuro senza rompere i set già salvati.
  version: z.number().int().positive(),
  sourceLessonId: z.string().min(1),
  title: z.string().min(1),
  generatedAt: z.string().min(1),
  exercises: z.array(exerciseSchema).min(3).max(8),
  // Hash del testo sorgente (appunti lezione) usato per la generazione, utile
  // in futuro per capire se il set è ancora coerente con gli appunti attuali.
  sourceContentHash: z.string().min(1).optional(),
});
export type ExerciseSet = z.infer<typeof exerciseSetSchema>;

export const localeSchema = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, "Locale non valido (atteso formato BCP-47, es. it-IT)");

export const generateExerciseSetInputSchema = z.object({
  lessonId: z.string().min(1),
  // Testo sorgente della lezione (notesPlainText, coerente con il pattern
  // già usato da electron/ai/studyPack.ts): non l'HTML/JSON TipTap.
  sourceText: z.string().min(1).max(20000),
  subject: z.string().min(1).max(200).optional(),
  requestedCount: z.number().int().min(3).max(8),
  locale: localeSchema.default("it-IT"),
});
export type GenerateExerciseSetInput = z.infer<typeof generateExerciseSetInputSchema>;

/**
 * Input del canale IPC `studyAi:generateExercises`: SOLO `lessonId` (+ opzioni),
 * mai `sourceText` dal renderer. Il main deriva gli appunti da leggere
 * (`lessons.notesPlainText`) internamente, stesso pattern già in uso per
 * `ai:generateLessonStudyPack` (electron/ipc/handlers/ai.ts): il renderer non
 * spedisce mai il contenuto della lezione via IPC, e l'hash di cache viene
 * sempre calcolato sul testo autorevole nel DB, non su testo arbitrario che
 * un renderer compromesso o buggato potrebbe inviare.
 */
export const generateLessonExercisesInputSchema = z.object({
  lessonId: z.string().min(1),
  subject: z.string().min(1).max(200).optional(),
  requestedCount: z.number().int().min(3).max(8).default(5),
  locale: localeSchema.default("it-IT"),
});
/**
 * `z.input` (non `z.infer`/`z.output`) di proposito: è il tipo di ciò che il
 * CHIAMANTE può fornire prima dell'applicazione dei default Zod, quindi
 * `requestedCount`/`locale` restano opzionali qui — il renderer può mandare
 * solo `{ lessonId }` e lasciare che sia il main (via safeHandle -> .parse())
 * ad applicare i default. Il tipo pienamente risolto (post-default) non ha
 * bisogno di un proprio alias: emerge automaticamente da
 * `generateLessonExercisesInputSchema.parse(...)` ovunque serva (vedi
 * electron/ai/exerciseSet.ts).
 */
export type GenerateLessonExercisesInput = z.input<typeof generateLessonExercisesInputSchema>;

// ---------- AI: presentazione sintetica ----------

export const presentationSlideTypeSchema = z.enum(["title", "content", "code", "summary", "quiz"]);
export type PresentationSlideType = z.infer<typeof presentationSlideTypeSchema>;

export const presentationCodeBlockSchema = z.object({
  language: supportedCodeLanguageSchema,
  code: z.string().min(1),
  caption: z.string().min(1).optional(),
});
export type PresentationCodeBlock = z.infer<typeof presentationCodeBlockSchema>;

const presentationSlideShape = z.object({
  id: z.string().min(1),
  type: presentationSlideTypeSchema,
  title: z.string().min(1),
  // Elenco puntato in testo semplice/Markdown breve, mai HTML generato
  // dall'AI: la presentazione è dati strutturati, non una stringa unica.
  bullets: z.array(z.string().min(1)).max(12),
  speakerNotes: z.string().min(1).optional(),
  codeBlocks: z.array(presentationCodeBlockSchema).max(6).optional(),
});

export const presentationSlideSchema = presentationSlideShape.superRefine((slide, ctx) => {
  if (slide.type === "code" && (!slide.codeBlocks || slide.codeBlocks.length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Le slide di tipo 'code' devono avere almeno un codeBlock",
      path: ["codeBlocks"],
    });
  }
});
export type PresentationSlide = z.infer<typeof presentationSlideSchema>;

export const presentationSchema = z.object({
  version: z.number().int().positive(),
  sourceLessonId: z.string().min(1),
  title: z.string().min(1),
  generatedAt: z.string().min(1),
  // Limite superiore difensivo: nessun vincolo esplicito richiesto, ma un
  // array non limitato non è sicuro da validare da un provider esterno.
  slides: z.array(presentationSlideSchema).min(3).max(20),
  sourceContentHash: z.string().min(1).optional(),
});
export type Presentation = z.infer<typeof presentationSchema>;

export const generatePresentationInputSchema = z.object({
  lessonId: z.string().min(1),
  sourceText: z.string().min(1).max(20000),
  subject: z.string().min(1).max(200).optional(),
  requestedCount: z.number().int().min(3).max(20),
  locale: localeSchema.default("it-IT"),
});
export type GeneratePresentationInput = z.infer<typeof generatePresentationInputSchema>;

/** Input del canale IPC `studyAi:generatePresentation`: vedi il commento gemello su generateLessonExercisesInputSchema. */
export const generateLessonPresentationInputSchema = z.object({
  lessonId: z.string().min(1),
  subject: z.string().min(1).max(200).optional(),
  requestedCount: z.number().int().min(3).max(20).default(8),
  locale: localeSchema.default("it-IT"),
});
/** `z.input`, non `z.infer`: vedi il commento gemello su GenerateLessonExercisesInput. */
export type GenerateLessonPresentationInput = z.input<typeof generateLessonPresentationInputSchema>;

// ---------- AI: risultato/errore serializzabile (boundary IPC) ----------
// L'audit non ha trovato un envelope Result<T,E> già esistente: gli handler
// IPC attuali (electron/ipc/safeHandle.ts) lasciano propagare l'eccezione e
// si affidano alla serializzazione di default di Electron (solo
// `error.message` arriva al renderer). L'unico precedente simile è
// `testConnectionResultSchema` ({ ok, message }). Questo envelope è nuovo,
// pensato per i futuri canali `ai:generateLessonExercises` /
// `ai:generateLessonPresentation`, così l'esito (successo con dati tipizzati
// o errore con codice) resti un oggetto JSON puro senza passare da
// un'istanza `Error` non garantita serializzabile.

export const aiGenerationErrorCodeSchema = z.enum([
  // Nessuna API key AI configurata: non è stato nemmeno tentato un contatto col provider.
  "not_configured",
  // La lezione richiesta (lessonId) non esiste (più): nessun contatto col provider.
  "not_found",
  "invalid_response",
  "provider_error",
  "timeout",
  "rate_limited",
  "unknown",
]);
export type AiGenerationErrorCode = z.infer<typeof aiGenerationErrorCodeSchema>;

export const aiGenerationErrorSchema = z.object({
  code: aiGenerationErrorCodeSchema,
  message: z.string().min(1),
});
export type AiGenerationError = z.infer<typeof aiGenerationErrorSchema>;

export function createAiGenerationResultSchema<DataSchema extends z.ZodTypeAny>(
  dataSchema: DataSchema,
) {
  return z.discriminatedUnion("status", [
    z.object({ status: z.literal("success"), data: dataSchema }),
    z.object({ status: z.literal("error"), error: aiGenerationErrorSchema }),
  ]);
}

export const exerciseSetGenerationResultSchema = createAiGenerationResultSchema(exerciseSetSchema);
export type ExerciseSetGenerationResult = z.infer<typeof exerciseSetGenerationResultSchema>;

export const presentationGenerationResultSchema =
  createAiGenerationResultSchema(presentationSchema);
export type PresentationGenerationResult = z.infer<typeof presentationGenerationResultSchema>;

/**
 * Come createAiGenerationResultSchema, ma con `fromCache` incluso nello
 * schema stesso (non aggiunto "a mano" dopo): è la forma restituita
 * dall'orchestrazione con cache (electron/ai/exerciseSet.ts,
 * electron/ai/presentation.ts) e quindi dai canali IPC
 * `studyAi:generateExercises`/`studyAi:generatePresentation`.
 */
export function createAiGenerationOutcomeSchema<DataSchema extends z.ZodTypeAny>(
  dataSchema: DataSchema,
) {
  return z.discriminatedUnion("status", [
    z.object({ status: z.literal("success"), data: dataSchema, fromCache: z.boolean() }),
    z.object({
      status: z.literal("error"),
      error: aiGenerationErrorSchema,
      fromCache: z.boolean(),
    }),
  ]);
}

export const exerciseSetGenerationOutcomeSchema =
  createAiGenerationOutcomeSchema(exerciseSetSchema);
export type ExerciseSetGenerationOutcome = z.infer<typeof exerciseSetGenerationOutcomeSchema>;

export const presentationGenerationOutcomeSchema =
  createAiGenerationOutcomeSchema(presentationSchema);
export type PresentationGenerationOutcome = z.infer<typeof presentationGenerationOutcomeSchema>;

// ---------- AI: generazioni persistite per lezione (cache + storico) ----------
// Forma della riga così come persistita in `lesson_ai_generations`
// (electron/db/schema.ts): `payloadJson` è la stringa JSON grezza (validata
// col relativo schema solo quando serve il contenuto tipizzato, vedi
// electron/db/repositories.ts::LessonAiGenerationsRepo), non il payload già
// parsato — stesso stile di `lessonAiOutputSchema`/`courseAiOutputSchema`.

export const aiGenerationKindSchema = z.enum(["exercise_set", "presentation"]);
export type AiGenerationKind = z.infer<typeof aiGenerationKindSchema>;

export const aiGenerationStatusSchema = z.enum(["ready", "failed"]);
export type AiGenerationStatus = z.infer<typeof aiGenerationStatusSchema>;

export const lessonAiGenerationSchema = z
  .object({
    id: z.string(),
    lessonId: z.string(),
    kind: aiGenerationKindSchema,
    sourceContentHash: z.string(),
    schemaVersion: z.number().int(),
    model: z.string(),
    status: aiGenerationStatusSchema,
    payloadJson: z.string().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .superRefine((row, ctx) => {
    if (row.status === "ready" && row.payloadJson === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Una generazione 'ready' deve avere un payloadJson",
        path: ["payloadJson"],
      });
    }
    if (row.status === "failed" && row.errorMessage === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Una generazione 'failed' deve avere un errorMessage",
        path: ["errorMessage"],
      });
    }
  });
export type LessonAiGeneration = z.infer<typeof lessonAiGenerationSchema>;
