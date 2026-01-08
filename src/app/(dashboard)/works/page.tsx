import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGE_RATINGS } from "@/lib/validations/work";
import { getWorkStatusConfig } from "@/lib/work-status";

export default async function WorksPage() {
  const session = await getSession();

  const works = await db.work.findMany({
    where: { authorId: session?.user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      creators: true,
      _count: { select: { chapters: true } },
    },
  });

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
            {works.length > 0 && (
              <p className="text-lg text-muted-foreground mt-3">
                총 {works.length}개의 프로젝트
              </p>
            )}
          </div>
          <Button asChild size="lg" className="rounded-full px-8">
            <Link href="/works/new">새 프로젝트</Link>
          </Button>
        </div>
      </header>

      {/* Content */}
      {works.length === 0 ? (
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
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {works.map((work, index) => {
            const statusConfig = getWorkStatusConfig(work.status);

            return (
              <Link
                key={work.id}
                href={`/works/${work.id}`}
                className="project-card group"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        #{String(index + 1).padStart(2, '0')}
                      </span>
                      <Badge variant={statusConfig.variant} className="text-xs">
                        {statusConfig.label}
                      </Badge>
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
              </Link>
            );
          })}

          {/* Add new project card */}
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
        </div>
      )}
    </div>
  );
}
