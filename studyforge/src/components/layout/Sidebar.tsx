import { NavLink } from "react-router-dom";
import { LayoutDashboard, GraduationCap, Layers, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/courses", label: "Corsi", icon: GraduationCap },
  { to: "/flashcards", label: "Flashcard", icon: Layers },
  { to: "/settings", label: "Impostazioni", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="drawer-side z-20">
      <label htmlFor="app-drawer" className="drawer-overlay" aria-label="Chiudi menu"></label>
      <nav className="bg-base-200 flex min-h-screen w-64 flex-col gap-2 px-2 pt-6">
        <div className="mx-3 mb-2 flex items-center gap-2 font-semibold">
          <img src="/logo-mark.svg" alt="" className="size-6 rounded-md" aria-hidden="true" />
          <span>RStudy</span>
        </div>
        <ul className="menu w-full grow">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => cn(isActive && "menu-active")}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <p className="text-base-content/40 mx-3 mb-4 text-xs">Locale-first · macOS</p>
      </nav>
    </aside>
  );
}
