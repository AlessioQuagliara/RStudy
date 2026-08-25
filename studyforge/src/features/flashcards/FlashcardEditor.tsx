import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreateFlashcard, useUpdateFlashcard } from "@/features/flashcards/api";
import { toast } from "@/lib/toastStore";
import type { Difficulty, Flashcard } from "@shared/schemas";

export function FlashcardEditor({
  open,
  onClose,
  courseId,
  lessonId,
  flashcard,
}: {
  open: boolean;
  onClose: () => void;
  courseId: string;
  lessonId?: string | null;
  flashcard?: Flashcard | null;
}) {
  const isEdit = Boolean(flashcard);
  const createFlashcard = useCreateFlashcard(courseId);
  const updateFlashcard = useUpdateFlashcard(courseId);

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [tags, setTags] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  useEffect(() => {
    if (open) {
      setFront(flashcard?.front ?? "");
      setBack(flashcard?.back ?? "");
      setTags(flashcard ? (JSON.parse(flashcard.tagsJson) as string[]).join(", ") : "");
      setDifficulty(flashcard?.difficulty ?? "medium");
    }
  }, [open, flashcard]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim() || !back.trim()) {
      toast.error("Fronte e retro sono obbligatori");
      return;
    }
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (isEdit && flashcard) {
        await updateFlashcard.mutateAsync({ id: flashcard.id, front, back, tags: tagList, difficulty });
        toast.success("Flashcard aggiornata");
      } else {
        await createFlashcard.mutateAsync({
          courseId,
          lessonId: lessonId ?? null,
          front,
          back,
          tags: tagList,
          difficulty,
          source: "manual",
        });
        toast.success("Flashcard creata");
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore durante il salvataggio");
    }
  };

  return (
    <Modal open={open} title={isEdit ? "Modifica flashcard" : "Nuova flashcard"} onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <label className="form-control">
          <span className="label-text mb-1">Fronte *</span>
          <textarea className="textarea textarea-bordered" rows={2} value={front} onChange={(e) => setFront(e.target.value)} />
        </label>
        <label className="form-control">
          <span className="label-text mb-1">Retro *</span>
          <textarea className="textarea textarea-bordered" rows={3} value={back} onChange={(e) => setBack(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="form-control">
            <span className="label-text mb-1">Tag (separati da virgola)</span>
            <input className="input input-bordered" value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Difficoltà</span>
            <select
              className="select select-bordered"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              <option value="easy">Facile</option>
              <option value="medium">Media</option>
              <option value="hard">Difficile</option>
            </select>
          </label>
        </div>
        <div className="modal-action">
          <button type="button" className="btn" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" className="btn btn-primary">
            {isEdit ? "Salva" : "Crea flashcard"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
