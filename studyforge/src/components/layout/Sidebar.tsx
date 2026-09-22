import { NavLink } from "react-router-dom";
import { LayoutDashboard, GraduationCap, Layers, Settings, PlayCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { ChangelogPanel } from "@/components/layout/ChangelogPanel";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, tourId: "nav-dashboard" },
  { to: "/courses", label: "Corsi", icon: GraduationCap, tourId: "nav-courses" },
  { to: "/flashcards", label: "Flashcard", icon: Layers, tourId: "nav-flashcards" },
  { to: "/settings", label: "Impostazioni", icon: Settings, tourId: "nav-settings" },
];

export function Sidebar({ onStartTour }: { onStartTour: () => void }) {
  return (
    <aside className="drawer-side z-20">
      <label htmlFor="app-drawer" className="drawer-overlay" aria-label="Chiudi menu"></label>
      <nav className="bg-base-200 flex min-h-screen w-64 flex-col gap-2 px-2 pt-6">
        <div className="mx-3 mb-2 flex items-center gap-2 font-semibold">
          <img src="./logo-mark.svg" alt="" className="size-6 rounded-md" aria-hidden="true" />
          <span>RStudy</span>
        </div>
        <ul className="menu w-full grow">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end, tourId }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                data-tour={tourId}
                className={({ isActive }) => cn(isActive && "menu-active")}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-ghost btn-sm mx-2 justify-start gap-2 normal-case"
          onClick={onStartTour}
        >
          <PlayCircle className="size-4" aria-hidden="true" />
          Tutorial
        </button>
        <ChangelogPanel />
        <p className="text-base-content/40 mx-3 mb-4 text-xs">Locale-first · macOS</p>
      </nav>
    </aside>
  );
}
