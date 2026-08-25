import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const SPAN_CLASS = {
  4: "xl:col-span-4",
  6: "xl:col-span-6",
  7: "xl:col-span-7",
  8: "xl:col-span-8",
  12: "xl:col-span-12",
} as const;

export function Card({
  children,
  className,
  span = 12,
}: {
  children: ReactNode;
  className?: string;
  span?: keyof typeof SPAN_CLASS;
}) {
  return (
    <section className={cn("card bg-base-200 col-span-12 shadow-xs", SPAN_CLASS[span], className)}>
      <div className="card-body">{children}</div>
    </section>
  );
}
