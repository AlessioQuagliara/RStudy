import { useState } from "react";
import { Pencil, Trash2, Copy, Layers } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDeleteFlashcard, useDuplicateFlashcard } from "@/features/flashcards/api";
import { FlashcardEditor } from "@/features/flashcards/FlashcardEditor";
import { toast } from "@/lib/toastStore";
import type { Flashcard } from "@shared/schemas";

const DIFFICULTY_LABEL: Record<Flashcard["difficulty"], string> = {
  easy: "Facile",
  medium: "Media",
  hard: "Difficile",
};

export function FlashcardList({ courseId, cards }: { courseId?: string; cards: Flashcard[] }) {
  const deleteFlashcard = useDeleteFlashcard(courseId);
  const duplicateFlashcard = useDuplicateFlashcard(courseId);
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  if (cards.length === 0) {
    return <EmptyState icon={Layers} title="Nessuna flashcard" description="Genera uno study pack AI da una lezione o creane una manualmente." />;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.id} className="card bg-base-100 border-base-300 border">
            <div className="card-body gap-2 p-4">
              <p className="text-sm font-medium">{card.front}</p>
              <p className="text-base-content/60 text-xs">{card.back}</p>
              <div className="mt-1 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="badge badge-ghost badge-xs">{DIFFICULTY_LABEL[card.difficulty]}</span>
                  {card.source === "ai" && <span className="badge badge-info badge-xs">AI</span>}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    aria-label="Modifica flashcard"
                    onClick={() => {
                      setEditing(card);
                      setEditorOpen(true);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    aria-label="Duplica flashcard"
                    onClick={async () => {
                      await duplicateFlashcard.mutateAsync(card.id);
                      toast.success("Flashcard duplicata");
                    }}
                  >
                    <Copy className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-error"
                    aria-label="Elimina flashcard"
                    onClick={() => deleteFlashcard.mutate(card.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <FlashcardEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          courseId={editing.courseId}
          flashcard={editing}
        />
      )}
    </>
  );
}
