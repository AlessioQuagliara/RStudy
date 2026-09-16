import type { Db } from "../db/client";
import { CoursesRepo, LessonsRepo, LessonAiOutputsRepo, FlashcardsRepo, DocumentChunksRepo } from "../db/repositories";
import type { ChatJsonClient } from "./openAiCompatibleStudyGenerator";
import { LESSON_STUDY_PACK_SYSTEM_PROMPT, buildLessonStudyPackUserPrompt, PROMPT_VERSION } from "./prompts";
import { lessonStudyPackSchema, parseModelJson } from "./schemas";

export interface GenerateLessonStudyPackResult {
  lessonId: string;
  summaryMarkdown: string;
  mermaidDiagram: string;
}

/**
 * Genera lo study pack AI per una lezione: riepilogo, punti salienti, schema,
 * diagramma Mermaid, flashcard e domande di autoverifica. Salva tutto (output
 * AI + flashcard) in un'unica transazione DB, con prompt_version tracciato.
 */
export async function generateLessonStudyPack(
  db: Db,
  client: ChatJsonClient,
  model: string,
  lessonId: string,
): Promise<GenerateLessonStudyPackResult> {
  const lesson = LessonsRepo.get(db, lessonId);
  if (!lesson) throw new Error("Lezione non trovata");
  const course = CoursesRepo.get(db, lesson.courseId);
  if (!course) throw new Error("Corso non trovato");

  LessonsRepo.setAiStatus(db, lessonId, "processing");

  try {
    const relatedChunks = DocumentChunksRepo.listByCourse(db, course.id)
      .filter((c) => c.lessonId === lessonId || c.lessonId === null)
      .slice(0, 8)
      .map((c) => c.content)
      .join("\n\n");

    const userPrompt = buildLessonStudyPackUserPrompt({
      courseTitle: course.title,
      courseIntroduction: course.introduction,
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.title,
      notesPlainText: lesson.notesPlainText ?? "",
      ragContext: relatedChunks || undefined,
    });

    const raw = await client.chatJSON(
      [
        { role: "system", content: LESSON_STUDY_PACK_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      lessonStudyPackSchema,
    );

    const pack = parseModelJson(raw, lessonStudyPackSchema);

    db.transaction((tx) => {
      LessonAiOutputsRepo.upsert(tx, {
        lessonId,
        summaryMarkdown: pack.summary_markdown,
        keyPointsJson: JSON.stringify(pack.key_points),
        studyOutlineJson: JSON.stringify(pack.study_outline),
        mermaidDiagram: pack.mermaid_diagram,
        selfCheckQuestionsJson: JSON.stringify(pack.self_check_questions),
        model,
        promptVersion: PROMPT_VERSION,
      });
      FlashcardsRepo.insertAiBatch(
        tx,
        course.id,
        lessonId,
        pack.flashcards.map((f) => ({ ...f, tags: f.tags ?? [] })),
      );
      LessonsRepo.setAiStatus(tx, lessonId, "completed");
    });

    return { lessonId, summaryMarkdown: pack.summary_markdown, mermaidDiagram: pack.mermaid_diagram };
  } catch (error) {
    LessonsRepo.setAiStatus(db, lessonId, "failed");
    throw error;
  }
}
