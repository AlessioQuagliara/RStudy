import { useState } from "react";
import { Send, AlertCircle, RotateCcw, FileText } from "lucide-react";
import { useCourseChat } from "@/features/courses/aiApi";
import type { RagQueryResult } from "@shared/schemas";

interface ChatTurn {
  question: string;
  result?: RagQueryResult;
  error?: string;
}

export function CourseChatPanel({ courseId, activeLessonId }: { courseId: string; activeLessonId?: string | null }) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const chat = useCourseChat(courseId);

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTurns((prev) => [...prev, { question: trimmed }]);
    setQuestion("");
    try {
      const result = await chat.mutateAsync({ question: trimmed, activeLessonId });
      setTurns((prev) => prev.map((t, i) => (i === prev.length - 1 ? { ...t, result } : t)));
    } catch (error) {
      setTurns((prev) =>
        prev.map((t, i) =>
          i === prev.length - 1 ? { ...t, error: error instanceof Error ? error.message : "Errore" } : t,
        ),
      );
    }
  };

  return (
    <div className="col-span-12 flex flex-col gap-3">
      {turns.length === 0 && (
        <p className="text-base-content/60 text-sm">
          Fai una domanda sul materiale di questo corso. Le risposte citano sempre le fonti usate; se il materiale non
          è sufficiente, l&apos;assistente te lo dirà esplicitamente.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {turns.map((turn, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="chat chat-end">
              <div className="chat-bubble">{turn.question}</div>
            </div>
            {turn.error && (
              <div className="alert alert-error text-sm">
                <AlertCircle className="size-4" />
                <span>{turn.error}</span>
                <button type="button" className="btn btn-xs" onClick={() => ask(turn.question)}>
                  <RotateCcw className="size-3" /> Riprova
                </button>
              </div>
            )}
            {turn.result && (
              <div className="chat chat-start">
                <div className="chat-bubble chat-bubble-neutral flex flex-col gap-2">
                  <p className="whitespace-pre-wrap">{turn.result.answer}</p>
                  {turn.result.citations.length > 0 && (
                    <div className="border-base-content/20 mt-1 flex flex-col gap-1 border-t pt-2">
                      {turn.result.citations.map((c, ci) => (
                        <details key={ci} className="text-xs">
                          <summary className="flex cursor-pointer items-center gap-1 opacity-70">
                            <FileText className="size-3" /> {c.sourceLabel}
                          </summary>
                          <p className="mt-1 opacity-60">{c.excerpt}</p>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {chat.isPending && (
          <div className="chat chat-start">
            <div className="chat-bubble chat-bubble-neutral">
              <span className="loading loading-dots loading-sm" />
            </div>
          </div>
        )}
      </div>

      <form
        className="join"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          className="input input-bordered join-item grow"
          placeholder="Chiedi al materiale del corso..."
          aria-label="Domanda al corso"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className="btn btn-primary join-item" disabled={chat.isPending || !question.trim()}>
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
