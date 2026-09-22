import { Sparkles } from "lucide-react";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { EmptyState } from "@/components/ui/EmptyState";
import { QuestionMarkdown } from "@/features/lessons/shared/QuestionMarkdown";
import type { KeyPoint, StudyOutlineTopic, SelfCheckQuestion, LessonAiOutput } from "@shared/schemas";

export function AiOutputPanel({ output, generating }: { output: LessonAiOutput | null | undefined; generating: boolean }) {
  if (generating) {
    return (
      <div className="flex flex-col gap-3">
        <div className="skeleton h-6 w-1/2" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }

  if (!output) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Nessuno study pack ancora"
        description='Clicca "Salva e genera studio AI" per ottenere riepilogo, punti salienti, schema, diagramma e flashcard da questa lezione.'
      />
    );
  }

  const keyPoints: KeyPoint[] = JSON.parse(output.keyPointsJson);
  const outline: StudyOutlineTopic[] = JSON.parse(output.studyOutlineJson);
  const selfCheck: SelfCheckQuestion[] = JSON.parse(output.selfCheckQuestionsJson);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 font-semibold">Riepilogo</h3>
        <div className="text-sm leading-relaxed">
          <QuestionMarkdown>{output.summaryMarkdown}</QuestionMarkdown>
        </div>
      </section>

      {keyPoints.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Punti salienti</h3>
          <div className="flex flex-col gap-2">
            {keyPoints.map((kp, i) => (
              <div key={i} className="bg-base-100 rounded-box p-3">
                <p className="text-sm font-medium">{kp.title}</p>
                <p className="text-base-content/60 text-xs">{kp.explanation}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {outline.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Schema di studio</h3>
          <ul className="list-disc pl-5 text-sm">
            {outline.map((topic, i) => (
              <li key={i}>
                {topic.topic}
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
        </section>
      )}

      {output.mermaidDiagram && (
        <section>
          <h3 className="mb-2 font-semibold">Diagramma</h3>
          <MermaidDiagram code={output.mermaidDiagram} />
        </section>
      )}

      {selfCheck.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold">Domande di autoverifica</h3>
          <div className="flex flex-col gap-2">
            {selfCheck.map((q, i) => (
              <details key={i} className="bg-base-100 rounded-box p-3 text-sm">
                <summary className="cursor-pointer font-medium">{q.question}</summary>
                <p className="text-base-content/60 mt-1">{q.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <p className="text-base-content/40 text-xs">
        Generato con {output.model} · v{output.promptVersion}
      </p>
    </div>
  );
}
