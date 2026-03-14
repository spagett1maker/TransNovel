"use client";

import { ChapterStatus } from "@prisma/client";
import { useState, useCallback, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getChapterStatusConfig } from "@/lib/chapter-status";
import { Badge } from "@/components/ui/badge";

interface SearchMatch {
  field: string;
  snippets: string[];
  count: number;
}

interface SearchResult {
  number: number;
  title: string | null;
  translatedTitle: string | null;
  status: ChapterStatus;
  matches: SearchMatch[];
  totalCount: number;
}

interface SearchSidebarProps {
  workId: string;
  onNavigate: (chapterNum: number) => void;
}

function highlightQuery(text: string, query: string) {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 text-inherit rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function SearchSidebar({ workId, onNavigate }: SearchSidebarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const abortRef = useRef<AbortController | undefined>(undefined);

  const doSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setSearched(true);
      setLastQuery(trimmed);

      try {
        const res = await fetch(
          `/api/works/${workId}/chapters/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();
        setResults(data.results);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [workId]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      doSearch(query);
    }
  };

  const totalMatches = results.reduce((sum, r) => sum + r.totalCount, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 p-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">전체 회차 검색</h3>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="검색어 입력 (Enter)"
            autoFocus
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {searched && !isLoading && (
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {results.length > 0
              ? `${results.length}개 회차에서 ${totalMatches}건 발견`
              : `"${lastQuery}" 검색 결과 없음`}
          </p>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && searched && results.length === 0 && (
          <div className="px-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">검색 결과가 없습니다</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              다른 검색어를 입력해 보세요
            </p>
          </div>
        )}

        {!isLoading && !searched && (
          <div className="px-3 py-10 text-center">
            <Search className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              검색어를 입력하고 Enter를 누르세요
            </p>
          </div>
        )}

        {!isLoading &&
          results.map((result) => {
            const statusConfig = getChapterStatusConfig(result.status);
            return (
              <button
                key={result.number}
                onClick={() => onNavigate(result.number)}
                className="w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium truncate">
                    {result.number}화
                    {(result.translatedTitle || result.title) && (
                      <span className="font-normal text-muted-foreground ml-1">
                        {result.translatedTitle || result.title}
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {result.totalCount}건
                    </span>
                    <Badge
                      variant={statusConfig.variant}
                      className="text-[10px]"
                    >
                      {statusConfig.label}
                    </Badge>
                  </div>
                </div>
                {/* Snippets */}
                <div className="space-y-1">
                  {result.matches.map((match) =>
                    match.snippets.slice(0, 2).map((snippet, i) => (
                      <p
                        key={`${match.field}-${i}`}
                        className="text-xs text-muted-foreground leading-relaxed line-clamp-2"
                      >
                        <span className={cn(
                          "inline-block text-[9px] font-medium mr-1 px-1 py-0.5 rounded",
                          match.field === "윤문본"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        )}>
                          {match.field}
                        </span>
                        {highlightQuery(snippet, lastQuery)}
                      </p>
                    ))
                  )}
                </div>
              </button>
            );
          })}
      </div>
    </div>
  );
}
