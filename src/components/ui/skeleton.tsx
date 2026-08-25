import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden />;
}

export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-live="polite" className="px-5 pb-5">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn("h-8", c === 0 ? "w-32" : c === columns - 1 ? "w-16" : "flex-1")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("card p-5", className)} role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-36" />
      <Skeleton className="mt-3 h-3 w-28" />
    </div>
  );
}
