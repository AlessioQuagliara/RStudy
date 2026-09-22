import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
};

export const courses = sqliteTable(
  "courses",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    code: text("code"),
    cfu: integer("cfu").notNull().default(0),
    examDate: text("exam_date"),
    introduction: text("introduction"),
    objectives: text("objectives"),
    targetLessons: integer("target_lessons"),
    status: text("status", { enum: ["active", "completed", "archived"] })
      .notNull()
      .default("active"),
    color: text("color"),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [index("courses_status_idx").on(t.status)],
);

export const lessons = sqliteTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonNumber: integer("lesson_number").notNull(),
    title: text("title").notNull(),
    lessonDate: text("lesson_date"),
    status: text("status", { enum: ["draft", "completed"] })
      .notNull()
      .default("draft"),
    notesJson: text("notes_json"),
    notesPlainText: text("notes_plain_text"),
    aiStatus: text("ai_status", {
      enum: ["idle", "queued", "processing", "completed", "failed"],
    })
      .notNull()
      .default("idle"),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [index("lessons_course_id_idx").on(t.courseId), index("lessons_status_idx").on(t.status)],
);

export const materials = sqliteTable(
  "materials",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    filePath: text("file_path").notNull(),
    fileSize: integer("file_size").notNull(),
    materialType: text("material_type", {
      enum: ["lecture", "notes", "exercise", "deepening", "other"],
    })
      .notNull()
      .default("other"),
    extractedText: text("extracted_text"),
    extractionStatus: text("extraction_status", {
      enum: ["pending", "done", "unsupported", "failed"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("materials_course_id_idx").on(t.courseId),
    index("materials_lesson_id_idx").on(t.lessonId),
  ],
);

export const documentChunks = sqliteTable(
  "document_chunks",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    materialId: text("material_id").references(() => materials.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    sourceLabel: text("source_label").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    embedding: text("embedding"),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("document_chunks_course_id_idx").on(t.courseId),
    index("document_chunks_lesson_id_idx").on(t.lessonId),
    index("document_chunks_material_id_idx").on(t.materialId),
  ],
);

export const lessonAiOutputs = sqliteTable(
  "lesson_ai_outputs",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    summaryMarkdown: text("summary_markdown").notNull(),
    keyPointsJson: text("key_points_json").notNull(),
    studyOutlineJson: text("study_outline_json").notNull(),
    mermaidDiagram: text("mermaid_diagram").notNull(),
    selfCheckQuestionsJson: text("self_check_questions_json").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [uniqueIndex("lesson_ai_outputs_lesson_id_uidx").on(t.lessonId)],
);

export const flashcards = sqliteTable(
  "flashcards",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
    tagsJson: text("tags_json").notNull().default("[]"),
    difficulty: text("difficulty", { enum: ["easy", "medium", "hard"] })
      .notNull()
      .default("medium"),
    source: text("source", { enum: ["ai", "manual"] })
      .notNull()
      .default("manual"),
    nextReviewAt: text("next_review_at"),
    reviewCount: integer("review_count").notNull().default(0),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [
    index("flashcards_course_id_idx").on(t.courseId),
    index("flashcards_lesson_id_idx").on(t.lessonId),
    index("flashcards_next_review_at_idx").on(t.nextReviewAt),
  ],
);

export const courseAiOutputs = sqliteTable(
  "course_ai_outputs",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    comprehensiveSummaryMarkdown: text("comprehensive_summary_markdown").notNull(),
    courseOutlineJson: text("course_outline_json").notNull(),
    mermaidDiagram: text("mermaid_diagram").notNull(),
    suggestedStudyPlanJson: text("suggested_study_plan_json").notNull(),
    generatedFromLessonCount: integer("generated_from_lesson_count").notNull().default(0),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [index("course_ai_outputs_course_id_idx").on(t.courseId)],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: timestamps.updatedAt,
});

/**
 * Una sola riga per installazione (id fisso "current", stesso pattern di
 * app_settings). La licenza è perpetua (one-time): `updatesValidUntil` è
 * precalcolato all'attivazione (purchasedAt + 1 anno) così le verifiche
 * successive (electron/services/licenseService.ts) sono un semplice
 * confronto di date, senza richiamare Paddle ad ogni avvio.
 */
export const license = sqliteTable("license", {
  id: text("id").primaryKey(),
  licenseKey: text("license_key").notNull(),
  paddleTransactionId: text("paddle_transaction_id").notNull(),
  purchasedAt: text("purchased_at").notNull(),
  activatedAt: text("activated_at").notNull(),
  updatesValidUntil: text("updates_valid_until").notNull(),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
});

/**
 * Cache/storico delle generazioni AI "strutturate" per lezione (set di
 * esercizi, presentazione). A differenza di `lesson_ai_outputs` (1 riga per
 * lezione, sempre sovrascritta) qui si tiene una riga per tentativo: questo
 * permette sia lo storico dei tentativi falliti sia, tramite l'indice unico
 * parziale sotto, di riusare senza rigenerare l'ultima generazione riuscita
 * per la stessa combinazione lezione+tipo+contenuto sorgente (evita di
 * sprecare token quando gli appunti non sono cambiati).
 * `provider` non è persistito: l'app oggi supporta un solo provider
 * (inferenza locale via node-llama-cpp, electron/ai/localAiClient.ts), non
 * configurabile come opzione — non è un dato gestito, quindi non
 * introduciamo la colonna.
 */
export const lessonAiGenerations = sqliteTable(
  "lesson_ai_generations",
  {
    id: text("id").primaryKey(),
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["exercise_set", "presentation"] }).notNull(),
    // Hash deterministico del testo lezione normalizzato (electron/ai/contentHash.ts):
    // chiave di cache, non un segreto.
    sourceContentHash: text("source_content_hash").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    model: text("model").notNull(),
    status: text("status", { enum: ["ready", "failed"] }).notNull(),
    // Popolato solo se status = "ready" (JSON di ExerciseSet | Presentation).
    payloadJson: text("payload_json"),
    // Popolato solo se status = "failed": messaggio sanificato per l'utente,
    // mai il dump grezzo dell'errore del provider né segreti/API key.
    errorMessage: text("error_message"),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [
    index("lesson_ai_generations_lesson_id_idx").on(t.lessonId),
    // Indice unico parziale: al più una riga "ready" per lezione+tipo+hash
    // contenuto, così la ricerca della cache è O(1) via indice e non può
    // esistere più di una generazione valida duplicata per la stessa
    // combinazione. I tentativi falliti restano fuori dal vincolo e possono
    // accumularsi liberamente come storico.
    uniqueIndex("lesson_ai_generations_ready_cache_uidx")
      .on(t.lessonId, t.kind, t.sourceContentHash)
      .where(sql`${t.status} = 'ready'`),
  ],
);

