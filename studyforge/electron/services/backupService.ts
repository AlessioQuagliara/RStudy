import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  courses,
  lessons,
  materials,
  flashcards,
  lessonAiOutputs,
  courseAiOutputs,
} from "../db/schema";
import { type BackupData } from "../shared/schemas";

/**
 * Esporta/importa i dati applicativi (mai la API key, che resta nel Keychain).
 * L'import è additivo con upsert per id: pensato per ripristinare un backup
 * sullo stesso Mac o per trasferire i dati su un'altra macchina.
 */
export function buildBackup(db: Db): BackupData {
  const allCourses = db.select().from(courses).all();
  const allLessons = db.select().from(lessons).all();
  const allMaterials = db.select().from(materials).all();
  const allFlashcards = db.select().from(flashcards).all();
  const allLessonAi = db.select().from(lessonAiOutputs).all();
  const allCourseAi = db.select().from(courseAiOutputs).all();

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    courses: allCourses,
    lessons: allLessons,
    materials: allMaterials.map(({ filePath: _filePath, ...rest }) => rest),
    flashcards: allFlashcards,
    lessonAiOutputs: allLessonAi,
    courseAiOutputs: allCourseAi,
  };
}

export function restoreBackup(db: Db, backup: BackupData): void {
  db.transaction((tx) => {
    for (const course of backup.courses) {
      tx.insert(courses)
        .values(course)
        .onConflictDoUpdate({ target: courses.id, set: course })
        .run();
    }
    for (const lesson of backup.lessons) {
      tx.insert(lessons)
        .values(lesson)
        .onConflictDoUpdate({ target: lessons.id, set: lesson })
        .run();
    }
    for (const material of backup.materials) {
      const existing = tx.select().from(materials).where(eq(materials.id, material.id)).get();
      if (existing) continue; // il file fisico potrebbe non esistere: non sovrascriviamo filePath
    }
    for (const card of backup.flashcards) {
      tx.insert(flashcards)
        .values(card)
        .onConflictDoUpdate({ target: flashcards.id, set: card })
        .run();
    }
    for (const output of backup.lessonAiOutputs) {
      tx.insert(lessonAiOutputs)
        .values(output)
        .onConflictDoUpdate({ target: lessonAiOutputs.id, set: output })
        .run();
    }
    for (const output of backup.courseAiOutputs) {
      tx.insert(courseAiOutputs)
        .values(output)
        .onConflictDoUpdate({ target: courseAiOutputs.id, set: output })
        .run();
    }
  });
}
