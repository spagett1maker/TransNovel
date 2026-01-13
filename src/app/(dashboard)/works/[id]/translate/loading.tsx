import { Skeleton } from "@/components/ui/skeleton";

export default function TranslateLoading() {
  return (
    <div className="max-w-4xl">
      {/* Header */}
      <header className="pb-8 border-b border-border mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-5 w-20 mb-2" />
            <Skeleton className="h-8 w-48" />
          </div>
        </div>
        <Skeleton className="h-5 w-64" />
      </header>

      {/* Status Legend */}
      <div className="section-surface p-4 mb-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-16 rounded-full" />
            ))}
          </div>
        </div>
      </div>

      {/* Progress Section (placeholder) */}
      <div className="section-surface p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-6 w-32" />
        </div>
        <Skeleton className="h-3 w-full rounded-full mb-2" />
        <div className="flex justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>

      {/* Chapter Selection Card */}
      <div className="section-surface p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Skeleton className="h-6 w-24 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>

        {/* Chapter List */}
        <div className="space-y-2 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 rounded-xl border border-border"
            >
              <Skeleton className="h-5 w-5 rounded" />
              <div className="flex-1 flex items-center gap-3">
                <Skeleton className="h-6 w-12 rounded-full" />
                <Skeleton className="h-5 w-32" />
              </div>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-11 w-40 rounded-full" />
        </div>
      </div>
    </div>
  );
}