/**
 * Contatore giornaliero di richieste AI cloud, per installazione (nessuna
 * tabella `users`: l'app è single-user locale, stesso pattern a riga
 * singola già usato da app_settings/license). usage_date in formato
 * YYYY-MM-DD, fuso Europe/Rome esplicito (vedi
 * electron/services/cloudUsageService.ts). Il limite condiviso
 * CLOUD_AI_DAILY_USAGE_LIMIT (default 35) = generalAiCount + dictationCount
 * SOLO: la futura funzionalità "Genera sessione studio" avrà un budget
 * per-job separato e non scriverà qui. Nessuna riga viene creata quando
 * aiProvider è "local".
 */
export const cloudAiUsageDaily = sqliteTable("cloud_ai_usage_daily", {
  usageDate: text("usage_date").primaryKey(),
  generalAiCount: integer("general_ai_count").notNull().default(0),
  dictationCount: integer("dictation_count").notNull().default(0),
  lastUsedAt: text("last_used_at"),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
});

/**
 * Job di generazione della "sessione studio" (libro PDF multi-agente per un
 * corso intero, electron/services/studySessionService.ts). Una riga per
 * tentativo (storico), con indice unico parziale che ammette al più una
 * generazione ATTIVA (queued|running) per corso — stesso pattern già usato
 * da `lesson_ai_generations` per il caching, qui usato per la mutua
 * esclusione invece che per la cache. `cloudCallsUsed` è un budget separato
 * dal contatore giornaliero condiviso `cloud_ai_usage_daily`: una sessione
 * studio può fare decine di chiamate in un solo job, non deve azzerare da
 * sola il budget di 35/giorno dell'AI generalista.
 */
export const studySessionGenerations = sqliteTable(
  "study_session_generations",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["queued", "running", "ready", "failed"] })
      .notNull()
      .default("queued"),
    currentStep: text("current_step", {
      enum: ["collect", "analyze", "design", "author", "review", "render"],
    }),
    progressPercentage: integer("progress_percentage").notNull().default(0),
    // Hash deterministico (stesso principio di electron/ai/contentHash.ts) di
    // tutto il contenuto sorgente aggregato: non usato per bloccare una
    // rigenerazione esplicita, solo persistito per debug/osservabilità.
    sourceContentVersionHash: text("source_content_version_hash").notNull(),
    sourceLessonsCount: integer("source_lessons_count").notNull().default(0),
    cloudCallsUsed: integer("cloud_calls_used").notNull().default(0),
    // Popolati solo se status = "ready".
    pdfPath: text("pdf_path"),
    pdfFileName: text("pdf_file_name"),
    pdfFileSize: integer("pdf_file_size"),
    // Popolato solo se status = "failed": messaggio sanificato, mai il dump
    // grezzo dell'errore del provider né segreti.
    errorMessage: text("error_message"),
    completedAt: text("completed_at"),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [
    index("study_session_generations_course_id_idx").on(t.courseId),
    uniqueIndex("study_session_generations_active_uidx")
      .on(t.courseId)
      .where(sql`${t.status} in ('queued','running')`),
  ],
);

/**
 * Artefatti/log per step della pipeline multi-agente: utile per debug e per
 * capire dove un job è fallito, senza dover rigenerare tutto. `outputJson`
 * contiene solo struttura didattica derivata dal contenuto del corso, mai
 * segreti. Più righe con lo stesso `stepName` sono normali (es. "analyze"
 * ha una riga per blocco di contenuto, "author"/"review" una per capitolo).
 */
export const studySessionGenerationSteps = sqliteTable(
  "study_session_generation_steps",
  {
    id: text("id").primaryKey(),
    generationId: text("generation_id")
      .notNull()
      .references(() => studySessionGenerations.id, { onDelete: "cascade" }),
    stepName: text("step_name", {
      enum: ["collect", "analyze", "design", "author", "review", "render"],
    }).notNull(),
    stepIndex: integer("step_index").notNull(),
    status: text("status", { enum: ["pending", "running", "done", "failed"] })
      .notNull()
      .default("pending"),
    outputJson: text("output_json"),
    errorMessage: text("error_message"),
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  },
  (t) => [index("study_session_generation_steps_generation_id_idx").on(t.generationId)],
);
