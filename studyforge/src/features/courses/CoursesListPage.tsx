import { useState } from "react";
import { Plus, Search, GraduationCap } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCardGrid } from "@/components/ui/Skeleton";
import { CourseCard } from "@/features/courses/CourseCard";
import { CourseFormModal } from "@/features/courses/CourseFormModal";
import { useDeleteCourse } from "@/features/courses/api";
import { useCoursesWithProgress } from "@/features/courses/useCoursesWithProgress";
import { toast } from "@/lib/toastStore";
import type { Course, CourseStatus } from "@shared/schemas";

const STATUS_FILTERS: Array<{ value: CourseStatus | "all"; label: string }> = [
  { value: "all", label: "Tutti" },
  { value: "active", label: "Attivi" },
  { value: "completed", label: "Completati" },
  { value: "archived", label: "Archiviati" },
];

export function CoursesListPage() {
  const { items, isLoading } = useCoursesWithProgress();
  const deleteCourse = useDeleteCourse();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CourseStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  const filtered = items.filter(({ course }) => {
    const matchesSearch = course.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || course.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openCreate = () => {
    setEditingCourse(null);
    setModalOpen(true);
  };
  const openEdit = (course: Course) => {
    setEditingCourse(course);
    setModalOpen(true);
  };

  const handleDelete = async (course: Course) => {
    if (!window.confirm(`Eliminare definitivamente "${course.title}"? Verranno rimossi anche lezioni, materiali e flashcard collegati.`)) {
      return;
    }
    try {
      await deleteCourse.mutateAsync(course.id);
      toast.success("Corso eliminato");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore durante l'eliminazione");
    }
  };

  return (
    <>
      <Topbar title="Corsi" />

      <div className="col-span-12 flex flex-wrap items-center gap-2">
        <label className="input input-bordered flex grow items-center gap-2 sm:max-w-xs">
          <Search className="text-base-content/40 size-4" />
          <input
            type="search"
            className="grow"
            placeholder="Cerca corso..."
            aria-label="Cerca corso"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="join">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`btn btn-sm join-item ${statusFilter === f.value ? "btn-active" : ""}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-sm ml-auto" data-tour="courses-new-button" onClick={openCreate}>
          <Plus className="size-4" /> Nuovo corso
        </button>
      </div>

      {isLoading ? (
        <SkeletonCardGrid count={6} />
      ) : filtered.length === 0 ? (
        <div className="col-span-12">
          <EmptyState
            icon={GraduationCap}
            title="Nessun corso trovato"
            description={
              items.length === 0
                ? "Crea il tuo primo corso per iniziare a organizzare lezioni e materiali."
                : "Nessun corso corrisponde ai filtri selezionati."
            }
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                Nuovo corso
              </button>
            }
          />
        </div>
      ) : (
        <div className="col-span-12 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ course, lessonsCompleted, lessonsTotal }) => (
            <CourseCard
              key={course.id}
              course={course}
              lessonsCompleted={lessonsCompleted}
              lessonsTotal={lessonsTotal}
              onEdit={() => openEdit(course)}
              onDelete={() => handleDelete(course)}
            />
          ))}
        </div>
      )}

      <CourseFormModal open={modalOpen} onClose={() => setModalOpen(false)} course={editingCourse} />
    </>
  );
}
