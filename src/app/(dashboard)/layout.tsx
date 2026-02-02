import { redirect } from "next/navigation";

import { Sidebar, MobileSidebar } from "@/components/layout/sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { getSession } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Skip link (Issue 7-1) */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
          <MobileSidebar />
          <span className="text-lg font-semibold tracking-tight">TransNovel</span>
        </header>

        {/* Main content */}
        <main id="main-content" className="flex-1 overflow-auto">
          <div className="mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
