import { UserRole, ApplicationStatus } from "@prisma/client";
import Image from "next/image";
import Link from "next/link";
import { Star, FileText, Briefcase, Clock, CheckCircle, BookOpen, Calendar, FolderOpen, Layers, Languages, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import dynamic from "next/dynamic";

const StatsCharts = dynamic(
  () => import("@/components/dashboard/stats-charts").then((m) => ({ default: m.StatsCharts })),
  { loading: () => <div className="h-64 flex items-center justify-center"><div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" /></div> }
);
import { getSession } from "@/lib/auth";
import { getCachedDashboardStats, getCachedEditorProfile } from "@/lib/cache";
import { db } from "@/lib/db";
import { getWorkStatusConfig } from "@/lib/work-status";

export default async function DashboardPage() {
  const session = await getSession();
  const userRole = session?.user.role as UserRole;
  const isEditor = userRole === UserRole.EDITOR;

  const whereClause = isEditor
    ? { editorId: session?.user.id }
    : { authorId: session?.user.id };

  // Phase 1: 캐싱된 통계 + recentWorks 병렬 실행
  const [stats, recentWorks] = await Promise.all([
    getCachedDashboardStats(session!.user.id, isEditor),
    db.work.findMany({
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
    }),
  ]);
  const { worksCount, chaptersCount, translatedCount, reviewPendingCount } = stats;

  // Editor-specific data
  let editorProfile: {
    id: string;
    displayName: string | null;
    bio: string | null;
    availability: string;
    averageRating: number | null;
    totalReviews: number;
  } | null = null;
  let activeContracts: {
    id: string;
    startDate: Date;
    chapterStart: number;
    chapterEnd: number | null;
    work: { id: string; titleKo: string; coverImage: string | null; totalChapters: number };
    author: { id: string; name: string | null; image: string | null };
    _count: { revisionRequests: number };
  }[] = [];
  let applicationCounts = { pending: 0, shortlisted: 0, accepted: 0, rejected: 0 };
  let recentApplications: {
    id: string;
    status: ApplicationStatus;
    submittedAt: Date;
    listing: {
      id: string;
      title: string;
      work: { titleKo: string };
      author: { name: string | null };
    };
  }[] = [];

  if (isEditor && session?.user.id) {
    // 캐싱된 에디터 프로필 조회
    editorProfile = await getCachedEditorProfile(session.user.id);

    if (editorProfile) {
      // Phase 2: 에디터 프로필 의존 쿼리 3개를 병렬 실행
      const [contracts, countsByStatus, applications] = await Promise.all([
        db.projectContract.findMany({
          where: { editorId: session.user.id, isActive: true },
          include: {
            work: {
              select: { id: true, titleKo: true, coverImage: true, totalChapters: true },
            },
            author: {
              select: { id: true, name: true, image: true },
            },
            _count: {
              select: { revisionRequests: true },
            },
          },
          orderBy: { startDate: "desc" },
          take: 3,
        }),
        db.projectApplication.groupBy({
          by: ["status"],
          where: { editorProfileId: editorProfile.id },
          _count: { status: true },
        }),
        db.projectApplication.findMany({
          where: { editorProfileId: editorProfile.id },
          include: {
            listing: {
              select: {
                id: true,
                title: true,
                work: { select: { titleKo: true } },
                author: { select: { name: true } },
              },
            },
          },
          orderBy: { submittedAt: "desc" },
          take: 5,
        }),
      ]);

      activeContracts = contracts;
      countsByStatus.forEach((item) => {
        const key = item.status.toLowerCase() as keyof typeof applicationCounts;
        if (key in applicationCounts) {
          applicationCounts[key] = item._count.status;
        }
      });
      recentApplications = applications;
    }
  }

  // Author-specific: pending applications on their works
  let authorPendingApplications: {
    id: string;
    priceQuote: number | null;
    submittedAt: Date;
    editorProfile: {
      displayName: string | null;
      user: { name: string | null; image: string | null };
    };
    listing: {
      id: string;
      title: string;
      work: { id: string; titleKo: string };
    };
  }[] = [];
  let authorPendingCount = 0;

  if (!isEditor && session?.user.id) {
    // Single count query + limited fetch (avoid duplicate WHERE scan)
    const pendingWhere = {
      status: "PENDING" as const,
      listing: {
        authorId: session.user.id,
        status: "OPEN" as const,
      },
    };

    const [pendingApps, pendingTotal] = await Promise.all([
      db.projectApplication.findMany({
        where: pendingWhere,
        include: {
          editorProfile: {
            select: {
              displayName: true,
              user: { select: { name: true, image: true } },
            },
          },
          listing: {
            select: {
              id: true,
              title: true,
              work: { select: { id: true, titleKo: true } },
            },
          },
        },
        orderBy: { submittedAt: "desc" },
        take: 3,
      }),
      db.projectApplication.count({ where: pendingWhere }),
    ]);
    authorPendingApplications = pendingApps;
    authorPendingCount = pendingTotal;
  }

  const progressPercent = chaptersCount > 0
    ? Math.round((translatedCount / chaptersCount) * 100)
    : 0;

  const getAvailabilityLabel = (status: string | undefined) => {
    switch (status) {
      case "AVAILABLE": return { label: "가능", color: "bg-status-success" };
      case "BUSY": return { label: "바쁨", color: "bg-status-warning" };
      case "UNAVAILABLE": return { label: "불가", color: "bg-status-error" };
      default: return { label: "미설정", color: "bg-status-pending" };
    }
  };

  const getApplicationStatusConfig = (status: ApplicationStatus) => {
    switch (status) {
      case "PENDING": return { label: "대기중", variant: "secondary" as const };
      case "SHORTLISTED": return { label: "관심목록", variant: "default" as const };
      case "ACCEPTED": return { label: "수락됨", variant: "default" as const };
      case "REJECTED": return { label: "거절됨", variant: "destructive" as const };
      default: return { label: status, variant: "secondary" as const };
    }
  };

  const availability = getAvailabilityLabel(editorProfile?.availability);

  return (
    <div className="max-w-6xl">
      {/* Onboarding Checklist */}
      {session?.user?.id && (userRole === UserRole.AUTHOR || userRole === UserRole.EDITOR) && (
        <OnboardingChecklist
          role={userRole as "AUTHOR" | "EDITOR"}
          userId={session.user.id}
        />
      )}

      {/* Page Header */}
      <header className="pb-10 border-b border-border mb-10">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
          {isEditor ? "Editor" : "Author"}
        </p>
        <div className="flex items-center gap-3 mb-3">
          <h1 className="text-4xl font-semibold tracking-tight">
            {isEditor && editorProfile?.displayName
              ? editorProfile.displayName
              : session?.user.name}
          </h1>
          {isEditor && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white ${availability.color}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
              {availability.label}
            </span>
          )}
        </div>
        <p className="text-lg text-muted-foreground">
          {isEditor
            ? editorProfile
              ? "검토가 필요한 번역본을 확인하세요"
              : "프로필을 완성하고 윤문 작업을 시작하세요"
            : "번역 프로젝트를 관리하세요"}
        </p>
        {isEditor && !editorProfile && (
          <Link
            href="/my-profile"
            className="inline-flex items-center gap-2 mt-4 text-sm text-primary hover:underline"
          >
            <FileText className="h-4 w-4" />
            프로필 완성하기 →
          </Link>
        )}
      </header>

      {/* Stats Section */}
      <section className="mb-12">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
          Overview
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isEditor ? (
            <>
              {/* Active Contracts */}
              <div className="stat-card">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-muted-foreground">활성 계약</p>
                  <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-3xl font-semibold tabular-nums">{activeContracts.length}</p>
              </div>

              {/* Review Pending */}
              <div className="stat-card border-l-2 border-status-warning">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-status-warning">검토 대기</p>
                  <div className="h-9 w-9 rounded-xl bg-status-warning/10 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-status-warning" />
                  </div>
                </div>
                <p className="text-3xl font-semibold tabular-nums text-status-warning">
                  {reviewPendingCount}
                </p>
              </div>

              {/* Applications Pending */}
              <div className="stat-card">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-muted-foreground">지원 대기중</p>
                  <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-3xl font-semibold tabular-nums">{applicationCounts.pending}</p>
              </div>

              {/* Rating */}
              <div className="stat-card">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-muted-foreground">평점</p>
                  <div className="h-9 w-9 rounded-xl bg-status-warning/10 flex items-center justify-center">
                    <Star className="h-4 w-4 text-status-warning fill-status-warning" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-semibold tabular-nums">
                    {editorProfile?.averageRating?.toFixed(1) || "-"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {editorProfile?.totalReviews || 0}개 리뷰
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="stat-card">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-muted-foreground">프로젝트</p>
                  <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-3xl font-semibold tabular-nums">{worksCount}</p>
              </div>

              <div className="stat-card">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-muted-foreground">총 회차</p>
                  <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-3xl font-semibold tabular-nums">{chaptersCount}</p>
              </div>

              <div className="stat-card col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-muted-foreground">번역 완료</p>
                  <div className="h-9 w-9 rounded-xl bg-status-success/10 flex items-center justify-center">
                    <Languages className="h-4 w-4 text-status-success" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-semibold tabular-nums">{translatedCount}</p>
                  <p className="text-base text-muted-foreground">/ {chaptersCount}</p>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-status-success rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-8">
                    {progressPercent}%
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Author: Pending Applications Section */}
      {!isEditor && authorPendingCount > 0 && (
        <section className="mb-12">
          <div className="section-header">
            <div>
              <h2 className="text-xl font-semibold">새 지원서</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {authorPendingCount}건의 지원서가 대기 중입니다
              </p>
            </div>
          </div>
          <div className="space-y-0">
            {authorPendingApplications.map((app) => {
              const editorName = app.editorProfile.displayName || app.editorProfile.user.name || "이름 없음";
              return (
                <Link
                  key={app.id}
                  href={`/works/${app.listing.work.id}/listings`}
                  className="list-item group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {app.editorProfile.user.image ? (
                      <Image
                        src={app.editorProfile.user.image}
                        alt={`${app.editorProfile.displayName || app.editorProfile.user.name || "윤문가"} 프로필`}
                        width={32}
                        height={32}
                        className="rounded-full shrink-0 object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium truncate group-hover:text-muted-foreground transition-colors">
                        {editorName}
                      </h4>
                      <p className="text-sm text-muted-foreground truncate">
                        {app.listing.work.titleKo}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="warning">대기중</Badge>
                  </div>
                </Link>
              );
            })}
          </div>
          {authorPendingCount > 3 && (
            <div className="mt-2 text-center">
              <Link
                href="/works"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                전체 {authorPendingCount}건 보기 →
              </Link>
            </div>
          )}
        </section>
      )}

      {/* Editor: Active Contracts Section */}
      {isEditor && activeContracts.length > 0 && (
        <section className="mb-12">
          <div className="section-header">
            <div>
              <h2 className="text-xl font-semibold">활성 계약</h2>
              <p className="text-sm text-muted-foreground mt-1">진행 중인 윤문 계약</p>
            </div>
            <Link
              href="/contracts"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              전체 보기 →
            </Link>
          </div>
          <div className="space-y-3">
            {activeContracts.map((contract) => (
              <Link
                key={contract.id}
                href={`/contracts/${contract.id}`}
                className="block border rounded-xl p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex gap-4">
                  {contract.work.coverImage ? (
                    <Image
                      src={contract.work.coverImage}
                      alt={`${contract.work.titleKo} 표지`}
                      width={48}
                      height={64}
                      className="object-cover rounded-lg shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-muted rounded-lg shrink-0 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium truncate">{contract.work.titleKo}</h3>
                        <p className="text-sm text-muted-foreground">{contract.author.name}</p>
                      </div>
                      <Badge variant="success" className="shrink-0">
                        <Clock className="h-3 w-3 mr-1" />
                        진행 중
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(contract.startDate).toLocaleDateString("ko-KR")}
                      </span>
                      {contract._count.revisionRequests > 0 && (
                        <span className="text-status-warning">
                          수정요청 {contract._count.revisionRequests}건
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Editor: Applications Section */}
      {isEditor && editorProfile && (
        <section className="mb-12">
          <div className="section-header">
            <div>
              <h2 className="text-xl font-semibold">내 지원 현황</h2>
              <p className="text-sm text-muted-foreground mt-1">공고 지원 현황</p>
            </div>
            <Link
              href="/my-applications"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              전체 보기 →
            </Link>
          </div>

          {/* Status Summary */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-semibold">{applicationCounts.pending}</p>
              <p className="text-xs text-muted-foreground">대기중</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-semibold">{applicationCounts.shortlisted}</p>
              <p className="text-xs text-muted-foreground">관심목록</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-semibold text-status-success">{applicationCounts.accepted}</p>
              <p className="text-xs text-muted-foreground">수락됨</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-semibold text-muted-foreground">{applicationCounts.rejected}</p>
              <p className="text-xs text-muted-foreground">거절됨</p>
            </div>
          </div>

          {/* Recent Applications */}
          {recentApplications.length > 0 ? (
            <div className="space-y-0">
              {recentApplications.map((app) => {
                const statusConfig = getApplicationStatusConfig(app.status);
                return (
                  <Link
                    key={app.id}
                    href={`/marketplace/${app.listing.id}`}
                    className="list-item group"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate group-hover:text-muted-foreground transition-colors">
                        {app.listing.title}
                      </h4>
                      <p className="text-sm text-muted-foreground truncate">
                        {app.listing.work.titleKo} · {app.listing.author.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {new Date(app.submittedAt).toLocaleDateString("ko-KR")}
                      </span>
                      <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 border rounded-xl border-dashed">
              <Briefcase className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground">아직 지원한 공고가 없습니다</p>
              <Link href="/marketplace">
                <Button variant="outline" size="sm" className="mt-3">
                  마켓플레이스 둘러보기
                </Button>
              </Link>
            </div>
          )}
        </section>
      )}

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
                ? "마켓플레이스에서 프로젝트를 찾아보세요"
                : "첫 번역 프로젝트를 시작하세요"}
            </p>
            {isEditor ? (
              <Button asChild size="lg" className="rounded-full px-8">
                <Link href="/marketplace">마켓플레이스</Link>
              </Button>
            ) : (
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

      {/* Stats Charts Section */}
      {(worksCount > 0 || activeContracts.length > 0) && (
        <section className="mt-12 pt-12 border-t border-border">
          <StatsCharts />
        </section>
      )}
    </div>
  );
}
