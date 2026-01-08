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
    <div className="space-y-16">
      {/* Header */}
      <header className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {isEditor ? "Editor" : "Author"}
        </p>
        <h1 className="text-5xl font-medium tracking-tight">
          {session?.user.name}
        </h1>
        <p className="text-xl text-muted-foreground">
          {isEditor
            ? "검토가 필요한 번역본을 확인하세요"
            : "번역 프로젝트를 관리하세요"}
        </p>
      </header>

      {/* Stats Grid */}
      <section className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {isEditor ? "담당 프로젝트" : "프로젝트"}
          </p>
          <p className="text-4xl font-medium tabular-nums">{worksCount}</p>
        </div>

        {isEditor && (
          <div className="space-y-2">
            <p className="text-sm text-status-warning">검토 대기</p>
            <p className="text-4xl font-medium tabular-nums text-status-warning">
              {reviewPendingCount}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">총 회차</p>
          <p className="text-4xl font-medium tabular-nums">{chaptersCount}</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {isEditor ? "검토 완료" : "번역 완료"}
          </p>
          <div className="flex items-baseline gap-3">
            <p className="text-4xl font-medium tabular-nums">{translatedCount}</p>
            <p className="text-lg text-muted-foreground">/ {chaptersCount}</p>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-foreground rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">
              {progressPercent}%
            </span>
          </div>
        </div>
      </section>

      {/* Projects Section */}
      <section className="space-y-8">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-medium">
              {isEditor ? "담당 프로젝트" : "진행중인 프로젝트"}
            </h2>
            <p className="text-muted-foreground mt-1">
              {isEditor ? "검토가 필요한 프로젝트" : "최근 작업한 프로젝트"}
            </p>
          </div>
          {recentWorks.length > 0 && (
            <Link
              href="/works"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              전체 보기
            </Link>
          )}
        </div>

        {recentWorks.length === 0 ? (
          <div className="py-20 text-center border border-dashed rounded-3xl">
            <p className="text-2xl font-medium mb-2">
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
          <div className="divide-y divide-border">
            {recentWorks.map((work) => {
              const pendingCount = work.chapters.filter(
                (c) => c.status === "TRANSLATED"
              ).length;
              const statusConfig = getWorkStatusConfig(work.status);

              return (
                <Link
                  key={work.id}
                  href={isEditor ? `/works/${work.id}/review` : `/works/${work.id}`}
                  className="flex items-center justify-between py-6 group"
                >
                  <div className="space-y-1">
                    <h3 className="text-lg font-medium group-hover:text-muted-foreground transition-colors">
                      {work.titleKo}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {isEditor ? work.author?.name : work.titleOriginal}
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    {isEditor && pendingCount > 0 && (
                      <span className="text-sm text-status-warning">
                        검토 대기 {pendingCount}
                      </span>
                    )}
                    <Badge variant={statusConfig.variant}>
                      {statusConfig.label}
                    </Badge>
                    <span className="text-sm text-muted-foreground tabular-nums w-16 text-right">
                      {work._count.chapters}화
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick Action */}
      {!isEditor && recentWorks.length > 0 && (
        <section className="pt-8 border-t">
          <Button asChild size="lg" className="rounded-full px-8">
            <Link href="/works/new">새 프로젝트</Link>
          </Button>
        </section>
      )}
    </div>
  );
}
