import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { JSONContent } from "@tiptap/react";
import { Sparkles, Check, Loader2 } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Tabs } from "@/components/ui/Tabs";
import { LessonEditor } from "@/features/lessons/LessonEditor";
import { AiOutputPanel } from "@/features/lessons/AiOutputPanel";
import { useCourse } from "@/features/courses/api";
import { useLesson, useSaveLessonNotes, useUpdateLesson } from "@/features/lessons/api";
import { useGenerateLessonStudyPack, useLessonAiOutput } from "@/features/lessons/aiApi";
import { useAutosave } from "@/hooks/useAutosave";
import { toast } from "@/lib/toastStore";

const AUTOSAVE_STATUS_LABEL: Record<string, string> = {
  idle: "",
  saving: "Salvataggio...",
  saved: "Salvato",
  error: "Errore nel salvataggio",
};

export function LessonPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const { data: course } = useCourse(courseId);
  const { data: lesson } = useLesson(lessonId);
  const { data: aiOutput, isFetching: loadingAiOutput } = useLessonAiOutput(lessonId);
  const saveNotes = useSaveLessonNotes();
  const updateLesson = useUpdateLesson(courseId ?? "");
  const generateStudyPack = useGenerateLessonStudyPack(courseId ?? "");

  const [tab, setTab] = useState("editor");
  const [generating, setGenerating] = useState(false);

  const initialContent: JSONContent | null = useMemo(() => {
    if (!lesson?.notesJson) return null;
    try {
      return JSON.parse(lesson.notesJson) as JSONContent;
    } catch {
      return null;
    }
  }, [lesson?.notesJson]);

  const { status, notifyChange, saveNow } = useAutosave<{ json: JSONContent; plainText: string }>(
    async (value) => {
      if (!lessonId) return;
      await saveNotes.mutateAsync({
        id: lessonId,
        notesJson: JSON.stringify(value.json),
        notesPlainText: value.plainText,
      });
    },
  );

  if (!course || !lesson) {
    return (
      <>
        <Topbar title="Lezione" breadcrumb="Corso" />
        <div className="col-span-12 skeleton h-40 w-full" />
      </>
    );
  }

  const handleSaveAndGenerate = async () => {
    await saveNow();
    setGenerating(true);
    setTab("ai");
    try {
      await generateStudyPack.mutateAsync(lesson.id);
      if (lesson.status !== "completed") {
        await updateLesson.mutateAsync({ id: lesson.id, status: "completed" });
      }
      toast.success("Study pack AI generato");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generazione AI fallita");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Topbar title={`Lezione ${lesson.lessonNumber}: ${lesson.title}`} breadcrumb={course.title} />

      <div className="col-span-12 flex flex-wrap items-center gap-3">
        <select
          className="select select-bordered select-sm"
          value={lesson.status}
          onChange={(e) => updateLesson.mutate({ id: lesson.id, status: e.target.value as "draft" | "completed" })}
          aria-label="Stato lezione"
        >
          <option value="draft">Bozza</option>
          <option value="completed">Completata</option>
        </select>
        <input
          type="date"
          className="input input-bordered input-sm"
          value={lesson.lessonDate ?? ""}
          onChange={(e) => updateLesson.mutate({ id: lesson.id, lessonDate: e.target.value || null })}
          aria-label="Data lezione"
        />
        <span className="text-base-content/50 flex items-center gap-1 text-xs" role="status">
          {status === "saving" && <Loader2 className="size-3 animate-spin" />}
          {status === "saved" && <Check className="size-3 text-success" />}
          {AUTOSAVE_STATUS_LABEL[status]}
        </span>
        <button
          type="button"
          className="btn btn-primary btn-sm ml-auto"
          onClick={handleSaveAndGenerate}
          disabled={generating}
        >
          {generating ? <span className="loading loading-spinner loading-xs" /> : <Sparkles className="size-4" />}
          Salva e genera studio AI
        </button>
      </div>

      <Tabs items={[{ key: "editor", label: "Appunti" }, { key: "ai", label: "Studio AI" }]} active={tab} onChange={setTab} />

      {tab === "editor" && (
        <div className="col-span-12">
          <LessonEditor initialContent={initialContent} onChange={notifyChange} />
        </div>
      )}
      {tab === "ai" && (
        <div className="col-span-12">
          <AiOutputPanel output={aiOutput} generating={generating || loadingAiOutput} />
        </div>
      )}
    </>
  );
}
