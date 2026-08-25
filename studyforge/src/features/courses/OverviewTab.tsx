import { CalendarClock, ListChecks, Target } from "lucide-react";
import { formatDateIt } from "@/lib/dates";
import type { Course, Lesson } from "@shared/schemas";

export function OverviewTab({ course, lessons }: { course: Course; lessons: Lesson[] }) {
  const completed = lessons.filter((l) => l.status === "completed").length;
  const total = course.targetLessons ?? lessons.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="col-span-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <h3 className="mb-1 font-semibold">Introduzione</h3>
        <p className="text-base-content/70 mb-4 text-sm whitespace-pre-wrap">
          {course.introduction || "Nessuna introduzione impostata per questo corso."}
        </p>
        <h3 className="mb-1 font-semibold">Obiettivi</h3>
        <p className="text-base-content/70 text-sm whitespace-pre-wrap">
          {course.objectives || "Nessun obiettivo impostato per questo corso."}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <div className="stat bg-base-100 rounded-box p-4">
          <div className="stat-figure">
            <ListChecks className="size-5 opacity-40" />
          </div>
          <div className="stat-title">Progresso lezioni</div>
          <div className="stat-value text-lg">
            {completed}/{total || "—"}
          </div>
          <progress className="progress progress-primary mt-2 w-full" value={progress} max={100} />
        </div>
        {course.examDate && (
          <div className="stat bg-base-100 rounded-box p-4">
            <div className="stat-figure">
              <CalendarClock className="size-5 opacity-40" />
            </div>
            <div className="stat-title">Data esame</div>
            <div className="stat-value text-lg">{formatDateIt(course.examDate)}</div>
          </div>
        )}
        <div className="stat bg-base-100 rounded-box p-4">
          <div className="stat-figure">
            <Target className="size-5 opacity-40" />
          </div>
          <div className="stat-title">CFU</div>
          <div className="stat-value text-lg">{course.cfu}</div>
        </div>
      </div>
    </div>
  );
}
