import { useState } from "react";
import { RotateCw } from "lucide-react";
import { useReviewFlashcard } from "@/features/flashcards/api";
import type { Flashcard } from "@shared/schemas";

export function FlashcardStudyMode({
  cards,
  courseId,
  onFinished,
}: {
  cards: Flashcard[];
  courseId?: string;
  onFinished: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const review = useReviewFlashcard(courseId);

  if (cards.length === 0) {
    return <p className="text-base-content/60 text-sm">Nessuna flashcard da ripassare.</p>;
  }

  const card = cards[index]!;
  const isLast = index === cards.length - 1;

  const grade = async (value: "easy" | "medium" | "hard") => {
    await review.mutateAsync({ id: card.id, grade: value });
    if (isLast) {
      onFinished();
    } else {
      setIndex((i) => i + 1);
      setFlipped(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4">
      <p className="text-base-content/50 text-xs">
        Carta {index + 1} di {cards.length}
      </p>
      <button
        type="button"
        className="card bg-base-100 border-base-300 min-h-48 w-full cursor-pointer border shadow-md"
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Mostra fronte" : "Mostra retro"}
      >
        <div className="card-body items-center justify-center text-center">
          <p className="text-base-content/40 mb-2 flex items-center gap-1 text-xs">
            <RotateCw className="size-3" /> {flipped ? "Retro" : "Fronte"} — clicca per girare
          </p>
          <p className="text-lg">{flipped ? card.back : card.front}</p>
        </div>
      </button>

      {flipped && (
        <div className="flex gap-2">
          <button type="button" className="btn btn-error btn-sm" onClick={() => grade("hard")}>
            Difficile
          </button>
          <button type="button" className="btn btn-warning btn-sm" onClick={() => grade("medium")}>
            Media
          </button>
          <button type="button" className="btn btn-success btn-sm" onClick={() => grade("easy")}>
            Facile
          </button>
        </div>
      )}
    </div>
  );
}
