import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, CheckCircle2, Circle, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCreateLesson, useDeleteLesson, useLessons } from "@/features/lessons/api";
import { formatDateIt } from "@/lib/dates";
import { toast } from "@/lib/toastStore";

export function LessonsTab({ courseId }: { courseId: string }) {
  const { data: lessons = [], isLoading } = useLessons(courseId);
  const createLesson = useCreateLesson();
  const deleteLesson = useDeleteLesson(courseId);
  const [title, setTitle] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createLesson.mutateAsync({
        courseId,
        lessonNumber: lessons.length + 1,
        title: title.trim(),
        lessonDate: new Date().toISOString().slice(0, 10),
      });
      setTitle("");
      toast.success("Lezione creata");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore durante la creazione");
    }
  };

  if (isLoading) return <div className="col-span-12 skeleton h-24 w-full" />;

  return (
    <div className="col-span-12 flex flex-col gap-4">
      <form className="join" onSubmit={handleCreate}>
        <input
          className="input input-bordered join-item grow"
          placeholder={`Titolo lezione ${lessons.length + 1}...`}
          aria-label="Titolo nuova lezione"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" className="btn btn-primary join-item" disabled={!title.trim()}>
          <Plus className="size-4" /> Aggiungi lezione
        </button>
      </form>

      {lessons.length === 0 ? (
        <EmptyState icon={Circle} title="Nessuna lezione" description="Aggiungi la prima lezione per iniziare a prendere appunti." />
      ) : (
        <ul className="divide-base-300 divide-y">
          {lessons.map((lesson) => (
            <li key={lesson.id} className="flex items-center justify-between gap-3 py-2">
              <Link to={`/courses/${courseId}/lessons/${lesson.id}`} className="link link-hover flex min-w-0 items-center gap-2">
                {lesson.status === "completed" ? (
                  <CheckCircle2 className="text-success size-4 shrink-0" />
                ) : (
                  <Circle className="text-base-content/30 size-4 shrink-0" />
                )}
                <span className="truncate">
                  Lezione {lesson.lessonNumber}: {lesson.title}
                </span>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                {lesson.lessonDate && <span className="text-base-content/50 text-xs">{formatDateIt(lesson.lessonDate)}</span>}
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-error"
                  aria-label={`Elimina lezione ${lesson.title}`}
                  onClick={() => {
                    if (window.confirm(`Eliminare la lezione "${lesson.title}"?`)) deleteLesson.mutate(lesson.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
