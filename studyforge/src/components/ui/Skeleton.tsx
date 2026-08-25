import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-box", className)} aria-hidden="true" />;
}

export function SkeletonCardGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="col-span-12 grid grid-cols-1 gap-4 md:grid-cols-3" role="status" aria-label="Caricamento">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}
