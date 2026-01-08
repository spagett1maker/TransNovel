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
    <div className="space-y-16">
      {/* Header */}
      <header className="flex items-end justify-between">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Projects</p>
          <h1 className="text-5xl font-medium tracking-tight">번역 프로젝트</h1>
          {works.length > 0 && (
            <p className="text-xl text-muted-foreground">
              {works.length}개의 프로젝트
            </p>
          )}
        </div>
        <Button asChild size="lg" className="rounded-full px-8">
          <Link href="/works/new">새 프로젝트</Link>
        </Button>
      </header>

      {/* Content */}
      {works.length === 0 ? (
        <div className="py-32 text-center">
          <p className="text-3xl font-medium mb-4">프로젝트가 없습니다</p>
          <p className="text-xl text-muted-foreground mb-12">
            첫 번역 프로젝트를 등록하고 AI 번역을 시작하세요
          </p>
          <Button asChild size="lg" className="rounded-full px-8">
            <Link href="/works/new">시작하기</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {works.map((work) => {
            const statusConfig = getWorkStatusConfig(work.status);

            return (
              <Link
                key={work.id}
                href={`/works/${work.id}`}
                className="group block p-8 rounded-3xl border border-border hover:bg-muted/50 transition-colors"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-medium truncate group-hover:text-muted-foreground transition-colors">
                      {work.titleKo}
                    </h2>
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      {work.titleOriginal}
                    </p>
                  </div>
                  <Badge variant={statusConfig.variant} className="shrink-0">
                    {statusConfig.label}
                  </Badge>
                </div>

                {/* Synopsis */}
                <p className="text-sm text-muted-foreground line-clamp-2 mb-6">
                  {work.synopsis}
                </p>

                {/* Genres */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {work.genres.slice(0, 3).map((genre) => (
                    <span
                      key={genre}
                      className="text-xs text-muted-foreground px-3 py-1 rounded-full bg-muted"
                    >
                      {genre}
                    </span>
                  ))}
                  {work.genres.length > 3 && (
                    <span className="text-xs text-muted-foreground px-3 py-1 rounded-full bg-muted">
                      +{work.genres.length - 3}
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-6 border-t border-border">
                  <span className="text-lg font-medium tabular-nums">
                    {work._count.chapters}화
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {AGE_RATINGS[work.ageRating as keyof typeof AGE_RATINGS]}
                  </span>
                </div>
              </Link>
            );
          })}

          {/* Add new project card */}
          <Link
            href="/works/new"
            className="group flex flex-col items-center justify-center p-8 rounded-3xl border-2 border-dashed border-border hover:border-muted-foreground/50 transition-colors min-h-[280px]"
          >
            <p className="text-xl font-medium text-muted-foreground group-hover:text-foreground transition-colors mb-2">
              새 프로젝트
            </p>
            <p className="text-sm text-muted-foreground">
              AI 번역 시작하기
            </p>
          </Link>
        </div>
      )}
    </div>
  );
}
