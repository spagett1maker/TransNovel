import { Skeleton } from "@/components/ui/skeleton";

export default function WorksLoading() {
  return (
    <div className="max-w-6xl">
      {/* Header */}
      <header className="pb-10 border-b border-border mb-10">
        <div className="flex items-end justify-between">
          <div>
            <Skeleton className="h-3 w-16 mb-3" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-6 w-32 mt-3" />
          </div>
          <Skeleton className="h-11 w-32 rounded-full" />
        </div>
      </header>

      {/* Grid */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="section-surface p-6 space-y-4">
            <div className="flex items-start justify-between">
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
