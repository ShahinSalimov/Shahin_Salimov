import { Skeleton } from "@/components/ui/skeleton";

export function PageHeaderSkeleton() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid gap-6" role="status" aria-label="Loading">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-8 w-12" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 xl:col-span-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-5 h-2.5 w-full" />
          <div className="mt-6 grid gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mx-auto mt-6 size-32 rounded-full" />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid gap-6" role="status" aria-label="Loading">
      <PageHeaderSkeleton />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-5 py-3.5 last:border-0">
            <Skeleton className="size-8 rounded-lg" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
