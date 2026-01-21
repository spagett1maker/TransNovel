"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ChapterStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/contexts/translation-context";
import { getChapterStatusConfig } from "@/lib/chapter-status";
import { cn } from "@/lib/utils";

interface Chapter {
  id: string;
  number: number;
  title: string | null;
  status: ChapterStatus | string;
  wordCount: number;
}

interface ChapterListProps {
  workId: string;
  chapters: Chapter[];
  itemsPerPage?: number;
}

export function ChapterList({ workId, chapters = [], itemsPerPage = 30 }: ChapterListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const { getJobByWorkId } = useTranslation();

  // 현재 작품의 번역 작업 확인
  const job = getJobByWorkId(workId);
  const isTranslating = job && (job.status === "PENDING" || job.status === "IN_PROGRESS");
  const currentTranslatingChapter = isTranslating ? job.currentChapter?.number : null;

  // 안전하게 배열 처리
  const safeChapters = Array.isArray(chapters) ? chapters : [];
  const totalPages = Math.ceil(safeChapters.length / itemsPerPage);

  const paginatedChapters = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return safeChapters.slice(start, start + itemsPerPage);
  }, [safeChapters, currentPage, itemsPerPage]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  return (
    <div>
      {/* Chapter List */}
      <div className="space-y-0">
        {paginatedChapters.map((chapter) => {
          const chapterStatus = getChapterStatusConfig(chapter.status as ChapterStatus);
          const hasTranslation = ["TRANSLATED", "EDITED", "APPROVED", "REVIEWING"].includes(chapter.status as string);
          const isCurrentlyTranslating = currentTranslatingChapter === chapter.number;

          return (
            <Link
              key={chapter.id}
              href={`/works/${workId}/chapters/${chapter.number}`}
              className={cn(
                "list-item group",
                isCurrentlyTranslating && "border-l-4 border-l-status-progress bg-status-progress/5 translation-active"
              )}
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                {/* 챕터 번호 - 번역 중이면 아이콘 표시 */}
                <span className={cn(
                  "text-xs tabular-nums w-8 flex items-center justify-center",
                  isCurrentlyTranslating ? "text-status-progress font-medium" : "text-muted-foreground"
                )}>
                  {isCurrentlyTranslating ? (
                    <Zap className="h-4 w-4 text-status-progress" />
                  ) : (
                    String(chapter.number).padStart(3, "0")
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-medium group-hover:text-muted-foreground transition-colors",
                      isCurrentlyTranslating && "text-status-progress"
                    )}>
                      {chapter.number}화
                    </span>
                    {chapter.title && (
                      <span className="text-muted-foreground truncate">
                        {chapter.title}
                      </span>
                    )}
                  </div>
                  {/* 번역 중인 챕터는 상태 표시 */}
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
                <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  보기 →
                </span>
              </div>
            </Link>
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
    </div>
  );
}
