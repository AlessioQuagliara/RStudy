import { createHash } from "node:crypto";
import type { Db } from "../../db/client";
import { CoursesRepo, LessonsRepo, LessonAiOutputsRepo, MaterialsRepo } from "../../db/repositories";
import { normalizeLessonContent } from "../contentHash";
import type { Course } from "../../shared/schemas";

export interface LessonContentBlock {
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  /** Testo migliore disponibile per la lezione: riepilogo AI se presente, altrimenti appunti grezzi. */
  text: string;
}

export interface CollectedCourseContent {
  course: Course;
  /** Solo lezioni con contenuto non vuoto (riepilogo AI o appunti): quelle senza testo non sono "elaborabili". */
  lessons: LessonContentBlock[];
  /** Testo estratto da materiali importati (status "done"), capped per non esplodere il prompt: fonte secondaria, opzionale. */
  materialsText: string[];
  /** Hash deterministico di tutto il contenuto sorgente aggregato: solo per osservabilità/debug (electron/db/schema.ts::studySessionGenerations.sourceContentVersionHash), non usato per bloccare rigenerazioni. */
  contentHash: string;
}

const MAX_MATERIALS_SNIPPETS = 20;
const MAX_MATERIAL_SNIPPET_CHARS = 4000;

/**
 * Raccoglie tutto il contenuto elaborabile di un corso per "Genera sessione
 * studio". Ritorna `null` se il corso non esiste o non ha alcuna lezione con
 * contenuto utile (nessun riepilogo AI né appunti): in quel caso il pulsante
 * "Genera sessione studio" non deve nemmeno permettere di partire (vedi
 * electron/services/studySessionService.ts).
 */
export function collectCourseContent(db: Db, courseId: string): CollectedCourseContent | null {
  const course = CoursesRepo.get(db, courseId);
  if (!course) return null;

  const allLessons = LessonsRepo.listByCourse(db, courseId);
  const lessons: LessonContentBlock[] = [];
  for (const lesson of allLessons) {
    const aiOutput = LessonAiOutputsRepo.getByLesson(db, lesson.id);
    const text = (aiOutput?.summaryMarkdown ?? lesson.notesPlainText ?? "").trim();
    if (!text) continue;
    lessons.push({ lessonId: lesson.id, lessonNumber: lesson.lessonNumber, lessonTitle: lesson.title, text });
  }

  if (lessons.length === 0) return null;

  const materialsText = MaterialsRepo.listByCourse(db, courseId)
    .filter((m) => m.extractionStatus === "done" && m.extractedText)
    .slice(0, MAX_MATERIALS_SNIPPETS)
    .map((m) => (m.extractedText as string).slice(0, MAX_MATERIAL_SNIPPET_CHARS));

  const combined = [
    course.title,
    course.introduction ?? "",
    course.objectives ?? "",
    ...lessons.map((l) => `Lezione ${l.lessonNumber}: ${l.lessonTitle}\n${l.text}`),
    ...materialsText,
  ].join("\n\n---\n\n");
  const contentHash = createHash("sha256").update(normalizeLessonContent(combined), "utf8").digest("hex");

  return { course, lessons, materialsText, contentHash };
}
