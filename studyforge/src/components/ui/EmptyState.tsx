import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon className="text-base-content/30 size-10" aria-hidden="true" />
      <h3 className="font-semibold">{title}</h3>
      <p className="text-base-content/60 max-w-sm text-sm">{description}</p>
      {action}
    </div>
  );
}
