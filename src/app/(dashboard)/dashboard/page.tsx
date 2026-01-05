import { BookOpen, FileText, Languages, Plus } from "lucide-react";
import Link from "next/link";
import { getServerSession } from "next-auth";

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

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  const [worksCount, chaptersCount, translatedCount] = await Promise.all([
    db.work.count({ where: { authorId: session?.user.id } }),
    db.chapter.count({
      where: { work: { authorId: session?.user.id } },
    }),
    db.chapter.count({
      where: {
        work: { authorId: session?.user.id },
        status: { in: ["TRANSLATED", "EDITED", "APPROVED"] },
      },
    }),
  ]);

  const recentWorks = await db.work.findMany({
    where: { authorId: session?.user.id },
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: {
      _count: {
        select: { chapters: true },
      },
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            안녕하세요, {session?.user.name}님
          </h1>
          <p className="text-gray-500">오늘도 멋진 번역을 시작해보세요</p>
        </div>
        <Button asChild>
          <Link href="/works/new">
            <Plus className="mr-2 h-4 w-4" />새 작품 등록
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">등록 작품</CardTitle>
            <BookOpen className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{worksCount}개</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">총 회차</CardTitle>
            <FileText className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{chaptersCount}화</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">번역 완료</CardTitle>
            <Languages className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{translatedCount}화</div>
            <p className="text-xs text-gray-500">
              {chaptersCount > 0
                ? `${Math.round((translatedCount / chaptersCount) * 100)}%`
                : "0%"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Works */}
      <Card>
        <CardHeader>
          <CardTitle>최근 작품</CardTitle>
          <CardDescription>최근에 작업한 작품 목록입니다</CardDescription>
        </CardHeader>
        <CardContent>
          {recentWorks.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              <BookOpen className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2">등록된 작품이 없습니다</p>
              <Button asChild className="mt-4" variant="outline">
                <Link href="/works/new">첫 작품 등록하기</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {recentWorks.map((work: (typeof recentWorks)[number]) => (
                <Link
                  key={work.id}
                  href={`/works/${work.id}`}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-gray-50"
                >
                  <div>
                    <h3 className="font-medium">{work.titleKo}</h3>
                    <p className="text-sm text-gray-500">
                      {work.titleOriginal}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {work._count.chapters}화
                    </p>
                    <p className="text-xs text-gray-500">
                      {work.genres.slice(0, 2).join(", ")}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
