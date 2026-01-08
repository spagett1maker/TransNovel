import { BookOpen, Plus } from "lucide-react";
import Link from "next/link";

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">번역 프로젝트</h1>
          <p className="mt-1 text-muted-foreground">진행중인 번역 프로젝트 목록입니다</p>
        </div>
        <Button asChild>
          <Link href="/works/new">
            <Plus className="mr-2 h-4 w-4" />새 프로젝트
          </Link>
        </Button>
      </div>

      {works.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="py-16 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <BookOpen className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="mt-4 text-lg font-medium text-foreground">등록된 프로젝트가 없습니다</h3>
            <p className="mt-2 text-muted-foreground">
              첫 번역 프로젝트를 등록하고 AI 번역을 시작해보세요
            </p>
            <Button asChild className="mt-4">
              <Link href="/works/new">
                <Plus className="mr-2 h-4 w-4" />새 프로젝트
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {works.map((work) => (
            <Link key={work.id} href={`/works/${work.id}`}>
              <Card className="h-full border-border/60 shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <CardTitle className="line-clamp-1 text-base">
                        {work.titleKo}
                      </CardTitle>
                      <CardDescription className="line-clamp-1 text-sm">
                        {work.titleOriginal}
                      </CardDescription>
                    </div>
                    <Badge variant={getWorkStatusConfig(work.status).variant} className="shrink-0 text-xs">
                      {getWorkStatusConfig(work.status).label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {work.synopsis}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {work.genres.slice(0, 3).map((genre) => (
                        <Badge key={genre} variant="secondary" className="text-xs bg-muted/80">
                          {genre}
                        </Badge>
                      ))}
                      {work.genres.length > 3 && (
                        <Badge variant="secondary" className="text-xs bg-muted/80">
                          +{work.genres.length - 3}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground pt-1">
                      <span className="font-medium">{work._count.chapters}화</span>
                      <span>
                        {AGE_RATINGS[work.ageRating as keyof typeof AGE_RATINGS]}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
