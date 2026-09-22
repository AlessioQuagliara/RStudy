import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { JSONContent } from "@tiptap/react";
import { Sparkles, Check, Loader2, ListChecks, Presentation as PresentationIcon } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { LessonEditor } from "@/features/lessons/LessonEditor";
import { AiOutputPanel } from "@/features/lessons/AiOutputPanel";
import { DuolingoQuiz } from "@/features/lessons/exercises/DuolingoQuiz";
import { PresentationPlayer } from "@/features/lessons/presentation/PresentationPlayer";
import { useCourse } from "@/features/courses/api";
import { useLesson, useSaveLessonNotes, useUpdateLesson } from "@/features/lessons/api";
import { useGenerateLessonStudyPack, useLessonAiOutput } from "@/features/lessons/aiApi";
import { useGenerateLessonExercises, useGenerateLessonPresentation } from "@/features/lessons/studyAiApi";
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
  const generateExercises = useGenerateLessonExercises();
  const generatePresentation = useGenerateLessonPresentation();

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

  // Salva sempre prima di generare (stesso pattern di handleSaveAndGenerate sopra):
  // non deve mai partire una generazione su appunti più vecchi di quelli visti
  // dall'utente nell'editor. `lesson.notesPlainText` riflette l'ultimo save
  // noto lato client: nella rara finestra tra la risoluzione di saveNow() e
  // l'invalidazione della query lesson, potrebbe essere di una frazione di
  // secondo indietro rispetto a quanto appena scritto — accettabile per un
  // controllo "ci sono appunti?" (il main resta comunque l'unica fonte
  // autorevole del contenuto realmente usato per generare).
  const handleGenerateExercises = async () => {
    await saveNow();
    if (!lesson.notesPlainText?.trim()) {
      toast.error("Aggiungi prima degli appunti alla lezione: servono per generare gli esercizi.");
      return;
    }
    try {
      const outcome = await generateExercises.mutateAsync({ lessonId: lesson.id });
      if (outcome.status === "error") {
        toast.error(outcome.error.message);
      } else if (outcome.fromCache) {
        toast.info("Esercizi già generati per questi appunti: sto mostrando il risultato salvato.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generazione esercizi non riuscita.");
    }
  };

  const handleGeneratePresentation = async () => {
    await saveNow();
    if (!lesson.notesPlainText?.trim()) {
      toast.error("Aggiungi prima degli appunti alla lezione: servono per generare la presentazione.");
      return;
    }
    try {
      const outcome = await generatePresentation.mutateAsync({ lessonId: lesson.id });
      if (outcome.status === "error") {
        toast.error(outcome.error.message);
      } else if (outcome.fromCache) {
        toast.info("Presentazione già generata per questi appunti: sto mostrando il risultato salvato.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generazione presentazione non riuscita.");
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
        <button
          type="button"
          className="btn btn-sm"
          onClick={handleGenerateExercises}
          disabled={generateExercises.isPending}
          aria-label="Genera esercizi dagli appunti di questa lezione"
        >
          {generateExercises.isPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <ListChecks className="size-4" />
          )}
          Genera esercizi
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={handleGeneratePresentation}
          disabled={generatePresentation.isPending}
          aria-label="Genera una presentazione di ripasso dagli appunti di questa lezione"
        >
          {generatePresentation.isPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <PresentationIcon className="size-4" />
          )}
          Genera presentazione
        </button>
      </div>

      <Tabs
        items={[
          { key: "editor", label: "Appunti" },
          { key: "ai", label: "Studio AI", tourId: "lesson-ai-tab" },
        ]}
        active={tab}
        onChange={setTab}
      />

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

      <Modal
        open={Boolean(generateExercises.data && generateExercises.data.status === "success")}
        title={generateExercises.data?.status === "success" ? generateExercises.data.data.title : "Esercizi"}
        onClose={() => generateExercises.reset()}
        hideHeader
        boxClassName="w-11/12 max-w-2xl p-0"
      >
        {generateExercises.data?.status === "success" && (
          <DuolingoQuiz
            exerciseSet={generateExercises.data.data}
            fromCache={generateExercises.data.fromCache}
            onClose={() => generateExercises.reset()}
          />
        )}
      </Modal>

      <Modal
        open={Boolean(generatePresentation.data && generatePresentation.data.status === "success")}
        title={generatePresentation.data?.status === "success" ? generatePresentation.data.data.title : "Presentazione"}
        onClose={() => generatePresentation.reset()}
        hideHeader
        boxClassName="w-[95vw] max-w-5xl p-0"
      >
        {generatePresentation.data?.status === "success" && (
          <PresentationPlayer
            presentation={generatePresentation.data.data}
            fromCache={generatePresentation.data.fromCache}
            onClose={() => generatePresentation.reset()}
          />
        )}
      </Modal>
    </>
  );
}
