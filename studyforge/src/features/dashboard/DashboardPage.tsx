import { Link } from "react-router-dom";
import { BookOpen, GraduationCap, CalendarClock, ListChecks, Layers, Plus, Focus } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { Card } from "@/components/ui/Card";
import { StatRow, Stat } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCardGrid } from "@/components/ui/Skeleton";
import { useDashboardStats } from "@/features/dashboard/useDashboardStats";
import { formatDateIt } from "@/lib/dates";

export function DashboardPage() {
  const stats = useDashboardStats();

  return (
    <>
      <Topbar title="Dashboard" />

      <div className="col-span-12 flex flex-wrap gap-2" data-tour="dashboard-quick-actions">
        <Link to="/courses" className="btn btn-primary btn-sm">
          <Plus className="size-4" /> Nuovo corso
        </Link>
        <Link to="/flashcards?mode=focus" className="btn btn-sm">
          <Focus className="size-4" /> Apri modalità focus
        </Link>
      </div>

      {stats.isLoading ? (
        <SkeletonCardGrid count={4} />
      ) : (
        <StatRow tourId="dashboard-stats">
          <Stat icon={GraduationCap} title="Corsi attivi" value={String(stats.activeCoursesCount)} />
          <Stat icon={BookOpen} title="CFU in corso" value={String(stats.totalCfu)} />
          <Stat
            icon={CalendarClock}
            title="Prossimo esame"
            value={stats.nextExam ? formatDateIt(stats.nextExam.examDate!) : "—"}
            desc={stats.nextExam?.title}
          />
          <Stat
            icon={ListChecks}
            title="Lezioni completate"
            value={`${stats.completedLessons}/${stats.totalLessons || 0}`}
          />
          <Stat icon={Layers} title="Flashcard da ripassare oggi" value={String(stats.dueTodayCount)} />
        </StatRow>
      )}

      <Card span={12}>
        <h2 className="card-title">Attività recenti</h2>
        {stats.recentActivity.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="Nessuna attività"
            description="Crea il tuo primo corso per iniziare a pianificare lo studio."
            action={
              <Link to="/courses" className="btn btn-primary btn-sm">
                Nuovo corso
              </Link>
            }
          />
        ) : (
          <ul className="divide-base-300 divide-y">
            {stats.recentActivity.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <Link to={`/courses/${c.id}`} className="link link-hover font-medium">
                  {c.title}
                </Link>
                <span className="text-base-content/50 text-xs">Aggiornato il {formatDateIt(c.updatedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
