import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreateCourse, useUpdateCourse } from "@/features/courses/api";
import { toast } from "@/lib/toastStore";
import type { Course, CourseStatus } from "@shared/schemas";

const COLORS = ["#6366f1", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6", "#22c55e"];

export function CourseFormModal({
  open,
  onClose,
  course,
}: {
  open: boolean;
  onClose: () => void;
  course?: Course | null;
}) {
  const isEdit = Boolean(course);
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();

  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [cfu, setCfu] = useState(6);
  const [examDate, setExamDate] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [objectives, setObjectives] = useState("");
  const [targetLessons, setTargetLessons] = useState<number | "">("");
  const [status, setStatus] = useState<CourseStatus>("active");
  const [color, setColor] = useState(COLORS[0]!);

  useEffect(() => {
    if (open) {
      setTitle(course?.title ?? "");
      setCode(course?.code ?? "");
      setCfu(course?.cfu ?? 6);
      setExamDate(course?.examDate ?? "");
      setIntroduction(course?.introduction ?? "");
      setObjectives(course?.objectives ?? "");
      setTargetLessons(course?.targetLessons ?? "");
      setStatus(course?.status ?? "active");
      setColor(course?.color ?? COLORS[0]!);
    }
  }, [open, course]);

  const submitting = createCourse.isPending || updateCourse.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Il titolo del corso è obbligatorio");
      return;
    }
    const payload = {
      title: title.trim(),
      code: code.trim() || null,
      cfu,
      examDate: examDate || null,
      introduction: introduction.trim() || null,
      objectives: objectives.trim() || null,
      targetLessons: targetLessons === "" ? null : Number(targetLessons),
      status,
      color,
    };
    try {
      if (isEdit && course) {
        await updateCourse.mutateAsync({ id: course.id, ...payload });
        toast.success("Corso aggiornato");
      } else {
        await createCourse.mutateAsync(payload);
        toast.success("Corso creato");
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore durante il salvataggio");
    }
  };

  return (
    <Modal open={open} title={isEdit ? "Modifica corso" : "Nuovo corso"} onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <label className="form-control">
          <span className="label-text mb-1">Titolo *</span>
          <input
            className="input input-bordered w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="form-control">
            <span className="label-text mb-1">Codice corso</span>
            <input className="input input-bordered w-full" value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">CFU</span>
            <input
              type="number"
              min={0}
              max={60}
              className="input input-bordered w-full"
              value={cfu}
              onChange={(e) => setCfu(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="form-control">
            <span className="label-text mb-1">Data esame (opzionale)</span>
            <input
              type="date"
              className="input input-bordered w-full"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Lezioni previste</span>
            <input
              type="number"
              min={0}
              className="input input-bordered w-full"
              value={targetLessons}
              onChange={(e) => setTargetLessons(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </label>
        </div>

        <label className="form-control">
          <span className="label-text mb-1">Introduzione</span>
          <textarea
            className="textarea textarea-bordered w-full"
            rows={2}
            value={introduction}
            onChange={(e) => setIntroduction(e.target.value)}
          />
        </label>

        <label className="form-control">
          <span className="label-text mb-1">Obiettivi</span>
          <textarea
            className="textarea textarea-bordered w-full"
            rows={2}
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="form-control">
            <span className="label-text mb-1">Stato</span>
            <select
              className="select select-bordered w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value as CourseStatus)}
            >
              <option value="active">Attivo</option>
              <option value="completed">Completato</option>
              <option value="archived">Archiviato</option>
            </select>
          </label>
          <div className="form-control">
            <span className="label-text mb-1">Colore</span>
            <div className="flex gap-2 pt-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colore ${c}`}
                  aria-pressed={color === c}
                  className="size-6 rounded-full ring-offset-2"
                  style={{ backgroundColor: c, outline: color === c ? `2px solid ${c}` : "none" }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="modal-action">
          <button type="button" className="btn" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? <span className="loading loading-spinner loading-sm" /> : isEdit ? "Salva" : "Crea corso"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
