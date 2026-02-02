"use client";

import { UserRole } from "@prisma/client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EditorProvider,
  CollaborationEditor,
  useEditorContext,
} from "@/components/editor";
import { getChapterStatusConfig } from "@/lib/chapter-status";

// Inner component that uses the editor context
function ChapterEditorContent() {
  const params = useParams();
  const router = useRouter();

  const workId = params.id as string;
  const chapterNum = parseInt(params.num as string, 10);

  const { work, chapter, isLoading } = useEditorContext();

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!work || !chapter) {
    return (
      <div className="text-center py-20">
        <p className="text-xl font-medium mb-2">회차를 찾을 수 없습니다</p>
        <p className="text-muted-foreground mb-8">
          요청한 회차가 존재하지 않습니다.
        </p>
        <Button variant="outline" asChild>
          <Link href={`/works/${workId}`}>작품으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const statusConfig = getChapterStatusConfig(chapter.status);

  // Compute actual chapter number range from chapters array
  const chapterNumbers = work.chapters?.map((c) => c.number) ?? [];
  const minChapter = chapterNumbers.length > 0 ? Math.min(...chapterNumbers) : 0;
  const maxChapter = chapterNumbers.length > 0 ? Math.max(...chapterNumbers) : 0;

  return (
    <div className="h-[calc(100dvh-6rem)] sm:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-4rem)] flex flex-col">
      {/* Header */}
      <header className="shrink-0 pb-4 border-b border-border mb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <nav className="mb-2">
              <Link
                href={`/works/${workId}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← {work.titleKo}
              </Link>
            </nav>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">
                {chapter.number}화
                {chapter.title && (
                  <span className="text-muted-foreground ml-2 font-normal">
                    {chapter.title}
                  </span>
                )}
              </h1>
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {chapter.wordCount.toLocaleString()}자
            </p>
          </div>

          {/* Chapter Navigation */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={chapterNum <= minChapter}
              onClick={() =>
                router.push(`/works/${workId}/chapters/${chapterNum - 1}`)
              }
              aria-label="이전 회차"
            >
              ← 이전
            </Button>
            <span className="px-3 text-sm text-muted-foreground tabular-nums">
              {chapterNum} / {maxChapter}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={chapterNum >= maxChapter}
              onClick={() =>
                router.push(`/works/${workId}/chapters/${chapterNum + 1}`)
              }
              aria-label="다음 회차"
            >
              다음 →
            </Button>
          </div>
        </div>
      </header>

      {/* Collaboration Editor */}
      <div className="flex-1 min-h-0">
        <CollaborationEditor workId={workId} />
      </div>
    </div>
  );
}

// Main page component
export default function ChapterEditorPage() {
  const params = useParams();
  const { data: session } = useSession();

  const workId = params.id as string;
  const chapterNum = parseInt(params.num as string, 10);
  const userRole = (session?.user?.role as UserRole) || UserRole.AUTHOR;

  return (
    <EditorProvider workId={workId} chapterNum={chapterNum} userRole={userRole}>
      <ChapterEditorContent />
    </EditorProvider>
  );
}
