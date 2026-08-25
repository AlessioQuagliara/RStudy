import { Menu, Moon, Sun } from "lucide-react";
import { useUiStore } from "@/lib/uiStore";

export function Topbar({ title, breadcrumb }: { title: string; breadcrumb?: string }) {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <header className="col-span-12 flex items-center gap-2">
      <label htmlFor="app-drawer" className="btn btn-square btn-ghost drawer-button lg:hidden" aria-label="Apri menu">
        <Menu className="size-5" aria-hidden="true" />
      </label>
      <div className="grow">
        {breadcrumb && (
          <div className="breadcrumbs text-sm">
            <ul>
              <li>{breadcrumb}</li>
              <li>{title}</li>
            </ul>
          </div>
        )}
        {!breadcrumb && <h1 className="text-xl font-semibold">{title}</h1>}
      </div>
      <button
        type="button"
        className="btn btn-circle btn-sm btn-ghost"
        aria-label="Cambia tema chiaro/scuro"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    </header>
  );
}
