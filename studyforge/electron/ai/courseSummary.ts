import type { Db } from "../db/client";
import { CoursesRepo, LessonsRepo, LessonAiOutputsRepo, CourseAiOutputsRepo, DocumentChunksRepo } from "../db/repositories";
import type { ChatJsonClient } from "./openAiCompatibleStudyGenerator";
import { COURSE_SUMMARY_SYSTEM_PROMPT, buildCourseSummaryUserPrompt } from "./prompts";
import { courseSummaryResponseSchema, parseModelJson } from "./schemas";

/**
 * Genera il riassunto complessivo del corso usando tutte le lezioni
 * completate (e i loro riepiloghi AI quando presenti), le info del corso e
 * il materiale RAG più rilevante. Il piano di studio è "a blocchi" quando
 * manca la data d'esame: non vengono mai calcolate date assolute inventate.
 */
export async function generateCourseSummary(db: Db, client: ChatJsonClient, courseId: string) {
  const course = CoursesRepo.get(db, courseId);
  if (!course) throw new Error("Corso non trovato");

  const allLessons = LessonsRepo.listByCourse(db, courseId);
  const completed = allLessons.filter((l) => l.status === "completed");
  const missingCount = course.targetLessons
    ? Math.max(course.targetLessons - completed.length, 0)
    : Math.max(allLessons.length - completed.length, 0);

  const completedWithSummary = completed.map((l) => {
    const output = LessonAiOutputsRepo.getByLesson(db, l.id);
    return { number: l.lessonNumber, title: l.title, summary: output?.summaryMarkdown ?? null };
  });

  const ragChunks = DocumentChunksRepo.listByCourse(db, courseId)
    .slice(0, 12)
    .map((c) => c.content)
    .join("\n\n");

  const userPrompt = buildCourseSummaryUserPrompt({
    courseTitle: course.title,
    cfu: course.cfu,
    examDate: course.examDate,
    introduction: course.introduction,
    objectives: course.objectives,
    completedLessons: completedWithSummary,
    missingLessonsCount: missingCount,
    ragContext: ragChunks || undefined,
  });

  const raw = await client.chatJSON(
    [
      { role: "system", content: COURSE_SUMMARY_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    courseSummaryResponseSchema,
  );

  const result = parseModelJson(raw, courseSummaryResponseSchema);

  return CourseAiOutputsRepo.create(db, {
    courseId,
    comprehensiveSummaryMarkdown: result.comprehensive_summary_markdown,
    courseOutlineJson: JSON.stringify(result.course_outline),
    mermaidDiagram: result.mermaid_diagram,
    suggestedStudyPlanJson: JSON.stringify(result.suggested_study_plan),
    generatedFromLessonCount: completed.length,
  });
}
