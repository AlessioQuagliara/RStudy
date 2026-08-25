import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="drawer lg:drawer-open min-h-screen">
      <input id="app-drawer" type="checkbox" className="drawer-toggle" aria-label="Attiva/disattiva menu" />
      <main className="drawer-content bg-base-100">
        <div className="grid grid-cols-12 gap-6 p-4 lg:p-8">{children}</div>
      </main>
      <Sidebar />
    </div>
  );
}
