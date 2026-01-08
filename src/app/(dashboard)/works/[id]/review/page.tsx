"use client";

import { ChapterStatus, UserRole } from "@prisma/client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getChapterStatusConfig } from "@/lib/chapter-status";
import { getStatusDisplayName, getAvailableNextStatuses } from "@/lib/permissions";

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
  author: {
    name: string;
  };
  chapters: Chapter[];
}

type ViewMode = "compare" | "edit";

export default function ReviewPage() {
  const params = useParams();
  const { data: session } = useSession();
  const workId = params.id as string;

  const [work, setWork] = useState<Work | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("compare");

  const userRole = (session?.user?.role as UserRole) || UserRole.AUTHOR;

  useEffect(() => {
    fetchWork();
  }, [workId]);

  async function fetchWork() {
    try {
      const response = await fetch(`/api/works/${workId}`);
      if (!response.ok) throw new Error("Failed to fetch work");
      const data = await response.json();
      setWork(data);

      const pendingChapter = data.chapters.find(
        (c: Chapter) => c.status === "TRANSLATED" || c.status === "REVIEWING"
      );
      if (pendingChapter) {
        setSelectedChapter(pendingChapter);
        setEditedContent(pendingChapter.editedContent || pendingChapter.translatedContent || "");
      }
    } catch (error) {
      console.error("Error fetching work:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!selectedChapter) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/works/${workId}/chapters/${selectedChapter.number}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editedContent }),
        }
      );

      if (!response.ok) throw new Error("Failed to save");

      const updatedChapter = await response.json();
      setWork((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chapters: prev.chapters.map((c) =>
            c.id === updatedChapter.id ? updatedChapter : c
          ),
        };
      });
      setSelectedChapter(updatedChapter);
    } catch (error) {
      console.error("Error saving:", error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(newStatus: ChapterStatus) {
    if (!selectedChapter) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/works/${workId}/chapters/${selectedChapter.number}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: newStatus,
            editedContent: editedContent || selectedChapter.translatedContent,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "상태 변경에 실패했습니다.");
        return;
      }

      const updatedChapter = await response.json();
      setWork((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chapters: prev.chapters.map((c) =>
            c.id === updatedChapter.id ? updatedChapter : c
          ),
        };
      });
      setSelectedChapter(updatedChapter);
    } catch (error) {
      console.error("Error changing status:", error);
    } finally {
      setIsSaving(false);
    }
  }

  function selectChapter(chapter: Chapter) {
    setSelectedChapter(chapter);
    setEditedContent(chapter.editedContent || chapter.translatedContent || "");
  }

  const availableStatuses = selectedChapter
    ? getAvailableNextStatuses(userRole, selectedChapter.status)
    : [];

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

  if (!work) {
    return (
      <div className="text-center py-20">
        <p className="text-xl font-medium mb-2">작품을 찾을 수 없습니다</p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/works">작품 목록으로</Link>
        </Button>
      </div>
    );
  }

  const reviewableChapters = work.chapters.filter(
    (c) =>
      c.status === "TRANSLATED" ||
      c.status === "REVIEWING" ||
      c.status === "EDITED" ||
      c.status === "APPROVED"
  );

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col">
      {/* Header */}
      <header className="shrink-0 pb-6 border-b border-border mb-6">
        <nav className="mb-3">
          <Link
            href="/works"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← 프로젝트 목록
          </Link>
        </nav>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{work.titleKo}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {work.titleOriginal} · {work.author?.name}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">검토 대기</p>
            <p className="text-2xl font-semibold tabular-nums">
              {reviewableChapters.filter((c) => c.status === "TRANSLATED").length}
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 min-h-0 grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Chapter List */}
        <aside className="flex flex-col min-h-0">
          <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-4 shrink-0">
            검토 가능한 회차
          </h2>
          <div className="flex-1 overflow-y-auto space-y-1">
            {reviewableChapters.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                검토 가능한 회차가 없습니다
              </p>
            ) : (
              reviewableChapters.map((chapter) => {
                const statusConfig = getChapterStatusConfig(chapter.status);
                const isSelected = selectedChapter?.id === chapter.id;

                return (
                  <button
                    key={chapter.id}
                    onClick={() => selectChapter(chapter)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors ${
                      isSelected
                        ? "bg-foreground text-background"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium truncate ${isSelected ? "" : ""}`}>
                        {chapter.number}화
                        {chapter.title && (
                          <span className={`font-normal ml-1 ${isSelected ? "opacity-70" : "text-muted-foreground"}`}>
                            {chapter.title}
                          </span>
                        )}
                      </p>
                      <p className={`text-xs mt-0.5 ${isSelected ? "opacity-70" : "text-muted-foreground"}`}>
                        {chapter.wordCount.toLocaleString()}자
                      </p>
                    </div>
                    <Badge
                      variant={isSelected ? "secondary" : statusConfig.variant}
                      className="text-xs shrink-0 ml-2"
                    >
                      {statusConfig.label}
                    </Badge>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Content Editor */}
        {selectedChapter ? (
          <div className="flex flex-col min-h-0">
            {/* Chapter Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold">
                  {selectedChapter.number}화
                  {selectedChapter.title && (
                    <span className="text-muted-foreground font-normal ml-2">{selectedChapter.title}</span>
                  )}
                </h2>
                <Badge variant={getChapterStatusConfig(selectedChapter.status).variant}>
                  {getStatusDisplayName(selectedChapter.status)}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {/* View Mode Toggle */}
                <div className="flex gap-1 mr-2">
                  <button
                    onClick={() => setViewMode("compare")}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      viewMode === "compare"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    비교
                  </button>
                  <button
                    onClick={() => setViewMode("edit")}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      viewMode === "edit"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    편집
                  </button>
                </div>

                {viewMode === "edit" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? "저장 중..." : "저장"}
                  </Button>
                )}

                {availableStatuses.map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    onClick={() => handleStatusChange(status)}
                    disabled={isSaving}
                  >
                    {getStatusDisplayName(status)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {viewMode === "compare" ? (
                <div className="grid grid-cols-2 gap-4 h-full">
                  <div className="flex flex-col h-full">
                    <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2 shrink-0">
                      원문
                    </h3>
                    <div className="flex-1 overflow-y-auto rounded-xl bg-muted/50 p-5">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                        {selectedChapter.originalContent}
                      </pre>
                    </div>
                  </div>
                  <div className="flex flex-col h-full">
                    <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2 shrink-0">
                      번역문
                    </h3>
                    <div className="flex-1 overflow-y-auto rounded-xl bg-muted/50 p-5">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                        {selectedChapter.editedContent ||
                          selectedChapter.translatedContent ||
                          "번역된 내용이 없습니다."}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 h-full">
                  <div className="flex flex-col h-full">
                    <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-2 shrink-0">
                      원문 (참조)
                    </h3>
                    <div className="flex-1 overflow-y-auto rounded-xl bg-muted/50 p-5">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                        {selectedChapter.originalContent}
                      </pre>
                    </div>
                  </div>
                  <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between mb-2 shrink-0">
                      <h3 className="text-xs uppercase tracking-widest text-muted-foreground">
                        편집
                      </h3>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {editedContent.length.toLocaleString()}자
                      </span>
                    </div>
                    <Textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="flex-1 resize-none rounded-xl bg-background text-sm leading-relaxed p-5 font-sans"
                      placeholder="번역문을 수정하세요..."
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <p className="text-muted-foreground">회차를 선택하세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
