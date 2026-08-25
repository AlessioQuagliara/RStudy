import { asc, desc, eq, isNull, lte, or } from "drizzle-orm";
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
} from "../shared/schemas";

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
  setAiStatus(db: Db, id: string, aiStatus: "idle" | "queued" | "processing" | "completed" | "failed") {
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
      db.select().from(lessonAiOutputs).where(eq(lessonAiOutputs.lessonId, lessonId)).get() ??
      null
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
      .where(or(isNull(flashcards.nextReviewAt), lte(flashcards.nextReviewAt, todayEnd.toISOString())))
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
