import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WorkCardClient, TranslationStatusInline } from "@/components/works/work-card-client";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGE_RATINGS } from "@/lib/validations/work";
import { getWorkStatusConfig } from "@/lib/work-status";

const ITEMS_PER_PAGE = 12;

export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getSession();
  const { page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  // 총 작품 수 조회
  const totalWorks = await db.work.count({
    where: { authorId: session?.user.id },
  });

  const totalPages = Math.ceil(totalWorks / ITEMS_PER_PAGE);

  // 페이지네이션된 작품 목록 조회
  const works = await db.work.findMany({
    where: { authorId: session?.user.id },
    orderBy: { updatedAt: "desc" },
    skip: (currentPage - 1) * ITEMS_PER_PAGE,
    take: ITEMS_PER_PAGE,
    include: {
      creators: true,
      _count: { select: { chapters: true } },
    },
  });

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

  return (
    <div className="max-w-6xl">
      {/* Page Header */}
      <header className="pb-10 border-b border-border mb-10">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
              Projects
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">
              번역 프로젝트
            </h1>
            {totalWorks > 0 && (
              <p className="text-lg text-muted-foreground mt-3">
                총 {totalWorks}개의 프로젝트
              </p>
            )}
          </div>
          <Button asChild size="lg" className="rounded-full px-8">
            <Link href="/works/new">새 프로젝트</Link>
          </Button>
        </div>
      </header>

      {/* Content */}
      {totalWorks === 0 ? (
        <div className="section-surface text-center py-24">
          <p className="text-2xl font-medium mb-3">프로젝트가 없습니다</p>
          <p className="text-lg text-muted-foreground mb-10">
            첫 번역 프로젝트를 등록하고 AI 번역을 시작하세요
          </p>
          <Button asChild size="lg" className="rounded-full px-8">
            <Link href="/works/new">시작하기</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {works.map((work, index) => {
              const statusConfig = getWorkStatusConfig(work.status);
              const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index + 1;

              return (
                <WorkCardClient
                  key={work.id}
                  workId={work.id}
                  href={`/works/${work.id}`}
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
                        {/* 번역 상태 배지 (클라이언트 측) */}
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
                    <span className="text-xs text-muted-foreground">
                      {AGE_RATINGS[work.ageRating as keyof typeof AGE_RATINGS]}
                    </span>
                  </div>
                </WorkCardClient>
              );
            })}

            {/* Add new project card - only on first page */}
            {currentPage === 1 && (
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
                href={currentPage > 1 ? `/works?page=${currentPage - 1}` : "#"}
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
                      href={`/works?page=${page}`}
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
                href={currentPage < totalPages ? `/works?page=${currentPage + 1}` : "#"}
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
    </div>
  );
}
