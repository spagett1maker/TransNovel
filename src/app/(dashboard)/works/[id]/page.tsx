import {
  ArrowLeft,
  BookOpen,
  Edit,
  FileText,
  Languages,
  List,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { AGE_RATINGS, WORK_STATUS } from "@/lib/validations/work";

const CHAPTER_STATUS_LABELS = {
  PENDING: { label: "대기", color: "bg-gray-100 text-gray-700" },
  TRANSLATING: { label: "번역중", color: "bg-yellow-100 text-yellow-700" },
  TRANSLATED: { label: "번역완료", color: "bg-blue-100 text-blue-700" },
  REVIEWING: { label: "검토중", color: "bg-purple-100 text-purple-700" },
  EDITED: { label: "윤문완료", color: "bg-green-100 text-green-700" },
  APPROVED: { label: "승인", color: "bg-green-200 text-green-800" },
};

export default async function WorkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { id } = await params;

  if (!session) {
    redirect("/login");
  }

  const work = await db.work.findUnique({
    where: { id },
    include: {
      creators: true,
      chapters: {
        orderBy: { number: "asc" },
        take: 20,
      },
      glossary: {
        take: 10,
      },
      _count: {
        select: { chapters: true, glossary: true },
      },
    },
  });

  if (!work) {
    notFound();
  }

  if (work.authorId !== session.user.id) {
    redirect("/works");
  }

  const translatedCount = await db.chapter.count({
    where: {
      workId: id,
      status: { in: ["TRANSLATED", "EDITED", "APPROVED"] },
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/works">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{work.titleKo}</h1>
            <Badge variant="outline">
              {WORK_STATUS[work.status as keyof typeof WORK_STATUS]}
            </Badge>
            <Badge variant="secondary">
              {AGE_RATINGS[work.ageRating as keyof typeof AGE_RATINGS]}
            </Badge>
          </div>
          <p className="text-gray-500">{work.titleOriginal}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/works/${id}/edit`}>
            <Edit className="mr-2 h-4 w-4" />
            수정
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">총 회차</CardTitle>
            <FileText className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{work._count.chapters}화</div>
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
              {work._count.chapters > 0
                ? `${Math.round((translatedCount / work._count.chapters) * 100)}%`
                : "0%"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">용어집</CardTitle>
            <BookOpen className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{work._count.glossary}개</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">장르</CardTitle>
            <List className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {work.genres.slice(0, 3).map((genre: string) => (
                <Badge key={genre} variant="secondary" className="text-xs">
                  {genre}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-4">
        <Button asChild>
          <Link href={`/works/${id}/chapters`}>
            <Plus className="mr-2 h-4 w-4" />
            회차 업로드
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/works/${id}/translate`}>
            <Languages className="mr-2 h-4 w-4" />
            번역 시작
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/works/${id}/glossary`}>
            <BookOpen className="mr-2 h-4 w-4" />
            용어집 관리
          </Link>
        </Button>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">작품 정보</TabsTrigger>
          <TabsTrigger value="chapters">
            회차 목록 ({work._count.chapters})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>줄거리</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-gray-700">
                {work.synopsis}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>작가 정보</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {work.creators.map((creator) => (
                  <div key={creator.id} className="flex items-center gap-2">
                    <Badge variant="outline">
                      {creator.role === "WRITER"
                        ? "글"
                        : creator.role === "ARTIST"
                          ? "그림"
                          : "각색"}
                    </Badge>
                    <span>{creator.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>출판 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">제작사/출판사</span>
                <span>{work.publisher}</span>
              </div>
              {work.platformName && (
                <div className="flex justify-between">
                  <span className="text-gray-500">연재처</span>
                  <span>
                    {work.platformUrl ? (
                      <a
                        href={work.platformUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {work.platformName}
                      </a>
                    ) : (
                      work.platformName
                    )}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chapters" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>회차 목록</CardTitle>
                <CardDescription>
                  등록된 회차를 관리합니다
                </CardDescription>
              </div>
              <Button asChild>
                <Link href={`/works/${id}/chapters`}>
                  <Plus className="mr-2 h-4 w-4" />
                  회차 추가
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {work.chapters.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <FileText className="mx-auto h-12 w-12 text-gray-300" />
                  <p className="mt-2">등록된 회차가 없습니다</p>
                  <Button asChild className="mt-4" variant="outline">
                    <Link href={`/works/${id}/chapters`}>첫 회차 업로드</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {work.chapters.map((chapter) => {
                    const statusInfo =
                      CHAPTER_STATUS_LABELS[
                        chapter.status as keyof typeof CHAPTER_STATUS_LABELS
                      ];
                    return (
                      <Link
                        key={chapter.id}
                        href={`/works/${id}/chapters/${chapter.number}`}
                        className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium">
                            {chapter.number}화
                          </span>
                          {chapter.title && (
                            <span className="text-gray-500">
                              {chapter.title}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-500">
                            {chapter.wordCount.toLocaleString()}자
                          </span>
                          <Badge className={statusInfo.color} variant="outline">
                            {statusInfo.label}
                          </Badge>
                        </div>
                      </Link>
                    );
                  })}
                  {work._count.chapters > 20 && (
                    <div className="pt-4 text-center">
                      <Button variant="outline" asChild>
                        <Link href={`/works/${id}/chapters`}>
                          전체 회차 보기 ({work._count.chapters}화)
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
