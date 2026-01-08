import { UserRole } from "@prisma/client";
import {
  ArrowRight,
  BookOpen,
  CheckCircle,
  ClipboardCheck,
  FileText,
  Languages,
  Plus,
  Sparkles,
  TrendingUp
} from "lucide-react";
import Link from "next/link";

import { StatsCharts } from "@/components/dashboard/stats-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getWorkStatusConfig } from "@/lib/work-status";

export default async function DashboardPage() {
  const session = await getSession();
  const userRole = session?.user.role as UserRole;
  const isEditor = userRole === UserRole.EDITOR;

  // 역할별 통계 조회
  const whereClause = isEditor
    ? { editorId: session?.user.id }
    : { authorId: session?.user.id };

  const [worksCount, chaptersCount, translatedCount, reviewPendingCount] = await Promise.all([
    db.work.count({ where: whereClause }),
    db.chapter.count({
      where: { work: whereClause },
    }),
    db.chapter.count({
      where: {
        work: whereClause,
        status: { in: ["TRANSLATED", "EDITED", "APPROVED"] },
      },
    }),
    isEditor
      ? db.chapter.count({
          where: {
            work: { editorId: session?.user.id },
            status: "TRANSLATED",
          },
        })
      : Promise.resolve(0),
  ]);

  const recentWorks = await db.work.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: {
      author: {
        select: { name: true },
      },
      _count: {
        select: { chapters: true },
      },
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
    <div className="space-y-10">
      {/* Decorative background elements */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-accent/30 via-transparent to-transparent rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-muted/50 via-transparent to-transparent rounded-full blur-3xl opacity-40" />
      </div>

      {/* Header Section */}
      <header className="animate-in">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
                {isEditor ? "Editor Dashboard" : "Author Dashboard"}
              </p>
            </div>
            <h1 className="text-4xl font-bold tracking-tight">
              안녕하세요, <span className="gradient-text">{session?.user.name}</span>님
            </h1>
            <p className="text-lg text-muted-foreground max-w-md">
              {isEditor
                ? "검토가 필요한 번역본을 확인해보세요"
                : "오늘도 멋진 번역을 시작해보세요"}
            </p>
          </div>
          {!isEditor && (
            <Button size="lg" className="rounded-2xl shadow-lg hover:shadow-xl transition-shadow" asChild>
              <Link href="/works/new">
                <Plus className="mr-2 h-5 w-5" />
                새 프로젝트
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* Bento Grid Stats */}
      <div className={`grid gap-4 ${isEditor ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-3"}`}>
        {/* Main stat - Projects */}
        <div className="bento-item animate-in animate-delay-1 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-muted-foreground">
                {isEditor ? "담당 프로젝트" : "번역 프로젝트"}
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-4xl font-bold stat-number">{worksCount}</p>
              <p className="text-sm text-muted-foreground">개의 프로젝트</p>
            </div>
          </div>
        </div>

        {/* Editor: Review pending */}
        {isEditor && (
          <div className="bento-item animate-in animate-delay-2 relative overflow-hidden bg-gradient-to-br from-status-warning/10 to-transparent">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-status-warning">검토 대기</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-warning/15">
                <ClipboardCheck className="h-5 w-5 text-status-warning" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-4xl font-bold stat-number text-status-warning">{reviewPendingCount}</p>
              <p className="text-sm text-muted-foreground">화 번역 완료</p>
            </div>
          </div>
        )}

        {/* Total chapters */}
        <div className="bento-item animate-in animate-delay-2 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-status-info/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-muted-foreground">총 회차</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-info/10">
                <FileText className="h-5 w-5 text-status-info" />
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-4xl font-bold stat-number">{chaptersCount}</p>
              <p className="text-sm text-muted-foreground">화 등록됨</p>
            </div>
          </div>
        </div>

        {/* Completed translations with progress */}
        <div className="bento-item animate-in animate-delay-3 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-muted-foreground">
              {isEditor ? "검토 완료" : "번역 완료"}
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-success/10">
              {isEditor ? (
                <CheckCircle className="h-5 w-5 text-status-success" />
              ) : (
                <Languages className="h-5 w-5 text-status-success" />
              )}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-end gap-2">
              <p className="text-4xl font-bold stat-number">{translatedCount}</p>
              <p className="text-sm text-muted-foreground mb-1">/ {chaptersCount}화</p>
            </div>
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-status-success to-status-success/70 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-status-success" />
                <span className="text-sm font-semibold text-status-success">{progressPercent}%</span>
                <span className="text-xs text-muted-foreground">완료</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Projects */}
      <section className="animate-in animate-delay-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {isEditor ? "담당 프로젝트" : "진행중인 프로젝트"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isEditor
                ? "검토가 필요한 프로젝트 목록입니다"
                : "최근에 작업한 번역 프로젝트"}
            </p>
          </div>
          {recentWorks.length > 0 && (
            <Button variant="ghost" className="rounded-xl group" asChild>
              <Link href="/works">
                전체 보기
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          )}
        </div>

        {recentWorks.length === 0 ? (
          <div className="bento-item py-16 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-muted/50 mb-6">
              <BookOpen className="h-10 w-10 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {isEditor ? "할당된 프로젝트가 없습니다" : "등록된 프로젝트가 없습니다"}
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              {isEditor
                ? "작가가 프로젝트에 윤문가로 지정하면 여기에 표시됩니다"
                : "첫 번역 프로젝트를 등록하고 AI 번역을 시작해보세요"}
            </p>
            {!isEditor && (
              <Button className="rounded-xl" asChild>
                <Link href="/works/new">
                  <Plus className="mr-2 h-4 w-4" />
                  첫 프로젝트 시작하기
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {recentWorks.map((work, index) => {
              const pendingReviewCount = work.chapters.filter(
                (c) => c.status === "TRANSLATED"
              ).length;
              const statusConfig = getWorkStatusConfig(work.status);

              return (
                <Link
                  key={work.id}
                  href={isEditor ? `/works/${work.id}/review` : `/works/${work.id}`}
                  className="group bento-item !p-5 flex items-center justify-between gap-4"
                  style={{ animationDelay: `${0.4 + index * 0.1}s` }}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 group-hover:from-primary/15 group-hover:to-primary/10 transition-colors">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {work.titleKo}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {isEditor ? `작가: ${work.author?.name}` : work.titleOriginal}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {isEditor && pendingReviewCount > 0 && (
                      <Badge variant="warning" className="font-medium">
                        검토 대기 {pendingReviewCount}화
                      </Badge>
                    )}
                    <Badge variant={statusConfig.variant} className="font-medium">
                      {statusConfig.label}
                    </Badge>
                    <div className="text-right hidden sm:block">
                      <p className="text-sm font-semibold">{work._count.chapters}화</p>
                      <p className="text-xs text-muted-foreground">
                        {work.genres.slice(0, 2).join(" · ")}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Stats Charts */}
      <section className="animate-in animate-delay-5">
        <StatsCharts />
      </section>
    </div>
  );
}
