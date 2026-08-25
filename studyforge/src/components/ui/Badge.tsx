import { cn } from "@/lib/cn";

const STATUS_CLASS: Record<string, string> = {
  active: "badge-info",
  completed: "badge-success",
  archived: "badge-ghost",
  draft: "badge-warning",
  idle: "badge-ghost",
  queued: "badge-info",
  processing: "badge-info",
  failed: "badge-error",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={cn("badge badge-sm", STATUS_CLASS[status] ?? "badge-ghost")}>{label}</span>;
}
