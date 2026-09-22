import { and, asc, desc, eq, isNull, lte, or } from "drizzle-orm";
import type { z } from "zod";
import type { Db } from "./client";
import { createId, nowIso } from "./id";
import {
  courses,
  lessons,
  materials,
  documentChunks,
  lessonAiOutputs,
  flashcards,
  courseAiOutputs,
  lessonAiGenerations,
  cloudAiUsageDaily,
  studySessionGenerations,
  studySessionGenerationSteps,
} from "./schema";
import type {
  CreateCourseInput,
  UpdateCourseInput,
  CreateLessonInput,
  UpdateLessonInput,
  SaveLessonNotesInput,
  CreateFlashcardInput,
  UpdateFlashcardInput,
  Difficulty,
  AiGenerationKind,
  ExerciseSet,
  Presentation,
  LessonAiGeneration,
} from "../shared/schemas";
import { exerciseSetSchema, presentationSchema, lessonAiGenerationSchema } from "../shared/schemas";

type DifficultyGrade = "easy" | "medium" | "hard";

// ---------- Courses ----------
export const CoursesRepo = {
  list(db: Db) {
    return db.select().from(courses).orderBy(desc(courses.updatedAt)).all();
  },
  get(db: Db, id: string) {
    return db.select().from(courses).where(eq(courses.id, id)).get() ?? null;
  },
  create(db: Db, input: CreateCourseInput) {
    const row = {
      id: createId(),
      title: input.title,
      code: input.code ?? null,
      cfu: input.cfu,
      examDate: input.examDate ?? null,
      introduction: input.introduction ?? null,
      objectives: input.objectives ?? null,
      targetLessons: input.targetLessons ?? null,
      status: input.status ?? ("active" as const),
      color: input.color ?? null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.insert(courses).values(row).run();
    return row;
  },
  update(db: Db, input: UpdateCourseInput) {
    const { id, ...patch } = input;
    db.update(courses)
      .set({ ...patch, updatedAt: nowIso() })
      .where(eq(courses.id, id))
      .run();
    return CoursesRepo.get(db, id);
  },
  delete(db: Db, id: string) {
    db.delete(courses).where(eq(courses.id, id)).run();
  },
};

// ---------- Lessons ----------
export const LessonsRepo = {
  listByCourse(db: Db, courseId: string) {
    return db
      .select()
      .from(lessons)
      .where(eq(lessons.courseId, courseId))
      .orderBy(asc(lessons.lessonNumber))
      .all();
  },
  get(db: Db, id: string) {
    return db.select().from(lessons).where(eq(lessons.id, id)).get() ?? null;
  },
  create(db: Db, input: CreateLessonInput) {
    const row = {
      id: createId(),
      courseId: input.courseId,
      lessonNumber: input.lessonNumber,
      title: input.title,
      lessonDate: input.lessonDate ?? null,
      status: "draft" as const,
      notesJson: null,
      notesPlainText: null,
      aiStatus: "idle" as const,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.insert(lessons).values(row).run();
    return row;
  },
  update(db: Db, input: UpdateLessonInput) {
    const { id, ...patch } = input;
    db.update(lessons)
      .set({ ...patch, updatedAt: nowIso() })
      .where(eq(lessons.id, id))
      .run();
    return LessonsRepo.get(db, id);
  },
  saveNotes(db: Db, input: SaveLessonNotesInput) {
    db.update(lessons)
      .set({
        notesJson: input.notesJson,
        notesPlainText: input.notesPlainText,
        updatedAt: nowIso(),
      })
      .where(eq(lessons.id, input.id))
      .run();
    return LessonsRepo.get(db, input.id);
  },
  setAiStatus(
    db: Db,
    id: string,
    aiStatus: "idle" | "queued" | "processing" | "completed" | "failed",
  ) {
    db.update(lessons).set({ aiStatus, updatedAt: nowIso() }).where(eq(lessons.id, id)).run();
  },
  delete(db: Db, id: string) {
    db.delete(lessons).where(eq(lessons.id, id)).run();
  },
  countByCourse(db: Db, courseId: string) {
    const all = LessonsRepo.listByCourse(db, courseId);
    return {
      total: all.length,
      completed: all.filter((l) => l.status === "completed").length,
    };
  },
};

// ---------- Materials ----------
export const MaterialsRepo = {
  listByCourse(db: Db, courseId: string) {
    return db
      .select()
      .from(materials)
      .where(eq(materials.courseId, courseId))
      .orderBy(desc(materials.createdAt))
      .all();
  },
  get(db: Db, id: string) {
    return db.select().from(materials).where(eq(materials.id, id)).get() ?? null;
  },
  create(
    db: Db,
    row: {
      courseId: string;
      lessonId: string | null;
      title: string;
      originalFilename: string;
      mimeType: string;
      filePath: string;
      fileSize: number;
      materialType: "lecture" | "notes" | "exercise" | "deepening" | "other";
    },
  ) {
    const record = {
      id: createId(),
      ...row,
      extractedText: null,
      extractionStatus: "pending" as const,
      createdAt: nowIso(),
    };
    db.insert(materials).values(record).run();
    return record;
  },
  setExtraction(
    db: Db,
    id: string,
    extractedText: string | null,
    status: "pending" | "done" | "unsupported" | "failed",
  ) {
    db.update(materials)
      .set({ extractedText, extractionStatus: status })
      .where(eq(materials.id, id))
      .run();
  },
  delete(db: Db, id: string) {
    db.delete(materials).where(eq(materials.id, id)).run();
  },
};

// ---------- Document chunks (RAG) ----------
export const DocumentChunksRepo = {
  insertMany(
    db: Db,
    chunks: Array<{
      courseId: string;
      lessonId: string | null;
      materialId: string | null;
      content: string;
      sourceLabel: string;
      chunkIndex: number;
      embedding: string | null;
    }>,
  ) {
    if (chunks.length === 0) return;
    db.insert(documentChunks)
      .values(chunks.map((c) => ({ id: createId(), ...c, createdAt: nowIso() })))
      .run();
  },
  listByCourse(db: Db, courseId: string) {
    return db.select().from(documentChunks).where(eq(documentChunks.courseId, courseId)).all();
  },
  deleteByMaterial(db: Db, materialId: string) {
    db.delete(documentChunks).where(eq(documentChunks.materialId, materialId)).run();
  },
};

// ---------- Lesson AI outputs ----------
export const LessonAiOutputsRepo = {
  getByLesson(db: Db, lessonId: string) {
    return (
      db.select().from(lessonAiOutputs).where(eq(lessonAiOutputs.lessonId, lessonId)).get() ?? null
    );
  },
  upsert(
    db: Db,
    row: {
      lessonId: string;
      summaryMarkdown: string;
      keyPointsJson: string;
      studyOutlineJson: string;
      mermaidDiagram: string;
      selfCheckQuestionsJson: string;
      model: string;
      promptVersion: string;
    },
  ) {
    const existing = LessonAiOutputsRepo.getByLesson(db, row.lessonId);
    if (existing) {
      db.update(lessonAiOutputs)
        .set({ ...row, updatedAt: nowIso() })
        .where(eq(lessonAiOutputs.id, existing.id))
        .run();
      return LessonAiOutputsRepo.getByLesson(db, row.lessonId);
    }
    const record = { id: createId(), ...row, createdAt: nowIso(), updatedAt: nowIso() };
    db.insert(lessonAiOutputs).values(record).run();
    return record;
  },
};

// ---------- Course AI outputs ----------
export const CourseAiOutputsRepo = {
  getLatest(db: Db, courseId: string) {
    return (
      db
        .select()
        .from(courseAiOutputs)
        .where(eq(courseAiOutputs.courseId, courseId))
        .orderBy(desc(courseAiOutputs.createdAt))
        .get() ?? null
    );
  },
  create(
    db: Db,
    row: {
      courseId: string;
      comprehensiveSummaryMarkdown: string;
      courseOutlineJson: string;
      mermaidDiagram: string;
      suggestedStudyPlanJson: string;
      generatedFromLessonCount: number;
    },
  ) {
    const record = { id: createId(), ...row, createdAt: nowIso(), updatedAt: nowIso() };
    db.insert(courseAiOutputs).values(record).run();
    return record;
  },
};

// ---------- Flashcards + SRS ----------
const SRS_INTERVAL_DAYS: Record<DifficultyGrade, number> = {
  easy: 7,
  medium: 3,
  hard: 1,
};

export function computeNextReviewAt(grade: DifficultyGrade, from = new Date()): string {
  const days = SRS_INTERVAL_DAYS[grade];
  const next = new Date(from.getTime());
  next.setDate(next.getDate() + days);
  return next.toISOString();
}

export const FlashcardsRepo = {
  listByCourse(db: Db, courseId: string) {
    return db
      .select()
      .from(flashcards)
      .where(eq(flashcards.courseId, courseId))
      .orderBy(desc(flashcards.createdAt))
      .all();
  },
  dueToday(db: Db) {
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    return db
      .select()
      .from(flashcards)
      .where(
        or(isNull(flashcards.nextReviewAt), lte(flashcards.nextReviewAt, todayEnd.toISOString())),
      )
      .all();
  },
  create(db: Db, input: CreateFlashcardInput) {
    const row = {
      id: createId(),
      courseId: input.courseId,
      lessonId: input.lessonId ?? null,
      front: input.front,
      back: input.back,
      tagsJson: JSON.stringify(input.tags ?? []),
      difficulty: input.difficulty ?? ("medium" as Difficulty),
      source: input.source ?? ("manual" as const),
      nextReviewAt: null,
      reviewCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.insert(flashcards).values(row).run();
    return row;
  },
  insertAiBatch(
    db: Db,
    courseId: string,
    lessonId: string,
    cards: Array<{ front: string; back: string; tags: string[]; difficulty: DifficultyGrade }>,
  ) {
    if (cards.length === 0) return;
    const rows = cards.map((c) => ({
      id: createId(),
      courseId,
      lessonId,
      front: c.front,
      back: c.back,
      tagsJson: JSON.stringify(c.tags),
      difficulty: c.difficulty,
      source: "ai" as const,
      nextReviewAt: null,
      reviewCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }));
    db.insert(flashcards).values(rows).run();
  },
  update(db: Db, input: UpdateFlashcardInput) {
    const { id, tags, ...patch } = input;
    db.update(flashcards)
      .set({
        ...patch,
        ...(tags ? { tagsJson: JSON.stringify(tags) } : {}),
        updatedAt: nowIso(),
      })
      .where(eq(flashcards.id, id))
      .run();
    return db.select().from(flashcards).where(eq(flashcards.id, id)).get() ?? null;
  },
  duplicate(db: Db, id: string) {
    const original = db.select().from(flashcards).where(eq(flashcards.id, id)).get();
    if (!original) return null;
    const copy = {
      ...original,
      id: createId(),
      nextReviewAt: null,
      reviewCount: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.insert(flashcards).values(copy).run();
    return copy;
  },
  delete(db: Db, id: string) {
    db.delete(flashcards).where(eq(flashcards.id, id)).run();
  },
  review(db: Db, id: string, grade: DifficultyGrade) {
    const current = db.select().from(flashcards).where(eq(flashcards.id, id)).get();
    if (!current) return null;
    const nextReviewAt = computeNextReviewAt(grade);
    db.update(flashcards)
      .set({
        difficulty: grade,
        nextReviewAt,
        reviewCount: current.reviewCount + 1,
        updatedAt: nowIso(),
      })
      .where(eq(flashcards.id, id))
      .run();
    return db.select().from(flashcards).where(eq(flashcards.id, id)).get() ?? null;
  },
};

// ---------- Lesson AI generations (esercizi/presentazione: cache + storico) ----------

export interface SaveReadyGenerationInput<TPayload> {
  status: "ready";
  lessonId: string;
  sourceContentHash: string;
  model: string;
  payload: TPayload;
}

export interface SaveFailedGenerationInput {
  status: "failed";
  lessonId: string;
  sourceContentHash: string;
  model: string;
  schemaVersion: number;
  /** Messaggio sanificato per l'utente: mai il dump grezzo del provider né segreti/API key. */
  errorMessage: string;
}

export interface CachedGeneration<TPayload> {
  row: LessonAiGeneration;
  payload: TPayload;
}

type GenerationPayloadForKind<K extends AiGenerationKind> = K extends "exercise_set"
  ? ExerciseSet
  : Presentation;

/**
 * Inserisce una riga di generazione (successo o fallimento). Privata: le API
 * pubbliche sono `saveExerciseSet`/`savePresentation`, che passano ciascuna
 * il proprio schema Zod così il chiamante non deve mai indicare `kind` a
 * mano né rischiare di abbinare payload e schema sbagliati.
 * Ri-valida sempre il payload prima di serializzarlo: nessun contenuto che
 * non rispetti il contratto condiviso può finire nel database.
 */
function insertGeneration<TPayload extends { version: number }>(
  db: Db,
  kind: AiGenerationKind,
  payloadSchema: z.ZodType<TPayload>,
  input: SaveReadyGenerationInput<TPayload> | SaveFailedGenerationInput,
): LessonAiGeneration {
  const base = {
    id: createId(),
    lessonId: input.lessonId,
    kind,
    sourceContentHash: input.sourceContentHash,
    model: input.model,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  const row: LessonAiGeneration =
    input.status === "ready"
      ? {
          ...base,
          status: "ready",
          schemaVersion: payloadSchema.parse(input.payload).version,
          payloadJson: JSON.stringify(input.payload),
          errorMessage: null,
        }
      : {
          ...base,
          status: "failed",
          schemaVersion: input.schemaVersion,
          payloadJson: null,
          errorMessage: input.errorMessage,
        };

  db.insert(lessonAiGenerations).values(row).run();
  return row;
}

export const LessonAiGenerationsRepo = {
  saveExerciseSet(
    db: Db,
    input: SaveReadyGenerationInput<ExerciseSet> | SaveFailedGenerationInput,
  ) {
    return insertGeneration(db, "exercise_set", exerciseSetSchema, input);
  },

  savePresentation(
    db: Db,
    input: SaveReadyGenerationInput<Presentation> | SaveFailedGenerationInput,
  ) {
    return insertGeneration(db, "presentation", presentationSchema, input);
  },

  /**
   * Ultima generazione "ready" per lezione+tipo+hash contenuto sorgente:
   * se presente e valida, il chiamante evita di richiamare il provider AI.
   * Un record con payload legacy/corrotto (JSON non valido o non conforme
   * allo schema) viene trattato come cache-miss (torna null, non lancia)
   * così un dato sporco nel DB non manda mai in crash l'app.
   */
  findCachedGeneration<K extends AiGenerationKind>(
    db: Db,
    params: { lessonId: string; kind: K; sourceContentHash: string },
  ): CachedGeneration<GenerationPayloadForKind<K>> | null {
    const row = db
      .select()
      .from(lessonAiGenerations)
      .where(
        and(
          eq(lessonAiGenerations.lessonId, params.lessonId),
          eq(lessonAiGenerations.kind, params.kind),
          eq(lessonAiGenerations.sourceContentHash, params.sourceContentHash),
          eq(lessonAiGenerations.status, "ready"),
        ),
      )
      .orderBy(desc(lessonAiGenerations.createdAt))
      .get();

    if (!row) return null;

    let parsedJson: unknown;
    try {
      parsedJson = row.payloadJson === null ? null : JSON.parse(row.payloadJson);
    } catch {
      console.warn(
        `[LessonAiGenerationsRepo] payloadJson non è JSON valido per la generazione ${row.id}`,
      );
      return null;
    }

    const payloadSchema = params.kind === "exercise_set" ? exerciseSetSchema : presentationSchema;
    const parsed = payloadSchema.safeParse(parsedJson);
    if (!parsed.success) {
      console.warn(
        `[LessonAiGenerationsRepo] payload non conforme allo schema per la generazione ${row.id}`,
      );
      return null;
    }

    // Il ternario sopra sceglie lo schema a runtime in base a params.kind, quindi
    // per TypeScript `parsed.data` resta tipato come ExerciseSet | Presentation:
    // il tipo generico K non può essere "ristretto" da un controllo a runtime.
    // Il cast è sicuro perché payloadSchema è stato scelto proprio da params.kind.
    return { row, payload: parsed.data } as CachedGeneration<GenerationPayloadForKind<K>>;
  },

  /**
   * Storico delle generazioni per una lezione (facoltativamente filtrato per
   * tipo), più recenti prima. Ogni riga è validata con `lessonAiGenerationSchema`
   * prima di essere restituita; righe non conformi vengono scartate con un
   * warning invece di rompere l'intera lista.
   */
  listGenerationsForLesson(
    db: Db,
    lessonId: string,
    kind?: AiGenerationKind,
  ): LessonAiGeneration[] {
    const rows = db
      .select()
      .from(lessonAiGenerations)
      .where(
        kind
          ? and(eq(lessonAiGenerations.lessonId, lessonId), eq(lessonAiGenerations.kind, kind))
          : eq(lessonAiGenerations.lessonId, lessonId),
      )
      .orderBy(desc(lessonAiGenerations.createdAt))
      .all();

    const validRows: LessonAiGeneration[] = [];
    for (const row of rows) {
      const parsed = lessonAiGenerationSchema.safeParse(row);
      if (parsed.success) {
        validRows.push(parsed.data);
      } else {
        console.warn(
          `[LessonAiGenerationsRepo] riga generazione scartata (shape non valida): ${row.id}`,
        );
      }
    }
    return validRows;
  },
};

// ---------- Cloud AI usage (contatore giornaliero, per installazione) ----------
export const CloudUsageRepo = {
  getByDate(db: Db, usageDate: string) {
    return db.select().from(cloudAiUsageDaily).where(eq(cloudAiUsageDaily.usageDate, usageDate)).get() ?? null;
  },

  /**
   * Verifica il limite e incrementa in un'UNICA transazione sincrona
   * (better-sqlite3/drizzle: la callback di db.transaction() è sincrona,
   * stesso pattern già usato in electron/ai/studyPack.ts) — questo rende
   * "leggi il conteggio" e "scrivi l'incremento" atomici anche con più
   * fetch cloud avviate quasi in contemporanea lato Node: non possono
   * interfogliarsi a metà tra lettura e scrittura. Ritorna accepted:false
   * SENZA scrivere nulla se il totale ha già raggiunto il limite.
   */
  incrementIfUnderLimit(
    db: Db,
    args: { usageDate: string; category: "general_ai" | "dictation"; limit: number },
  ): { accepted: boolean; used: number } {
    return db.transaction((tx) => {
      const row = tx.select().from(cloudAiUsageDaily).where(eq(cloudAiUsageDaily.usageDate, args.usageDate)).get();
      const total = (row?.generalAiCount ?? 0) + (row?.dictationCount ?? 0);
      if (total >= args.limit) return { accepted: false, used: total };

      const now = nowIso();
      const general = (row?.generalAiCount ?? 0) + (args.category === "general_ai" ? 1 : 0);
      const dictation = (row?.dictationCount ?? 0) + (args.category === "dictation" ? 1 : 0);
      if (!row) {
        tx.insert(cloudAiUsageDaily)
          .values({
            usageDate: args.usageDate,
            generalAiCount: general,
            dictationCount: dictation,
            lastUsedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      } else {
        tx.update(cloudAiUsageDaily)
          .set({ generalAiCount: general, dictationCount: dictation, lastUsedAt: now, updatedAt: now })
          .where(eq(cloudAiUsageDaily.usageDate, args.usageDate))
          .run();
      }
      return { accepted: true, used: total + 1 };
    });
  },
};

// ---------- Study session generations (job "Genera sessione studio") ----------
export type StudySessionStep = "collect" | "analyze" | "design" | "author" | "review" | "render";

export const StudySessionGenerationsRepo = {
  get(db: Db, id: string) {
    return db.select().from(studySessionGenerations).where(eq(studySessionGenerations.id, id)).get() ?? null;
  },

  /** Job attivo (queued|running) per il corso, se esiste — al più uno per il vincolo DB. */
  getActiveForCourse(db: Db, courseId: string) {
    return (
      db
        .select()
        .from(studySessionGenerations)
        .where(
          and(
            eq(studySessionGenerations.courseId, courseId),
            or(eq(studySessionGenerations.status, "queued"), eq(studySessionGenerations.status, "running")),
          ),
        )
        .get() ?? null
    );
  },

  /** Ultimo tentativo per il corso (qualunque stato): quello che la UI mostra di default. */
  getLatestForCourse(db: Db, courseId: string) {
    return (
      db
        .select()
        .from(studySessionGenerations)
        .where(eq(studySessionGenerations.courseId, courseId))
        .orderBy(desc(studySessionGenerations.createdAt))
        .limit(1)
        .get() ?? null
    );
  },

  /** Ultima generazione completata con successo: è quella "attiva" per il download, indipendentemente da tentativi falliti successivi. */
  getLatestReadyForCourse(db: Db, courseId: string) {
    return (
      db
        .select()
        .from(studySessionGenerations)
        .where(and(eq(studySessionGenerations.courseId, courseId), eq(studySessionGenerations.status, "ready")))
        .orderBy(desc(studySessionGenerations.createdAt))
        .limit(1)
        .get() ?? null
    );
  },

  /**
   * Crea la riga "queued" per un nuovo tentativo. L'indice unico parziale su
   * (courseId) WHERE status IN ('queued','running') garantisce a livello DB
   * che non possano coesistere due job attivi per lo stesso corso: un
   * secondo insert concorrente fallisce con violazione di vincolo invece di
   * avviare due generazioni in parallelo (protezione da doppio click/doppia
   * richiesta, anche cross-processo se mai ce ne fosse più di uno).
   */
  create(db: Db, input: { courseId: string; sourceContentVersionHash: string; sourceLessonsCount: number }) {
    const now = nowIso();
    const row = {
      id: createId(),
      courseId: input.courseId,
      status: "queued" as const,
      currentStep: null,
      progressPercentage: 0,
      sourceContentVersionHash: input.sourceContentVersionHash,
      sourceLessonsCount: input.sourceLessonsCount,
      cloudCallsUsed: 0,
      pdfPath: null,
      pdfFileName: null,
      pdfFileSize: null,
      errorMessage: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(studySessionGenerations).values(row).run();
    return row;
  },

  updateProgress(
    db: Db,
    id: string,
    patch: { status?: "queued" | "running"; currentStep: StudySessionStep; progressPercentage: number; cloudCallsUsed: number },
  ) {
    db.update(studySessionGenerations)
      .set({
        status: patch.status ?? "running",
        currentStep: patch.currentStep,
        progressPercentage: patch.progressPercentage,
        cloudCallsUsed: patch.cloudCallsUsed,
        updatedAt: nowIso(),
      })
      .where(eq(studySessionGenerations.id, id))
      .run();
  },

  markReady(db: Db, id: string, output: { pdfPath: string; pdfFileName: string; pdfFileSize: number }) {
    const now = nowIso();
    db.update(studySessionGenerations)
      .set({
        status: "ready",
        currentStep: "render",
        progressPercentage: 100,
        pdfPath: output.pdfPath,
        pdfFileName: output.pdfFileName,
        pdfFileSize: output.pdfFileSize,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(studySessionGenerations.id, id))
      .run();
  },

  markFailed(db: Db, id: string, errorMessage: string) {
    const now = nowIso();
    db.update(studySessionGenerations)
      .set({ status: "failed", errorMessage, completedAt: now, updatedAt: now })
      .where(eq(studySessionGenerations.id, id))
      .run();
  },

  /**
   * Crash recovery: da chiamare una sola volta all'avvio dell'app (dopo le
   * migrazioni), PRIMA di registrare gli IPC handler. Se l'app è stata
   * chiusa/è crashata a metà di un job, la riga resta "queued"/"running" per
   * sempre (il runner vive solo nel processo che l'ha avviato, niente
   * persistenza dello stato di esecuzione oltre alla riga stessa): qui la si
   * marca "failed" così lo slot torna libero (l'indice unico parziale
   * altrimenti impedirebbe per sempre una nuova generazione per quel corso)
   * e l'utente vede un esito chiaro invece di un job bloccato "in corso" a
   * tempo indeterminato.
   */
  failAllStaleActive(db: Db, message: string): number {
    const now = nowIso();
    const result = db
      .update(studySessionGenerations)
      .set({ status: "failed", errorMessage: message, completedAt: now, updatedAt: now })
      .where(or(eq(studySessionGenerations.status, "queued"), eq(studySessionGenerations.status, "running")))
      .run();
    return result.changes;
  },
};

export const StudySessionGenerationStepsRepo = {
  add(
    db: Db,
    input: {
      generationId: string;
      stepName: StudySessionStep;
      stepIndex: number;
      status: "done" | "failed";
      outputJson?: string | null;
      errorMessage?: string | null;
    },
  ) {
    const now = nowIso();
    db.insert(studySessionGenerationSteps)
      .values({
        id: createId(),
        generationId: input.generationId,
        stepName: input.stepName,
        stepIndex: input.stepIndex,
        status: input.status,
        outputJson: input.outputJson ?? null,
        errorMessage: input.errorMessage ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  },

  listByGeneration(db: Db, generationId: string) {
    return db
      .select()
      .from(studySessionGenerationSteps)
      .where(eq(studySessionGenerationSteps.generationId, generationId))
      .orderBy(asc(studySessionGenerationSteps.stepIndex))
      .all();
  },
};
