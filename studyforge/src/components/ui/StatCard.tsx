import type { LucideIcon } from "lucide-react";

export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <section className="stats stats-vertical bg-base-200 xl:stats-horizontal col-span-12 shadow-xs">
      {children}
    </section>
  );
}

export function Stat({
  icon: Icon,
  title,
  value,
  desc,
}: {
  icon: LucideIcon;
  title: string;
  value: string;
  desc?: string;
}) {
  return (
    <div className="stat">
      <div className="stat-figure">
        <Icon className="size-6 opacity-40" aria-hidden="true" />
      </div>
      <div className="stat-title">{title}</div>
      <div className="stat-value text-xl font-semibold tabular-nums">{value}</div>
      {desc && <div className="stat-desc">{desc}</div>}
    </div>
  );
}
