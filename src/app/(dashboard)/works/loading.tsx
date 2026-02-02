import { Skeleton } from "@/components/ui/skeleton";

export default function WorksLoading() {
  return (
    <div className="max-w-6xl">
      {/* Header */}
      <header className="pb-10 border-b border-border mb-8">
        <div className="flex items-end justify-between">
          <div>
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-8 w-40 mb-3" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-10 w-28 rounded-full" />
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-full w-fit mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-full" />
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-8">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>

      {/* Card grid */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="project-card">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Skeleton className="h-4 w-6" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-5 w-40 mb-1" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
            <Skeleton className="h-10 w-full mb-5" />
            <div className="flex gap-1.5 mb-5">
              <Skeleton className="h-6 w-14 rounded-md" />
              <Skeleton className="h-6 w-14 rounded-md" />
            </div>
            <div className="flex items-center justify-between pt-5 border-t border-border">
              <Skeleton className="h-5 w-10" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
