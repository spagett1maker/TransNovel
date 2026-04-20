"use client";

import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Square,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { ChapterStatus } from "@prisma/client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/contexts/translation-context";
import { ChapterDownloadButton } from "@/components/download/chapter-download-button";
import { getChapterStatusConfig } from "@/lib/chapter-status";
import { cn } from "@/lib/utils";

interface Chapter {
  id: string;
  number: number;
  title: string | null;
  translatedTitle: string | null;
  status: ChapterStatus | string;
  wordCount: number;
  volume?: string | null;
  volumeNumber?: number | null;
}

interface ChapterListProps {
  workId: string;
  chapters: Chapter[];
  itemsPerPage?: number;
  canDelete?: boolean;
}

export function ChapterList({ workId, chapters = [], itemsPerPage = 30, canDelete = false }: ChapterListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingChapter, setDeletingChapter] = useState<Chapter | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // 일괄 선택 모드
  const [selectMode, setSelectMode] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const router = useRouter();
  const { getJobByWorkId } = useTranslation();

  const handleDeleteChapter = async () => {
    if (!deletingChapter) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/works/${workId}/chapters/${deletingChapter.number}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "삭제에 실패했습니다");
        return;
      }
      toast.success(`${deletingChapter.number}화가 삭제되었습니다`);
      setDeletingChapter(null);
      router.refresh();
    } catch {
      toast.error("삭제에 실패했습니다");
    } finally {
      setIsDeleting(false);
    }
  };

  // 일괄 삭제
  const handleBulkDelete = async () => {
    if (selectedChapters.size === 0) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/works/${workId}/chapters/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterNumbers: Array.from(selectedChapters) }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "일괄 삭제에 실패했습니다");
        return;
      }
      const data = await res.json();
      toast.success(`${data.deleted}개 회차가 삭제되었습니다`);
      setSelectedChapters(new Set());
      setSelectMode(false);
      setShowBulkDeleteConfirm(false);
      router.refresh();
    } catch {
      toast.error("일괄 삭제에 실패했습니다");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelectedChapters(new Set());
      return !prev;
    });
  }, []);

  const toggleChapter = useCallback((number: number) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    setSelectedChapters((prev) => {
      const pageNumbers = paginatedChapters.map((ch) => ch.number);
      const allSelected = pageNumbers.every((n) => prev.has(n));
      const next = new Set(prev);
      if (allSelected) {
        pageNumbers.forEach((n) => next.delete(n));
      } else {
        pageNumbers.forEach((n) => next.add(n));
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedChapters((prev) => {
      if (prev.size === safeChapters.length) {
        return new Set();
      }
      return new Set(safeChapters.map((ch) => ch.number));
    });
  }, []);

  // 현재 작품의 번역 작업 확인
  const job = getJobByWorkId(workId);
  const isTranslating = job && (job.status === "PENDING" || job.status === "IN_PROGRESS");
  const currentTranslatingChapter = isTranslating ? job.currentChapter?.number : null;

  // 안전하게 배열 처리
  const safeChapters = Array.isArray(chapters) ? chapters : [];
  const totalPages = Math.ceil(safeChapters.length / itemsPerPage);
  const hasVolumes = useMemo(() => safeChapters.some(ch => ch.volume), [safeChapters]);

  // 볼륨별 챕터 수 계산
  const volumeCounts = useMemo(() => {
    if (!hasVolumes) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const ch of safeChapters) {
      const vol = ch.volume || "";
      counts.set(vol, (counts.get(vol) || 0) + 1);
    }
    return counts;
  }, [safeChapters, hasVolumes]);

  const paginatedChapters = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return safeChapters.slice(start, start + itemsPerPage);
  }, [safeChapters, currentPage, itemsPerPage]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // 현재 페이지 전체 선택 여부
  const allOnPageSelected = paginatedChapters.length > 0 &&
    paginatedChapters.every((ch) => selectedChapters.has(ch.number));

  return (
    <div>
      {/* 선택 모드 툴바 */}
      {canDelete && selectMode && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAllOnPage}
              className="h-7 gap-1.5 px-2 text-xs"
            >
              {allOnPageSelected ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              이 페이지
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAll}
              className="h-7 gap-1.5 px-2 text-xs"
            >
              {selectedChapters.size === safeChapters.length ? "전체 해제" : "전체 선택"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {selectedChapters.size}개 선택됨
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedChapters.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDeleteConfirm(true)}
                className="h-7 gap-1.5 px-2 text-xs"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {selectedChapters.size}개 삭제
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSelectMode}
              className="h-7 w-7 p-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* 선택 모드 진입 버튼 */}
      {canDelete && !selectMode && safeChapters.length > 1 && (
        <div className="flex justify-end px-4 py-1.5 border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSelectMode}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          >
            <CheckSquare className="h-3.5 w-3.5" />
            선택 모드
          </Button>
        </div>
      )}

      {/* Chapter List */}
      <div className="space-y-0">
        {paginatedChapters.map((chapter, idx) => {
          const chapterStatus = getChapterStatusConfig(chapter.status as ChapterStatus);
          const hasTranslation = ["TRANSLATED", "EDITED", "APPROVED", "REVIEWING"].includes(chapter.status as string);
          const isCurrentlyTranslating = currentTranslatingChapter === chapter.number;

          // 볼륨 헤더: 이전 챕터와 볼륨이 다르면 삽입
          const prevChapter = idx > 0 ? paginatedChapters[idx - 1] : (currentPage > 1 ? safeChapters[(currentPage - 1) * itemsPerPage - 1] : null);
          const showVolumeHeader = hasVolumes && chapter.volume && (!prevChapter || prevChapter.volume !== chapter.volume);
          const displayNum = hasVolumes ? (chapter.volumeNumber ?? chapter.number) : chapter.number;

          return (
            <div key={chapter.id}>
              {showVolumeHeader && (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/50 border-y border-border">
                  <span className="text-xs font-semibold text-foreground">
                    {chapter.volume}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {volumeCounts.get(chapter.volume!) || 0}화
                  </span>
                  <div className="flex-1 border-t border-border/50" />
                </div>
              )}
              {selectMode ? (
                // 선택 모드: 체크박스 + 클릭으로 선택
                <div
                  className={cn(
                    "list-item group cursor-pointer",
                    selectedChapters.has(chapter.number) && "bg-primary/5 border-l-2 border-l-primary",
                    isCurrentlyTranslating && "border-l-4 border-l-status-progress bg-status-progress/5"
                  )}
                  onClick={() => toggleChapter(chapter.number)}
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <Checkbox
                      checked={selectedChapters.has(chapter.number)}
                      onCheckedChange={() => toggleChapter(chapter.number)}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                    />
                    <span className="text-xs tabular-nums w-8 text-center text-muted-foreground">
                      {String(displayNum).padStart(3, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{displayNum}화</span>
                        {(chapter.translatedTitle || chapter.title) && (
                          <span className="text-muted-foreground truncate">
                            {chapter.translatedTitle || chapter.title}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {chapter.wordCount.toLocaleString()}자
                      </p>
                    </div>
                  </div>
                  <Badge variant={chapterStatus.variant} className="text-xs shrink-0">
                    {chapterStatus.label}
                  </Badge>
                </div>
              ) : (
                // 일반 모드: 링크
                <Link
                  href={`/works/${workId}/chapters/${chapter.number}`}
                  className={cn(
                    "list-item group",
                    isCurrentlyTranslating && "border-l-4 border-l-status-progress bg-status-progress/5 translation-active"
                  )}
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <span className={cn(
                      "text-xs tabular-nums w-8 flex items-center justify-center",
                      isCurrentlyTranslating ? "text-status-progress font-medium" : "text-muted-foreground"
                    )}>
                      {isCurrentlyTranslating ? (
                        <Zap className="h-4 w-4 text-status-progress" />
                      ) : (
                        String(displayNum).padStart(3, "0")
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "font-medium group-hover:text-muted-foreground transition-colors",
                          isCurrentlyTranslating && "text-status-progress"
                        )}>
                          {displayNum}화
                        </span>
                        {(chapter.translatedTitle || chapter.title) && (
                          <span className="text-muted-foreground truncate">
                            {chapter.translatedTitle || chapter.title}
                          </span>
                        )}
                      </div>
                      {isCurrentlyTranslating ? (
                        <div className="flex items-center gap-2 text-xs text-status-progress mt-0.5">
                          <Spinner size="sm" className="text-status-progress" />
                          <span>번역 중</span>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {chapter.wordCount.toLocaleString()}자
                          {hasTranslation && " · 번역 완료"}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {isCurrentlyTranslating ? (
                      <Badge variant="progress" className="text-xs gap-1">
                        <Spinner size="sm" className="text-white" />
                        번역중
                      </Badge>
                    ) : (
                      <Badge variant={chapterStatus.variant} className="text-xs">
                        {chapterStatus.label}
                      </Badge>
                    )}
                    {hasTranslation && !isCurrentlyTranslating && (
                      <span
                        className="opacity-0 group-hover:opacity-100 transition-all"
                        onClick={(e) => e.preventDefault()}
                      >
                        <ChapterDownloadButton
                          workId={workId}
                          chapterNumber={chapter.number}
                        />
                      </span>
                    )}
                    {canDelete && !isCurrentlyTranslating && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeletingChapter(chapter);
                        }}
                        className="p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      보기 →
                    </span>
                  </div>
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 p-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(1)}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1 mx-2">
            {(() => {
              const pages: (number | "ellipsis")[] = [];
              const maxVisible = 5;

              if (totalPages <= maxVisible) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);

                if (currentPage > 3) pages.push("ellipsis");

                const start = Math.max(2, currentPage - 1);
                const end = Math.min(totalPages - 1, currentPage + 1);

                for (let i = start; i <= end; i++) pages.push(i);

                if (currentPage < totalPages - 2) pages.push("ellipsis");

                pages.push(totalPages);
              }

              return pages.map((page, idx) =>
                page === "ellipsis" ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "ghost"}
                    size="sm"
                    onClick={() => goToPage(page)}
                    className="h-8 w-8 p-0 tabular-nums"
                  >
                    {page}
                  </Button>
                )
              );
            })()}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(totalPages)}
            disabled={currentPage === totalPages}
            className="h-8 w-8 p-0"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>

          <span className="ml-3 text-sm text-muted-foreground tabular-nums">
            {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, safeChapters.length)} / {safeChapters.length}
          </span>
        </div>
      )}

      {/* 단일 챕터 삭제 확인 */}
      <AlertDialog open={!!deletingChapter} onOpenChange={() => { if (!isDeleting) setDeletingChapter(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>회차 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deletingChapter?.number}화{deletingChapter?.title ? ` - ${deletingChapter.title}` : ""}</strong>를 삭제하시겠습니까?
              <br />
              원문, 번역본, 스냅샷이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteChapter}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 일괄 삭제 확인 */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={() => { if (!isDeleting) setShowBulkDeleteConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>일괄 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{selectedChapters.size}개 회차</strong>를 삭제하시겠습니까?
              <br />
              선택된 회차의 원문, 번역본, 스냅샷이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "삭제 중..." : `${selectedChapters.size}개 삭제`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
