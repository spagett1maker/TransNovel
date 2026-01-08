import { BookOpen, FileText, Grid3X3, List, Plus, Search } from "lucide-react";
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
      _count: {
        select: { chapters: true },
      },
    },
  });

  return (
    <div className="space-y-8">
      {/* Decorative background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-gradient-to-br from-accent/20 via-transparent to-transparent rounded-full blur-3xl opacity-60" />
        <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-gradient-to-tl from-muted/40 via-transparent to-transparent rounded-full blur-3xl opacity-50" />
      </div>

      {/* Header */}
      <header className="animate-in">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
                Projects
              </p>
            </div>
            <h1 className="text-4xl font-bold tracking-tight">번역 프로젝트</h1>
            <p className="text-lg text-muted-foreground">
              진행중인 번역 프로젝트 {works.length > 0 && <span className="text-foreground font-semibold">{works.length}개</span>}
            </p>
          </div>
          <Button size="lg" className="rounded-2xl shadow-lg hover:shadow-xl transition-shadow" asChild>
            <Link href="/works/new">
              <Plus className="mr-2 h-5 w-5" />
              새 프로젝트
            </Link>
          </Button>
        </div>
      </header>

      {works.length === 0 ? (
        /* Empty State */
        <div className="bento-item animate-in animate-delay-1 py-20 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 mb-8">
            <BookOpen className="h-12 w-12 text-primary/60" />
          </div>
          <h2 className="text-2xl font-semibold mb-3">등록된 프로젝트가 없습니다</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto text-lg">
            첫 번역 프로젝트를 등록하고 AI 번역을 시작해보세요
          </p>
          <Button size="lg" className="rounded-2xl" asChild>
            <Link href="/works/new">
              <Plus className="mr-2 h-5 w-5" />
              첫 프로젝트 시작하기
            </Link>
          </Button>
        </div>
      ) : (
        /* Project Grid */
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {works.map((work, index) => {
            const statusConfig = getWorkStatusConfig(work.status);
            const progressPercent = work._count.chapters > 0 ? Math.min(100, work._count.chapters * 5) : 0;

            return (
              <Link
                key={work.id}
                href={`/works/${work.id}`}
                className="group animate-in"
                style={{ animationDelay: `${0.1 + index * 0.05}s` }}
              >
                <article className="bento-item h-full flex flex-col relative overflow-hidden">
                  {/* Hover gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  {/* Status indicator bar */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-muted overflow-hidden rounded-t-3xl">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-700"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* Content */}
                  <div className="relative flex-1 flex flex-col pt-2">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg leading-tight line-clamp-1 group-hover:text-primary transition-colors">
                          {work.titleKo}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                          {work.titleOriginal}
                        </p>
                      </div>
                      <Badge variant={statusConfig.variant} className="shrink-0">
                        {statusConfig.label}
                      </Badge>
                    </div>

                    {/* Synopsis */}
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
                      {work.synopsis}
                    </p>

                    {/* Genres */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {work.genres.slice(0, 3).map((genre) => (
                        <Badge
                          key={genre}
                          variant="secondary"
                          className="text-xs bg-muted/60 hover:bg-muted transition-colors"
                        >
                          {genre}
                        </Badge>
                      ))}
                      {work.genres.length > 3 && (
                        <Badge variant="secondary" className="text-xs bg-muted/60">
                          +{work.genres.length - 3}
                        </Badge>
                      )}
                    </div>

                    {/* Footer stats */}
                    <div className="flex items-center justify-between pt-4 border-t border-border/50">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <span className="font-semibold">{work._count.chapters}</span>
                          <span className="text-muted-foreground ml-1">화</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {AGE_RATINGS[work.ageRating as keyof typeof AGE_RATINGS]}
                      </Badge>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}

          {/* Add new project card */}
          <Link href="/works/new" className="group animate-in" style={{ animationDelay: `${0.1 + works.length * 0.05}s` }}>
            <div className="bento-item h-full min-h-[280px] flex flex-col items-center justify-center border-2 border-dashed border-border/60 hover:border-primary/40 bg-transparent hover:bg-primary/5 transition-all duration-300">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 group-hover:bg-primary/10 transition-colors mb-4">
                <Plus className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <p className="text-lg font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                새 프로젝트 추가
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                AI 번역 시작하기
              </p>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
