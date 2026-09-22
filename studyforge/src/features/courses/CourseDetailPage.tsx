import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, Trash2 } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Tabs } from "@/components/ui/Tabs";
import { StatusBadge } from "@/components/ui/Badge";
import { useCourse, useDeleteCourse } from "@/features/courses/api";
import { useLessons } from "@/features/lessons/api";
import { useFlashcardsByCourse } from "@/features/flashcards/api";
import { CourseFormModal } from "@/features/courses/CourseFormModal";
import { OverviewTab } from "@/features/courses/OverviewTab";
import { LessonsTab } from "@/features/courses/LessonsTab";
import { SummaryTab } from "@/features/courses/SummaryTab";
import { MaterialsPage } from "@/features/materials/MaterialsPage";
import { FlashcardList } from "@/features/flashcards/FlashcardList";
import { CourseChatPanel } from "@/features/search/CourseChatPanel";
import { formatDateIt } from "@/lib/dates";
import { toast } from "@/lib/toastStore";

const TABS = [
  { key: "overview", label: "Panoramica" },
  { key: "lessons", label: "Lezioni" },
  { key: "materials", label: "Materiali" },
  { key: "flashcards", label: "Flashcard" },
  { key: "rag", label: "Chiedi al corso" },
  { key: "summary", label: "Riassunto corso" },
];

const STATUS_LABEL = { active: "Attivo", completed: "Completato", archived: "Archiviato" } as const;

export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { data: course, isLoading } = useCourse(courseId);
  const { data: lessons = [] } = useLessons(courseId);
  const { data: flashcards = [] } = useFlashcardsByCourse(courseId);
  const deleteCourse = useDeleteCourse();
  const [tab, setTab] = useState("overview");
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading || !course) {
    return (
      <>
        <Topbar title="Corso" breadcrumb="Corsi" />
        <div className="col-span-12 skeleton h-40 w-full" />
      </>
    );
  }

  const completed = lessons.filter((l) => l.status === "completed").length;
  const total = course.targetLessons ?? lessons.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const handleDelete = async () => {
    if (!window.confirm(`Eliminare definitivamente "${course.title}"?`)) return;
    try {
      await deleteCourse.mutateAsync(course.id);
      toast.success("Corso eliminato");
      navigate("/courses");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Errore durante l'eliminazione");
    }
  };

  return (
    <>
      <Topbar title={course.title} breadcrumb="Corsi" />

      <div className="col-span-12 flex flex-wrap items-center gap-3">
        <StatusBadge status={course.status} label={STATUS_LABEL[course.status]} />
        <span className="text-base-content/60 text-sm">{course.cfu} CFU</span>
        {course.examDate && <span className="text-base-content/60 text-sm">Esame: {formatDateIt(course.examDate)}</span>}
        <div className="flex items-center gap-2">
          <progress className="progress progress-primary w-32" value={progress} max={100} />
          <span className="text-base-content/60 text-xs">{progress}%</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn btn-sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-4" /> Modifica
          </button>
          <button type="button" className="btn btn-sm text-error" onClick={handleDelete}>
            <Trash2 className="size-4" /> Elimina
          </button>
        </div>
      </div>

      <Tabs items={TABS} active={tab} onChange={setTab} tourId="course-tabs" />

      {tab === "overview" && <OverviewTab course={course} lessons={lessons} />}
      {tab === "lessons" && <LessonsTab courseId={course.id} />}
      {tab === "materials" && <MaterialsPage courseId={course.id} />}
      {tab === "flashcards" && (
        <div className="col-span-12">
          <FlashcardList courseId={course.id} cards={flashcards} />
        </div>
      )}
      {tab === "rag" && <CourseChatPanel courseId={course.id} />}
      {tab === "summary" && <SummaryTab courseId={course.id} />}

      <CourseFormModal open={editOpen} onClose={() => setEditOpen(false)} course={course} />
    </>
  );
}
