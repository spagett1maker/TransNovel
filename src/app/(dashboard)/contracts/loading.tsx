import { Skeleton } from "@/components/ui/skeleton";

export default function ContractsLoading() {
  return (
    <div className="max-w-5xl">
      {/* Header */}
      <header className="pb-8 border-b border-border mb-8">
        <Skeleton className="h-3 w-16 mb-2" />
        <Skeleton className="h-9 w-32 mb-2" />
        <Skeleton className="h-5 w-56" />
      </header>

      {/* Filters */}
      <div className="flex gap-4 mb-8">
        <Skeleton className="h-10 w-[160px]" />
      </div>

      {/* List */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-xl p-6 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Skeleton className="w-5 h-5 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
