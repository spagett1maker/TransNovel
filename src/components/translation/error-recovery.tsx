"use client";

import {
  AlertTriangle,
  RefreshCw,
  SkipForward,
  ChevronDown,
  ChevronUp,
  Info,
  XCircle,
} from "lucide-react";
import { useState, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface FailedChapterInfo {
  number: number;
  error?: string;
  failedChunks?: number[];
}

interface ErrorRecoveryProps {
  failedChapters: number[];
  failedChapterDetails?: FailedChapterInfo[];
  onRetry: (chapterNumbers: number[]) => void;
  onSkipAll?: () => void;
  isRetrying?: boolean;
  className?: string;
}

// 에러 유형별 힌트 메시지
function getErrorHint(errorMessage?: string): string | null {
  if (!errorMessage) return null;

  const lowerError = errorMessage.toLowerCase();

  if (lowerError.includes("rate limit") || lowerError.includes("속도 제한")) {
    return "요청 속도 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (lowerError.includes("timeout") || lowerError.includes("시간 초과")) {
    return "서버 응답 시간이 초과되었습니다. 네트워크 상태를 확인해 주세요.";
  }

  if (lowerError.includes("network") || lowerError.includes("네트워크")) {
    return "네트워크 연결을 확인해 주세요.";
  }

  if (lowerError.includes("quota") || lowerError.includes("할당량")) {
    return "API 할당량이 초과되었습니다. 나중에 다시 시도해 주세요.";
  }

  return null;
}

// 에러 유형 그룹화
function groupErrorsByType(
  details?: FailedChapterInfo[]
): Map<string, number[]> {
  const groups = new Map<string, number[]>();

  if (!details) return groups;

  for (const chapter of details) {
    const key = chapter.error || "알 수 없는 오류";
    const existing = groups.get(key) || [];
    groups.set(key, [...existing, chapter.number]);
  }

  return groups;
}

export function ErrorRecovery({
  failedChapters,
  failedChapterDetails,
  onRetry,
  onSkipAll,
  isRetrying = false,
  className,
}: ErrorRecoveryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(
    new Set(failedChapters)
  );

  // 에러 그룹화
  const errorGroups = useMemo(
    () => groupErrorsByType(failedChapterDetails),
    [failedChapterDetails]
  );

  // 첫 번째 에러 힌트
  const primaryHint = useMemo(() => {
    if (!failedChapterDetails || failedChapterDetails.length === 0) return null;
    return getErrorHint(failedChapterDetails[0].error);
  }, [failedChapterDetails]);

  if (failedChapters.length === 0) {
    return null;
  }

  const toggleChapter = (number: number) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedChapters(new Set(failedChapters));
  };

  const deselectAll = () => {
    setSelectedChapters(new Set());
  };

  const handleRetry = () => {
    const chaptersToRetry = Array.from(selectedChapters).sort((a, b) => a - b);
    if (chaptersToRetry.length > 0) {
      onRetry(chaptersToRetry);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-status-error/30 bg-status-error/5 overflow-hidden",
        className
      )}
    >
      {/* 헤더 */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-error/10 shrink-0">
            <AlertTriangle className="h-5 w-5 text-status-error" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-status-error">
              {failedChapters.length}개 회차 번역 실패
            </h3>
            {primaryHint && (
              <p className="text-sm text-muted-foreground mt-1">
                <Info className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                {primaryHint}
              </p>
            )}
          </div>
        </div>

        {/* 실패한 회차 목록 (접힌 상태에서는 간략하게) */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">실패한 회차:</span>
          {failedChapters.slice(0, isExpanded ? undefined : 10).map((num) => (
            <Badge
              key={num}
              variant="destructive"
              className="gap-1 cursor-pointer hover:opacity-80"
              onClick={() => toggleChapter(num)}
            >
              {selectedChapters.has(num) && (
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
              {num}화
            </Badge>
          ))}
          {!isExpanded && failedChapters.length > 10 && (
            <span className="text-xs text-muted-foreground">
              외 {failedChapters.length - 10}개
            </span>
          )}
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="px-4 py-3 border-t border-status-error/20 bg-status-error/5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={isRetrying || selectedChapters.size === 0}
            className="gap-2 border-status-error/30 text-status-error hover:bg-status-error/10"
          >
            {isRetrying ? (
              <>
                <ButtonSpinner className="text-status-error" />
                재시도 중...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                {selectedChapters.size === failedChapters.length
                  ? "전체 재시도"
                  : `${selectedChapters.size}개 재시도`}
              </>
            )}
          </Button>

          {onSkipAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkipAll}
              disabled={isRetrying}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <SkipForward className="h-4 w-4" />
              모두 건너뛰기
            </Button>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="gap-1 text-muted-foreground"
        >
          상세 정보
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* 상세 정보 (펼침) */}
      {isExpanded && (
        <div className="px-4 py-4 border-t border-status-error/20 bg-background/50">
          {/* 선택 컨트롤 */}
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={selectAll}
              className="text-xs h-7"
            >
              전체 선택
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={deselectAll}
              className="text-xs h-7"
            >
              전체 해제
            </Button>
            <span className="text-xs text-muted-foreground ml-2">
              {selectedChapters.size}개 선택됨
            </span>
          </div>

          {/* 에러 유형별 그룹 */}
          {errorGroups.size > 0 && (
            <div className="space-y-3">
              {Array.from(errorGroups.entries()).map(([error, chapters]) => (
                <div
                  key={error}
                  className="rounded-lg border border-status-error/20 bg-status-error/5 p-3"
                >
                  <div className="flex items-start gap-2 text-sm">
                    <XCircle className="h-4 w-4 text-status-error mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-status-error line-clamp-2">
                        {error}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {chapters.map((num) => (
                          <button
                            key={num}
                            onClick={() => toggleChapter(num)}
                            className={cn(
                              "px-2 py-0.5 text-xs rounded-md border transition-colors",
                              selectedChapters.has(num)
                                ? "bg-status-error text-white border-status-error"
                                : "bg-background text-muted-foreground border-border hover:border-status-error/50"
                            )}
                          >
                            {num}화
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 에러 상세가 없을 경우 */}
          {errorGroups.size === 0 && (
            <div className="flex flex-wrap gap-2">
              {failedChapters.map((num) => (
                <button
                  key={num}
                  onClick={() => toggleChapter(num)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-lg border transition-colors",
                    selectedChapters.has(num)
                      ? "bg-status-error text-white border-status-error"
                      : "bg-background text-muted-foreground border-border hover:border-status-error/50"
                  )}
                >
                  {num}화
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 간단한 에러 배너 (인라인용)
interface ErrorBannerProps {
  failedCount: number;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

export function ErrorBanner({
  failedCount,
  onRetry,
  isRetrying = false,
  className,
}: ErrorBannerProps) {
  if (failedCount === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg",
        "bg-status-error/10 border border-status-error/20",
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm text-status-error">
        <AlertTriangle className="h-4 w-4" />
        <span>{failedCount}개 회차 실패</span>
      </div>
      {onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
          className="h-7 text-xs text-status-error hover:bg-status-error/10"
        >
          {isRetrying ? (
            <ButtonSpinner className="text-status-error" />
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              재시도
            </>
          )}
        </Button>
      )}
    </div>
  );
}
