import { SourceLanguage, UserRole, WorkStatus } from "@prisma/client";
import { Languages } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkCardClient, TranslationStatusInline } from "@/components/works/work-card-client";
import { WorksFilterBar } from "@/components/works/works-filter-bar";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGE_RATINGS, GENRES, SOURCE_LANGUAGES } from "@/lib/validations/work";
import { getWorkStatusConfig, WORK_STATUS_TABS, type WorkStatusTab } from "@/lib/work-status";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 12;

// URL 헬퍼: 탭/필터/페이지 조합으로 URL 생성
function buildWorksUrl(params: {
  tab?: string;
  page?: number;
  lang?: string | null;
  genres?: string[];
}): string {
  const sp = new URLSearchParams();
  if (params.tab && params.tab !== "all") sp.set("tab", params.tab);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  if (params.lang) sp.set("lang", params.lang);
  if (params.genres && params.genres.length > 0) sp.set("genres", params.genres.join(","));
  const qs = sp.toString();
  return qs ? `/works?${qs}` : "/works";
}

export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    tab?: string;
    lang?: string;
    genres?: string;
  }>;
}) {
  const session = await getSession();
  const { page: pageParam, tab: tabParam, lang, genres: genresParam } = await searchParams;

  // 파라미터 파싱
  const currentPage = Math.max(1, parseInt(pageParam || "1", 10) || 1);
  const currentTab: WorkStatusTab =
    tabParam && tabParam in WORK_STATUS_TABS
      ? (tabParam as WorkStatusTab)
      : "all";
  const currentLang =
    lang && lang in SOURCE_LANGUAGES ? lang : null;
  const currentGenres = genresParam
    ? genresParam.split(",").filter((g) => (GENRES as readonly string[]).includes(g))
    : [];

  if (!session?.user?.id) {
    return (
      <div className="max-w-6xl">
        <p className="text-muted-foreground">로그인이 필요합니다.</p>
      </div>
    );
  }

  const isEditor = session.user.role === UserRole.EDITOR;
  const baseWhere = isEditor
    ? { editorId: session.user.id }
    : { authorId: session.user.id };

  // 부가 필터 조건
  const langFilter = currentLang ? { sourceLanguage: currentLang as SourceLanguage } : {};
  const genreFilter =
    currentGenres.length > 0 ? { genres: { hasSome: currentGenres } } : {};

  // 상태 탭 조건
  const tabConfig = WORK_STATUS_TABS[currentTab];
  const statusFilter = tabConfig.statuses
    ? { status: { in: tabConfig.statuses as WorkStatus[] } }
    : {};

  const whereClause = {
    ...baseWhere,
    ...statusFilter,
    ...langFilter,
    ...genreFilter,
  };

  // 탭별 카운트: groupBy로 1회 쿼리
  const statusCounts = await db.work.groupBy({
    by: ["status"],
    where: { ...baseWhere, ...langFilter, ...genreFilter },
    _count: { _all: true },
  });

  const countByStatus = new Map<string, number>();
  statusCounts.forEach((s) => countByStatus.set(s.status, s._count._all));

  const tabCounts: Record<WorkStatusTab, number> = {
    all: statusCounts.reduce((sum, s) => sum + s._count._all, 0),
    preparing: (["REGISTERED", "BIBLE_GENERATING", "BIBLE_DRAFT", "BIBLE_CONFIRMED"] as string[])
      .reduce((sum, s) => sum + (countByStatus.get(s) || 0), 0),
    translating: (["TRANSLATING", "TRANSLATED"] as string[])
      .reduce((sum, s) => sum + (countByStatus.get(s) || 0), 0),
    proofreading: countByStatus.get("PROOFREADING") || 0,
    completed: countByStatus.get("COMPLETED") || 0,
  };

  // 현재 탭의 총 작품 수 + 페이지네이션 조회
  const totalWorks = await db.work.count({ where: whereClause });
  const totalPages = Math.ceil(totalWorks / ITEMS_PER_PAGE);

  const works = await db.work.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    skip: (currentPage - 1) * ITEMS_PER_PAGE,
    take: ITEMS_PER_PAGE,
    include: {
      creators: true,
      _count: { select: { chapters: true } },
    },
  });

  // 에디터만: 검토 대기 챕터 수를 groupBy로 효율적으로 조회 (N×M행 → N행)
  const pendingReviewCounts = new Map<string, number>();
  if (isEditor && works.length > 0) {
    const workIds = works.map((w) => w.id);
    const counts = await db.chapter.groupBy({
      by: ["workId"],
      where: {
        workId: { in: workIds },
        status: "TRANSLATED",
      },
      _count: { _all: true },
    });
    counts.forEach((c) => pendingReviewCounts.set(c.workId, c._count._all));
  }

  // 작가만: 대기 중 지원서 수를 groupBy로 조회
  const pendingApplicationCounts = new Map<string, number>();
  if (!isEditor && works.length > 0) {
    const workIds = works.map((w) => w.id);
    const appCounts = await db.projectApplication.groupBy({
      by: ["listingId"],
      where: {
        listing: { workId: { in: workIds } },
        status: "PENDING",
      },
      _count: { _all: true },
    });
    // listingId → workId 매핑을 위해 listing 조회
    if (appCounts.length > 0) {
      const listingIds = appCounts.map((c) => c.listingId);
      const listings = await db.projectListing.findMany({
        where: { id: { in: listingIds } },
        select: { id: true, workId: true },
      });
      const listingToWork = new Map(listings.map((l) => [l.id, l.workId]));
      appCounts.forEach((c) => {
        const wId = listingToWork.get(c.listingId);
        if (wId) {
          pendingApplicationCounts.set(wId, (pendingApplicationCounts.get(wId) || 0) + c._count._all);
        }
      });
    }
  }

  // 페이지 번호 배열 생성
  const getPageNumbers = (): (number | "ellipsis")[] => {
    const pages: (number | "ellipsis")[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("ellipsis");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };

  const hasAnyWorks = tabCounts.all > 0;
  const hasActiveFilters = currentTab !== "all" || currentLang || currentGenres.length > 0;

  return (
    <div className="max-w-6xl">
      {/* Page Header */}
      <header className="pb-10 border-b border-border mb-8">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
              Projects
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {isEditor ? "담당 프로젝트" : "번역 프로젝트"}
            </h1>
            {tabCounts.all > 0 && (
              <p className="text-lg text-muted-foreground mt-3">
                총 {tabCounts.all}개의 프로젝트
              </p>
            )}
          </div>
          {!isEditor && (
            <Button asChild size="lg" className="rounded-full px-8">
              <Link href="/works/new">새 프로젝트</Link>
            </Button>
          )}
        </div>
      </header>

      {/* 작품이 하나도 없을 때 */}
      {!hasAnyWorks ? (
        <div className="section-surface text-center py-24">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-6">
            <Languages className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-2xl font-medium mb-3">
            {isEditor ? "담당 프로젝트가 없습니다" : "프로젝트가 없습니다"}
          </p>
          <p className="text-lg text-muted-foreground mb-10 max-w-md mx-auto">
            {isEditor
              ? "마켓플레이스에서 프로젝트를 찾아보세요"
              : "첫 번역 프로젝트를 등록하고 AI 번역을 시작하세요"}
          </p>
          <Button asChild size="lg" className="rounded-full px-8">
            <Link href={isEditor ? "/marketplace" : "/works/new"}>
              {isEditor ? "마켓플레이스 둘러보기" : "새 프로젝트 시작하기"}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* Status Tabs */}
          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-full w-fit mb-6">
            {(Object.entries(WORK_STATUS_TABS) as [WorkStatusTab, typeof WORK_STATUS_TABS[WorkStatusTab]][]).map(
              ([key, config]) => {
                const isActive = currentTab === key;
                const count = tabCounts[key];
                return (
                  <Link
                    key={key}
                    href={buildWorksUrl({
                      tab: key,
                      page: 1,
                      lang: currentLang,
                      genres: currentGenres,
                    })}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
                      isActive
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {config.label}
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        isActive ? "text-foreground" : "text-muted-foreground/60"
                      )}
                    >
                      {count}
                    </span>
                  </Link>
                );
              }
            )}
          </div>

          {/* Filter Bar */}
          <div className="mb-8">
            <WorksFilterBar
              currentTab={currentTab}
              currentLang={currentLang}
              currentGenres={currentGenres}
            />
          </div>

          {/* Content */}
          {totalWorks === 0 ? (
            <div className="section-surface text-center py-16">
              <p className="text-lg font-medium mb-2">조건에 맞는 프로젝트가 없습니다</p>
              <p className="text-muted-foreground mb-6">
                다른 탭이나 필터 조건을 선택해보세요
              </p>
              {hasActiveFilters && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/works">필터 초기화</Link>
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {works.map((work, index) => {
                  const statusConfig = getWorkStatusConfig(work.status);
                  const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;
                  const pendingReviewCount = isEditor
                    ? (pendingReviewCounts.get(work.id) || 0)
                    : 0;
                  const pendingAppCount = !isEditor
                    ? (pendingApplicationCounts.get(work.id) || 0)
                    : 0;

                  return (
                    <WorkCardClient
                      key={work.id}
                      workId={work.id}
                      href={isEditor ? `/works/${work.id}/review` : `/works/${work.id}`}
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3 mb-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-xs text-muted-foreground tabular-nums">
                              #{String(globalIndex).padStart(2, '0')}
                            </span>
                            <Badge variant={statusConfig.variant} className="text-xs">
                              {statusConfig.label}
                            </Badge>
                            <TranslationStatusInline workId={work.id} />
                          </div>
                          <h2 className="text-lg font-semibold truncate group-hover:text-muted-foreground transition-colors">
                            {work.titleKo}
                          </h2>
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {work.titleOriginal}
                          </p>
                        </div>
                      </div>

                      {/* Synopsis */}
                      {work.synopsis && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-5 leading-relaxed">
                          {work.synopsis}
                        </p>
                      )}

                      {/* Genres */}
                      {work.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-5">
                          {work.genres.slice(0, 3).map((genre) => (
                            <span
                              key={genre}
                              className="text-xs text-muted-foreground px-2.5 py-1 rounded-md bg-muted"
                            >
                              {genre}
                            </span>
                          ))}
                          {work.genres.length > 3 && (
                            <span className="text-xs text-muted-foreground px-2.5 py-1 rounded-md bg-muted">
                              +{work.genres.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Card Footer */}
                      <div className="flex items-center justify-between pt-5 mt-auto border-t border-border">
                        <span className="text-base font-semibold tabular-nums">
                          {work._count.chapters}화
                        </span>
                        <div className="flex items-center gap-2">
                          {isEditor && pendingReviewCount > 0 && (
                            <Badge variant="default" className="text-xs">
                              검토 대기 {pendingReviewCount}건
                            </Badge>
                          )}
                          {!isEditor && pendingAppCount > 0 && (
                            <Badge variant="warning" className="text-xs">
                              지원 대기 {pendingAppCount}건
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {AGE_RATINGS[work.ageRating as keyof typeof AGE_RATINGS]}
                          </span>
                        </div>
                      </div>
                    </WorkCardClient>
                  );
                })}

                {/* Add new project card */}
                {!isEditor && currentPage === 1 && currentTab === "all" && !currentLang && currentGenres.length === 0 && (
                  <Link
                    href="/works/new"
                    className="project-card items-center justify-center min-h-[280px] border-dashed border-2 hover:border-muted-foreground"
                  >
                    <div className="text-center">
                      <p className="text-lg font-medium text-muted-foreground group-hover:text-foreground transition-colors mb-1">
                        새 프로젝트
                      </p>
                      <p className="text-sm text-muted-foreground">
                        AI 번역 시작하기
                      </p>
                    </div>
                  </Link>
                )}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 mt-10">
                  <Link
                    href={currentPage > 1
                      ? buildWorksUrl({ tab: currentTab, page: currentPage - 1, lang: currentLang, genres: currentGenres })
                      : "#"
                    }
                    className={`h-9 px-3 rounded-md text-sm flex items-center justify-center transition-colors ${
                      currentPage === 1
                        ? "pointer-events-none opacity-50"
                        : "hover:bg-muted"
                    }`}
                  >
                    이전
                  </Link>

                  <div className="flex items-center gap-1 mx-2">
                    {getPageNumbers().map((page, idx) =>
                      page === "ellipsis" ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                          ...
                        </span>
                      ) : (
                        <Link
                          key={page}
                          href={buildWorksUrl({ tab: currentTab, page: page as number, lang: currentLang, genres: currentGenres })}
                          className={`h-9 w-9 rounded-md text-sm flex items-center justify-center transition-colors tabular-nums ${
                            currentPage === page
                              ? "bg-foreground text-background"
                              : "hover:bg-muted"
                          }`}
                        >
                          {page}
                        </Link>
                      )
                    )}
                  </div>

                  <Link
                    href={currentPage < totalPages
                      ? buildWorksUrl({ tab: currentTab, page: currentPage + 1, lang: currentLang, genres: currentGenres })
                      : "#"
                    }
                    className={`h-9 px-3 rounded-md text-sm flex items-center justify-center transition-colors ${
                      currentPage >= totalPages
                        ? "pointer-events-none opacity-50"
                        : "hover:bg-muted"
                    }`}
                  >
                    다음
                  </Link>

                  <span className="ml-4 text-sm text-muted-foreground tabular-nums">
                    {currentPage} / {totalPages}
                  </span>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
