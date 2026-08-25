import { Sparkles, AlertCircle } from "lucide-react";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { useCourseSummary, useGenerateCourseSummary } from "@/features/courses/aiApi";
import { useLessons } from "@/features/lessons/api";
import { toast } from "@/lib/toastStore";
import type { StudyOutlineTopic } from "@shared/schemas";

export function SummaryTab({ courseId }: { courseId: string }) {
  const { data: summary, isLoading } = useCourseSummary(courseId);
  const { data: lessons = [] } = useLessons(courseId);
  const generate = useGenerateCourseSummary(courseId);

  const completedCount = lessons.filter((l) => l.status === "completed").length;

  const handleGenerate = async () => {
    try {
      await generate.mutateAsync();
      toast.success("Riassunto del corso generato");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generazione fallita");
    }
  };

  const outline: StudyOutlineTopic[] = summary ? JSON.parse(summary.courseOutlineJson) : [];
  const studyPlan: Array<{ block: string; focus: string; lessons_covered: string[] }> = summary
    ? JSON.parse(summary.suggestedStudyPlanJson)
    : [];

  return (
    <div className="col-span-12 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-base-content/60 text-sm">
          Basato su {completedCount} lezione/i completata/e
          {summary && ` · ultimo riassunto generato con ${summary.generatedFromLessonCount} lezioni`}
        </p>
        <button type="button" className="btn btn-primary btn-sm" onClick={handleGenerate} disabled={generate.isPending || completedCount === 0}>
          {generate.isPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Sparkles className="size-4" />
          )}
          Genera riassunto corso
        </button>
      </div>

      {completedCount === 0 && (
        <div className="alert alert-info text-sm">
          <AlertCircle className="size-4" />
          <span>Completa almeno una lezione per generare il riassunto del corso.</span>
        </div>
      )}

      {isLoading && <div className="skeleton h-24 w-full" />}

      {summary && (
        <div className="flex flex-col gap-4">
          <article className="text-sm leading-relaxed whitespace-pre-wrap">{summary.comprehensiveSummaryMarkdown}</article>

          {outline.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">Macro-schema argomenti</h3>
              <ul className="list-disc pl-5 text-sm">
                {outline.map((topic, i) => (
                  <li key={i}>
                    <span className="font-medium">{topic.topic}</span>
                    {topic.subtopics.length > 0 && (
                      <ul className="list-disc pl-5">
                        {topic.subtopics.map((s, si) => (
                          <li key={si}>{s}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {studyPlan.length > 0 && (
            <div>
              <h3 className="mb-2 font-semibold">Piano di studio suggerito</h3>
              <div className="flex flex-col gap-2">
                {studyPlan.map((block, i) => (
                  <div key={i} className="bg-base-100 rounded-box p-3 text-sm">
                    <p className="font-medium">{block.block}</p>
                    <p className="text-base-content/60">{block.focus}</p>
                    {block.lessons_covered.length > 0 && (
                      <p className="text-base-content/40 mt-1 text-xs">{block.lessons_covered.join(", ")}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.mermaidDiagram && <MermaidDiagram code={summary.mermaidDiagram} />}
        </div>
      )}
    </div>
  );
}
