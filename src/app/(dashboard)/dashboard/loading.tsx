export default function DashboardLoading() {
  return (
    <div className="max-w-6xl animate-pulse">
      {/* Header skeleton */}
      <header className="pb-10 border-b border-border mb-10">
        <div className="h-3 w-12 bg-muted rounded mb-3" />
        <div className="h-10 w-48 bg-muted rounded mb-3" />
        <div className="h-5 w-64 bg-muted rounded" />
      </header>

      {/* Stats section */}
      <section className="mb-12">
        <div className="h-3 w-16 bg-muted rounded mb-6" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="stat-card">
              <div className="flex items-center justify-between mb-3">
                <div className="h-4 w-16 bg-muted rounded" />
                <div className="h-9 w-9 rounded-xl bg-muted" />
              </div>
              <div className="h-8 w-20 bg-muted rounded" />
            </div>
          ))}
        </div>
      </section>

      {/* Projects section */}
      <section>
        <div className="section-header">
          <div>
            <div className="h-6 w-32 bg-muted rounded mb-2" />
            <div className="h-4 w-48 bg-muted rounded" />
          </div>
        </div>
        <div className="space-y-0">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-4 border-b border-border last:border-b-0">
              <div className="flex items-center gap-6 flex-1">
                <div className="h-4 w-6 bg-muted rounded" />
                <div className="flex-1">
                  <div className="h-5 w-48 bg-muted rounded mb-1.5" />
                  <div className="h-3.5 w-32 bg-muted rounded" />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-5 w-16 bg-muted rounded-full" />
                <div className="h-4 w-10 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
