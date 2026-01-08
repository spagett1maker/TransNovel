"use client";

import { ChapterStatus, UserRole } from "@prisma/client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getChapterStatusConfig } from "@/lib/chapter-status";
import { getAvailableNextStatuses, getStatusDisplayName } from "@/lib/permissions";

interface Chapter {
  id: string;
  number: number;
  title: string | null;
  originalContent: string;
  translatedContent: string | null;
  editedContent: string | null;
  status: ChapterStatus;
  wordCount: number;
}

interface Work {
  id: string;
  titleKo: string;
  titleOriginal: string;
  _count: {
    chapters: number;
  };
}

type ViewMode = "side-by-side" | "original" | "translated" | "edit";

export default function ChapterReaderPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();

  const workId = params.id as string;
  const chapterNum = parseInt(params.num as string, 10);

  const [work, setWork] = useState<Work | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [editedContent, setEditedContent] = useState("");

  const userRole = (session?.user?.role as UserRole) || UserRole.AUTHOR;

  useEffect(() => {
    fetchData();
  }, [workId, chapterNum]);

  async function fetchData() {
    setIsLoading(true);
    try {
      const [workRes, chapterRes] = await Promise.all([
        fetch(`/api/works/${workId}`),
        fetch(`/api/works/${workId}/chapters/${chapterNum}`),
      ]);

      if (!workRes.ok || !chapterRes.ok) {
        throw new Error("Failed to fetch data");
      }

      const workData = await workRes.json();
      const chapterData = await chapterRes.json();

      setWork(workData);
      setChapter(chapterData);
      setEditedContent(chapterData.editedContent || chapterData.translatedContent || "");
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!chapter) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/works/${workId}/chapters/${chapterNum}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editedContent }),
        }
      );

      if (!response.ok) throw new Error("Failed to save");

      const updatedChapter = await response.json();
      setChapter(updatedChapter);
    } catch (error) {
      console.error("Error saving:", error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(newStatus: ChapterStatus) {
    if (!chapter) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/works/${workId}/chapters/${chapterNum}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: newStatus,
            editedContent: editedContent || chapter.translatedContent,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "상태 변경에 실패했습니다.");
        return;
      }

      const updatedChapter = await response.json();
      setChapter(updatedChapter);
    } catch (error) {
      console.error("Error changing status:", error);
    } finally {
      setIsSaving(false);
    }
  }

  const availableStatuses = chapter
    ? getAvailableNextStatuses(userRole, chapter.status)
    : [];

  const hasTranslation = chapter && ["TRANSLATED", "EDITED", "APPROVED", "REVIEWING"].includes(chapter.status);
  const translatedText = chapter?.editedContent || chapter?.translatedContent;

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
        <p className="text-muted-foreground mb-8">요청한 회차가 존재하지 않습니다.</p>
        <Button variant="outline" asChild>
          <Link href={`/works/${workId}`}>작품으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const statusConfig = getChapterStatusConfig(chapter.status);

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col">
      {/* Header */}
      <header className="shrink-0 pb-6 border-b border-border mb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <nav className="mb-3">
              <Link
                href={`/works/${workId}`}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← {work.titleKo}
              </Link>
            </nav>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {chapter.number}화
                {chapter.title && <span className="text-muted-foreground ml-2 font-normal">{chapter.title}</span>}
              </h1>
              <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {chapter.wordCount.toLocaleString()}자
            </p>
          </div>

          {/* Navigation & Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Chapter Navigation */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={chapterNum <= 1}
                onClick={() => router.push(`/works/${workId}/chapters/${chapterNum - 1}`)}
              >
                ← 이전
              </Button>
              <span className="px-3 text-sm text-muted-foreground tabular-nums">
                {chapterNum} / {work._count.chapters}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={chapterNum >= work._count.chapters}
                onClick={() => router.push(`/works/${workId}/chapters/${chapterNum + 1}`)}
              >
                다음 →
              </Button>
            </div>

            {/* Status Change */}
            {availableStatuses.length > 0 && (
              <div className="flex gap-1 ml-2">
                {availableStatuses.map((status) => (
                  <Button
                    key={status}
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange(status)}
                    disabled={isSaving}
                  >
                    {getStatusDisplayName(status)}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* View Mode Tabs */}
      <div className="shrink-0 flex items-center gap-6 mb-6">
        <div className="flex gap-1">
          {[
            { mode: "side-by-side" as ViewMode, label: "비교 보기" },
            { mode: "original" as ViewMode, label: "원문만" },
            { mode: "translated" as ViewMode, label: "번역문만", disabled: !hasTranslation },
            { mode: "edit" as ViewMode, label: "편집" },
          ].map(({ mode, label, disabled }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              disabled={disabled}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                viewMode === mode
                  ? "bg-foreground text-background"
                  : disabled
                    ? "text-muted-foreground/50 cursor-not-allowed"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {viewMode === "edit" && (
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "저장 중..." : "저장"}
          </Button>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === "side-by-side" && (
          <div className="grid grid-cols-2 gap-6 h-full">
            {/* Original */}
            <div className="flex flex-col h-full">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3 shrink-0">
                원문
              </h2>
              <div className="flex-1 overflow-y-auto rounded-xl bg-muted/50 p-6">
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-transparent p-0 m-0">
                    {chapter.originalContent}
                  </pre>
                </div>
              </div>
            </div>

            {/* Translated */}
            <div className="flex flex-col h-full">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3 shrink-0">
                번역문
              </h2>
              <div className="flex-1 overflow-y-auto rounded-xl bg-muted/50 p-6">
                {translatedText ? (
                  <div className="prose prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-transparent p-0 m-0">
                      {translatedText}
                    </pre>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-muted-foreground mb-4">아직 번역되지 않았습니다</p>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/works/${workId}/translate`}>번역 시작</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {viewMode === "original" && (
          <div className="h-full overflow-y-auto rounded-xl bg-muted/50 p-8">
            <div className="max-w-3xl mx-auto">
              <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-foreground">
                {chapter.originalContent}
              </pre>
            </div>
          </div>
        )}

        {viewMode === "translated" && (
          <div className="h-full overflow-y-auto rounded-xl bg-muted/50 p-8">
            <div className="max-w-3xl mx-auto">
              {translatedText ? (
                <pre className="whitespace-pre-wrap font-sans text-base leading-relaxed text-foreground">
                  {translatedText}
                </pre>
              ) : (
                <div className="text-center py-20">
                  <p className="text-muted-foreground">번역된 내용이 없습니다</p>
                </div>
              )}
            </div>
          </div>
        )}

        {viewMode === "edit" && (
          <div className="grid grid-cols-2 gap-6 h-full">
            {/* Reference - Original */}
            <div className="flex flex-col h-full">
              <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-3 shrink-0">
                원문 (참조)
              </h2>
              <div className="flex-1 overflow-y-auto rounded-xl bg-muted/50 p-6">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                  {chapter.originalContent}
                </pre>
              </div>
            </div>

            {/* Editor */}
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <h2 className="text-xs uppercase tracking-widest text-muted-foreground">
                  편집
                </h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {editedContent.length.toLocaleString()}자
                </span>
              </div>
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="flex-1 resize-none rounded-xl bg-background text-sm leading-relaxed p-6 font-sans"
                placeholder="번역문을 수정하세요..."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
