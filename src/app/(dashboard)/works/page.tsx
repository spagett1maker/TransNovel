import { BookOpen, Plus } from "lucide-react";
import Link from "next/link";
import { getServerSession } from "next-auth";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGE_RATINGS, WORK_STATUS } from "@/lib/validations/work";

export default async function WorksPage() {
  const session = await getServerSession(authOptions);

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
          <h1 className="text-3xl font-bold">내 작품</h1>
          <p className="text-gray-500">등록한 작품 목록입니다</p>
        </div>
        <Button asChild>
          <Link href="/works/new">
            <Plus className="mr-2 h-4 w-4" />새 작품 등록
          </Link>
        </Button>
      </div>

      {works.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <BookOpen className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-lg font-medium">등록된 작품이 없습니다</h3>
            <p className="mt-2 text-gray-500">
              첫 작품을 등록하고 AI 번역을 시작해보세요
            </p>
            <Button asChild className="mt-4">
              <Link href="/works/new">
                <Plus className="mr-2 h-4 w-4" />새 작품 등록
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {works.map((work) => (
            <Link key={work.id} href={`/works/${work.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="line-clamp-1">
                        {work.titleKo}
                      </CardTitle>
                      <CardDescription className="line-clamp-1">
                        {work.titleOriginal}
                      </CardDescription>
                    </div>
                    <Badge variant="outline">
                      {WORK_STATUS[work.status as keyof typeof WORK_STATUS]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <p className="line-clamp-2 text-sm text-gray-600">
                      {work.synopsis}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {work.genres.slice(0, 3).map((genre) => (
                        <Badge key={genre} variant="secondary" className="text-xs">
                          {genre}
                        </Badge>
                      ))}
                      {work.genres.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{work.genres.length - 3}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>{work._count.chapters}화</span>
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
