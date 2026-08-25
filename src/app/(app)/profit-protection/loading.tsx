import { PageContainer } from "@/components/shell/page-header";
import { CardSkeleton, Skeleton, TableSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageContainer>
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading…</span>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
      </div>

      <div className="card overflow-hidden pt-4">
        <TableSkeleton rows={8} columns={6} />
      </div>
    </PageContainer>
  );
}
