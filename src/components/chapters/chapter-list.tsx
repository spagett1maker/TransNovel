"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { ChapterStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getChapterStatusConfig } from "@/lib/chapter-status";

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

export function ChapterList({ workId, chapters, itemsPerPage = 30 }: ChapterListProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(chapters.length / itemsPerPage);

  const paginatedChapters = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return chapters.slice(start, start + itemsPerPage);
  }, [chapters, currentPage, itemsPerPage]);

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

          return (
            <Link
              key={chapter.id}
              href={`/works/${workId}/chapters/${chapter.number}`}
              className="list-item group"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <span className="text-xs text-muted-foreground tabular-nums w-8">
                  {String(chapter.number).padStart(3, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium group-hover:text-muted-foreground transition-colors">
                      {chapter.number}화
                    </span>
                    {chapter.title && (
                      <span className="text-muted-foreground truncate">
                        {chapter.title}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {chapter.wordCount.toLocaleString()}자
                    {hasTranslation && " · 번역 완료"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant={chapterStatus.variant} className="text-xs">
                  {chapterStatus.label}
                </Badge>
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
            {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, chapters.length)} / {chapters.length}
          </span>
        </div>
      )}
    </div>
  );
}
