import { UserRole } from "@prisma/client";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getWorkStatusConfig } from "@/lib/work-status";

export default async function DashboardPage() {
  const session = await getSession();
  const userRole = session?.user.role as UserRole;
  const isEditor = userRole === UserRole.EDITOR;

  const whereClause = isEditor
    ? { editorId: session?.user.id }
    : { authorId: session?.user.id };

  const [worksCount, chaptersCount, translatedCount, reviewPendingCount] = await Promise.all([
    db.work.count({ where: whereClause }),
    db.chapter.count({ where: { work: whereClause } }),
    db.chapter.count({
      where: {
        work: whereClause,
        status: { in: ["TRANSLATED", "EDITED", "APPROVED"] },
      },
    }),
    isEditor
      ? db.chapter.count({
          where: { work: { editorId: session?.user.id }, status: "TRANSLATED" },
        })
      : Promise.resolve(0),
  ]);

  const recentWorks = await db.work.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: {
      author: { select: { name: true } },
      _count: { select: { chapters: true } },
      chapters: {
        where: isEditor ? { status: "TRANSLATED" } : {},
        select: { status: true },
      },
    },
  });

  const progressPercent = chaptersCount > 0
    ? Math.round((translatedCount / chaptersCount) * 100)
    : 0;

  return (
    <div className="max-w-5xl">
      {/* Page Header */}
      <header className="pb-12 border-b border-border mb-12">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
          {isEditor ? "Editor" : "Author"}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight mb-3">
          {session?.user.name}
        </h1>
        <p className="text-lg text-muted-foreground">
          {isEditor
            ? "검토가 필요한 번역본을 확인하세요"
            : "번역 프로젝트를 관리하세요"}
        </p>
      </header>

      {/* Stats Section */}
      <section className="mb-16">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
          Overview
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="stat-card">
            <p className="text-sm text-muted-foreground">
              {isEditor ? "담당 프로젝트" : "프로젝트"}
            </p>
            <p className="text-3xl font-semibold tabular-nums">{worksCount}</p>
          </div>

          {isEditor && (
            <div className="stat-card border-l-2 border-status-warning">
              <p className="text-sm text-status-warning">검토 대기</p>
              <p className="text-3xl font-semibold tabular-nums text-status-warning">
                {reviewPendingCount}
              </p>
            </div>
          )}

          <div className="stat-card">
            <p className="text-sm text-muted-foreground">총 회차</p>
            <p className="text-3xl font-semibold tabular-nums">{chaptersCount}</p>
          </div>

          <div className="stat-card">
            <p className="text-sm text-muted-foreground">
              {isEditor ? "검토 완료" : "번역 완료"}
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-semibold tabular-nums">{translatedCount}</p>
              <p className="text-base text-muted-foreground">/ {chaptersCount}</p>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-muted-foreground w-8">
                {progressPercent}%
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section>
        <div className="section-header">
          <div>
            <h2 className="text-xl font-semibold">
              {isEditor ? "담당 프로젝트" : "진행중인 프로젝트"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isEditor ? "검토가 필요한 프로젝트" : "최근 작업한 프로젝트"}
            </p>
          </div>
          {recentWorks.length > 0 && (
            <Link
              href="/works"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              전체 보기 →
            </Link>
          )}
        </div>

        {recentWorks.length === 0 ? (
          <div className="section-surface text-center py-16">
            <p className="text-xl font-medium mb-2">
              {isEditor ? "할당된 프로젝트가 없습니다" : "프로젝트가 없습니다"}
            </p>
            <p className="text-muted-foreground mb-8">
              {isEditor
                ? "작가가 윤문가로 지정하면 표시됩니다"
                : "첫 번역 프로젝트를 시작하세요"}
            </p>
            {!isEditor && (
              <Button asChild size="lg" className="rounded-full px-8">
                <Link href="/works/new">새 프로젝트</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-0">
            {recentWorks.map((work, index) => {
              const pendingCount = work.chapters.filter(
                (c) => c.status === "TRANSLATED"
              ).length;
              const statusConfig = getWorkStatusConfig(work.status);

              return (
                <Link
                  key={work.id}
                  href={isEditor ? `/works/${work.id}/review` : `/works/${work.id}`}
                  className="list-item group"
                >
                  <div className="flex items-center gap-6 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground tabular-nums w-6">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium group-hover:text-muted-foreground transition-colors truncate">
                        {work.titleKo}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">
                        {isEditor ? work.author?.name : work.titleOriginal}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    {isEditor && pendingCount > 0 && (
                      <span className="text-sm text-status-warning">
                        대기 {pendingCount}
                      </span>
                    )}
                    <Badge variant={statusConfig.variant}>
                      {statusConfig.label}
                    </Badge>
                    <span className="text-sm text-muted-foreground tabular-nums w-12 text-right">
                      {work._count.chapters}화
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Quick Action */}
        {!isEditor && recentWorks.length > 0 && (
          <div className="mt-8 pt-8 border-t border-border">
            <Button asChild size="lg" className="rounded-full px-8">
              <Link href="/works/new">새 프로젝트</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
