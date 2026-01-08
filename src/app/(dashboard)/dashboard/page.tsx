import { UserRole } from "@prisma/client";
import { BookOpen, CheckCircle, ClipboardCheck, FileText, Languages, Plus } from "lucide-react";
import Link from "next/link";

import { StatsCharts } from "@/components/dashboard/stats-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRoleDisplayName, getStatusDisplayName } from "@/lib/permissions";

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
    // 윤문가: 검토 대기 회차 수
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            안녕하세요, {session?.user.name}님
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isEditor
              ? "검토가 필요한 번역본을 확인해보세요"
              : "오늘도 멋진 번역을 시작해보세요"}
          </p>
        </div>
        {!isEditor && (
          <Button asChild>
            <Link href="/works/new">
              <Plus className="mr-2 h-4 w-4" />새 프로젝트
            </Link>
          </Button>
        )}
      </div>

      {/* Stats - 역할별 다른 통계 */}
      <div className={`grid gap-4 ${isEditor ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {isEditor ? "담당 프로젝트" : "번역 프로젝트"}
            </CardTitle>
            <BookOpen className="h-4 w-4 text-primary/60" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{worksCount}개</div>
          </CardContent>
        </Card>
        {isEditor && (
          <Card className="border-accent/40 bg-accent/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-accent-foreground">검토 대기</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-accent-foreground/80" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-accent-foreground">{reviewPendingCount}화</div>
              <p className="text-xs text-accent-foreground/70">번역 완료 후 검토 필요</p>
            </CardContent>
          </Card>
        )}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 회차</CardTitle>
            <FileText className="h-4 w-4 text-primary/60" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{chaptersCount}화</div>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {isEditor ? "검토 완료" : "번역 완료"}
            </CardTitle>
            {isEditor ? (
              <CheckCircle className="h-4 w-4 text-primary/60" />
            ) : (
              <Languages className="h-4 w-4 text-primary/60" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{translatedCount}화</div>
            <p className="text-xs text-muted-foreground">
              {chaptersCount > 0
                ? `${Math.round((translatedCount / chaptersCount) * 100)}%`
                : "0%"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Works */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">{isEditor ? "담당 프로젝트" : "진행중인 프로젝트"}</CardTitle>
          <CardDescription>
            {isEditor
              ? "검토가 필요한 프로젝트 목록입니다"
              : "최근에 작업한 번역 프로젝트 목록입니다"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentWorks.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <BookOpen className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="mt-4 text-muted-foreground">
                {isEditor ? "할당된 프로젝트가 없습니다" : "등록된 프로젝트가 없습니다"}
              </p>
              {!isEditor && (
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/works/new">첫 프로젝트 시작하기</Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {recentWorks.map((work: (typeof recentWorks)[number]) => {
                const pendingReviewCount = work.chapters.filter(
                  (c: { status: string }) => c.status === "TRANSLATED"
                ).length;

                return (
                  <Link
                    key={work.id}
                    href={isEditor ? `/works/${work.id}/review` : `/works/${work.id}`}
                    className="flex items-center justify-between rounded-lg border border-border/60 p-4 transition-all hover:border-primary/30 hover:bg-accent/30 hover:shadow-sm"
                  >
                    <div>
                      <h3 className="font-medium text-foreground">{work.titleKo}</h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {isEditor ? `작가: ${work.author?.name}` : work.titleOriginal}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      {isEditor && pendingReviewCount > 0 && (
                        <Badge variant="secondary" className="bg-accent/50 text-accent-foreground border-0">
                          검토 대기 {pendingReviewCount}화
                        </Badge>
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {work._count.chapters}화
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {work.genres.slice(0, 2).join(", ")}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Advanced Stats Charts */}
      <StatsCharts />
    </div>
  );
}
