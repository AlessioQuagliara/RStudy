import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Focus, Layers } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCardGrid } from "@/components/ui/Skeleton";
import { useAllFlashcards } from "@/features/flashcards/useAllFlashcards";
import { useDueTodayFlashcards } from "@/features/flashcards/api";
import { FlashcardList } from "@/features/flashcards/FlashcardList";
import { FlashcardStudyMode } from "@/features/flashcards/FlashcardStudyMode";
import type { Difficulty } from "@shared/schemas";

export function FlashcardsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { courses, cards, isLoading } = useAllFlashcards();
  const dueTodayQuery = useDueTodayFlashcards();

  const [courseFilter, setCourseFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "all">("all");
  const [tagFilter, setTagFilter] = useState("");
  const studying = searchParams.get("mode") === "focus";

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      const matchesCourse = courseFilter === "all" || c.courseId === courseFilter;
      const matchesDifficulty = difficultyFilter === "all" || c.difficulty === difficultyFilter;
      const tags = JSON.parse(c.tagsJson) as string[];
      const matchesTag = !tagFilter || tags.some((t) => t.toLowerCase().includes(tagFilter.toLowerCase()));
      return matchesCourse && matchesDifficulty && matchesTag;
    });
  }, [cards, courseFilter, difficultyFilter, tagFilter]);

  const dueCards = dueTodayQuery.data ?? [];

  return (
    <>
      <Topbar title="Flashcard" />

      <div className="col-span-12 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setSearchParams({ mode: "focus" })}
          disabled={dueCards.length === 0}
        >
          <Focus className="size-4" /> Studia ripassi di oggi ({dueCards.length})
        </button>
        {studying && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearchParams({})}>
            Esci dalla modalità focus
          </button>
        )}
      </div>

      {studying ? (
        <div className="card bg-base-200 col-span-12 shadow-xs">
          <div className="card-body">
            <FlashcardStudyMode cards={dueCards} onFinished={() => setSearchParams({})} />
          </div>
        </div>
      ) : (
        <>
          <div className="col-span-12 flex flex-wrap gap-2">
            <select className="select select-bordered select-sm" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="all">Tutti i corsi</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select
              className="select select-bordered select-sm"
              value={difficultyFilter}
              onChange={(e) => setDifficultyFilter(e.target.value as Difficulty | "all")}
            >
              <option value="all">Tutte le difficoltà</option>
              <option value="easy">Facile</option>
              <option value="medium">Media</option>
              <option value="hard">Difficile</option>
            </select>
            <input
              className="input input-bordered input-sm"
              placeholder="Filtra per tag..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            />
          </div>

          <div className="col-span-12">
            {isLoading ? (
              <SkeletonCardGrid />
            ) : filtered.length === 0 ? (
              <EmptyState icon={Layers} title="Nessuna flashcard" description="Crea flashcard manualmente da un corso oppure genera uno study pack AI da una lezione." />
            ) : (
              <FlashcardList courseId={courseFilter === "all" ? undefined : courseFilter} cards={filtered} />
            )}
          </div>
        </>
      )}
    </>
  );
}
