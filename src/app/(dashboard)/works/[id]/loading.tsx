import { Skeleton } from "@/components/ui/skeleton";

export default function WorkDetailLoading() {
  return (
    <div className="max-w-6xl animate-in fade-in duration-300">
      {/* Breadcrumb */}
      <nav className="mb-8">
        <Skeleton className="h-4 w-24" />
      </nav>

      {/* Page Header */}
      <header className="pb-10 border-b border-border mb-10">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32 mt-3" />
          </div>
          <div className="flex gap-2 shrink-0">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      </header>

      {/* Stats Row */}
      <section className="mb-12">
        <div className="grid gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card">
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      </section>

      {/* Main Content Grid */}
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        {/* Chapter List Skeleton */}
        <section>
          <div className="section-header">
            <div>
              <Skeleton className="h-6 w-24 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>

          <div className="space-y-0">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="list-item"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <Skeleton className="h-4 w-8" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </section>

        {/* Sidebar Skeleton */}
        <aside className="space-y-8">
          {/* Synopsis */}
          <div>
            <Skeleton className="h-3 w-12 mb-4" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>

          {/* Original Work Info */}
          <div>
            <Skeleton className="h-3 w-16 mb-4" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <Skeleton className="h-3 w-16 mb-4" />
            <div className="space-y-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
