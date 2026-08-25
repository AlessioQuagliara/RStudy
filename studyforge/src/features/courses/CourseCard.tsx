import { Link } from "react-router-dom";
import { Pencil, Trash2, CalendarClock } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import { formatDateIt } from "@/lib/dates";
import type { Course } from "@shared/schemas";

const STATUS_LABEL: Record<Course["status"], string> = {
  active: "Attivo",
  completed: "Completato",
  archived: "Archiviato",
};

export function CourseCard({
  course,
  lessonsCompleted,
  lessonsTotal,
  onEdit,
  onDelete,
}: {
  course: Course;
  lessonsCompleted: number;
  lessonsTotal: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const progress = lessonsTotal > 0 ? Math.round((lessonsCompleted / lessonsTotal) * 100) : 0;

  return (
    <div className="card bg-base-200 shadow-xs">
      <div className="card-body gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: course.color ?? "#6366f1" }}
              aria-hidden="true"
            />
            <Link to={`/courses/${course.id}`} className="link link-hover card-title text-base">
              {course.title}
            </Link>
          </div>
          <StatusBadge status={course.status} label={STATUS_LABEL[course.status]} />
        </div>

        <div className="text-base-content/60 flex flex-wrap gap-3 text-xs">
          <span>{course.cfu} CFU</span>
          {course.examDate && (
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3" /> {formatDateIt(course.examDate)}
            </span>
          )}
        </div>

        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span>Lezioni</span>
            <span>
              {lessonsCompleted}/{lessonsTotal || "—"}
            </span>
          </div>
          <progress className="progress progress-primary w-full" value={progress} max={100} />
        </div>

        <div className="card-actions justify-end">
          <button type="button" className="btn btn-ghost btn-xs" onClick={onEdit} aria-label="Modifica corso">
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs text-error"
            onClick={onDelete}
            aria-label="Elimina corso"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
