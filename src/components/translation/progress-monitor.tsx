"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  RefreshCw,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useState, useRef, useCallback } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ButtonSpinner, Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface ChunkError {
  index: number;
  error: string;
}

interface ChapterProgress {
  number: number;
  status: "PENDING" | "TRANSLATING" | "COMPLETED" | "PARTIAL" | "FAILED";
  currentChunk: number;
  totalChunks: number;
  error?: string;
  failedChunks?: ChunkError[];
}

interface ProgressEvent {
  jobId: string;
  type:
    | "job_started"
    | "chapter_started"
    | "chunk_progress"
    | "chapter_completed"
    | "chapter_partial"
    | "chapter_failed"
    | "job_completed"
    | "job_failed";
  data: {
    status?: string;
    completedChapters?: number;
    totalChapters?: number;
    chapterNumber?: number;
    currentChunk?: number;
    totalChunks?: number;
    error?: string;
    chunkIndex?: number;
    failedChunks?: number[];
    chapters?: ChapterProgress[];
  };
}

interface TranslationProgressProps {
  jobId: string;
  workId: string;
  onComplete: () => void;
  onRetry?: (chapterNumbers: number[]) => Promise<void>;
}

// 상태별 스타일 설정 (디자인 시스템 통일)
const STATUS_STYLES = {
  IN_PROGRESS: {
    container: "border-status-progress/30 bg-status-progress/5 translation-progress-card active",
    icon: <Zap className="h-5 w-5 text-status-progress" />,
    iconBg: "bg-status-progress/10",
    title: "번역 진행 중",
    description: "AI가 열심히 번역하고 있습니다...",
    progressBarClass: "[&>div]:bg-status-progress",
  },
  COMPLETED: {
    container: "border-status-success/30 bg-status-success/5",
    icon: <CheckCircle2 className="h-5 w-5 text-status-success" />,
    iconBg: "bg-status-success/10",
    title: "번역 완료!",
    description: "모든 회차의 번역이 완료되었습니다.",
    progressBarClass: "[&>div]:bg-status-success",
  },
  FAILED: {
    container: "border-status-error/30 bg-status-error/5",
    icon: <XCircle className="h-5 w-5 text-status-error" />,
    iconBg: "bg-status-error/10",
    title: "번역 중 오류 발생",
    description: "일부 회차에서 오류가 발생했습니다.",
    progressBarClass: "[&>div]:bg-status-error",
  },
  PENDING: {
    container: "border-status-pending/30 bg-status-pending/5",
    icon: <Clock className="h-5 w-5 text-muted-foreground" />,
    iconBg: "bg-muted",
    title: "번역 준비 중",
    description: "잠시 후 번역이 시작됩니다...",
    progressBarClass: "",
  },
};

export function TranslationProgress({
  jobId,
  onComplete,
  onRetry,
}: TranslationProgressProps) {
  const [chapters, setChapters] = useState<ChapterProgress[]>([]);
  const [completedChapters, setCompletedChapters] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const [status, setStatus] = useState<string>("PENDING");
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // 실패한 챕터 재시도 핸들러
  const handleRetryFailed = useCallback(async () => {
    const failedChapterNumbers = chapters
      .filter((ch) => ch.status === "FAILED" || ch.status === "PARTIAL")
      .map((ch) => ch.number);

    if (failedChapterNumbers.length === 0 || !onRetry) return;

    setIsRetrying(true);
    try {
      await onRetry(failedChapterNumbers);
    } catch (err) {
      console.error("재시도 실패:", err);
    } finally {
      setIsRetrying(false);
    }
  }, [chapters, onRetry]);

  const isDev = process.env.NODE_ENV === "development";
  const log = useCallback(
    (...args: unknown[]) => {
      if (isDev) console.log(...args);
    },
    [isDev]
  );

  useEffect(() => {
    const timestamp = () => new Date().toISOString();
    log(`[${timestamp()}] [ProgressMonitor] SSE 연결 시작 - jobId: ${jobId}`);

    const eventSource = new EventSource(
      `/api/translation/stream?jobId=${jobId}`
    );

    eventSource.onopen = () => {
      log(`[${timestamp()}] [ProgressMonitor] SSE 연결 성공`);
    };

    eventSource.onmessage = (event) => {
      try {
        const data: ProgressEvent = JSON.parse(event.data);
        log(`[${timestamp()}] [ProgressMonitor] 이벤트:`, data.type);

        switch (data.type) {
          case "job_started":
            setStatus("IN_PROGRESS");
            if (data.data.totalChapters) {
              setTotalChapters(data.data.totalChapters);
            }
            if (data.data.chapters) {
              setChapters(data.data.chapters);
            }
            break;

          case "chapter_started":
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? {
                      ...ch,
                      status: "TRANSLATING",
                      totalChunks: data.data.totalChunks || 0,
                      currentChunk: 0,
                    }
                  : ch
              )
            );
            break;

          case "chunk_progress":
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? {
                      ...ch,
                      currentChunk: data.data.currentChunk || 0,
                      totalChunks: data.data.totalChunks || 0,
                    }
                  : ch
              )
            );
            break;



          case "chapter_completed":
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? { ...ch, status: "COMPLETED" }
                  : ch
              )
            );
            setCompletedChapters(data.data.completedChapters || 0);
            break;

          case "chapter_partial":
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? {
                      ...ch,
                      status: "PARTIAL",
                      failedChunks: (data.data.failedChunks || []).map((idx) => ({
                        index: idx,
                        error: "번역 실패",
                      })),
                    }
                  : ch
              )
            );
            setCompletedChapters(data.data.completedChapters || 0);
            break;

          case "chapter_failed":
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? { ...ch, status: "FAILED", error: data.data.error }
                  : ch
              )
            );
            break;

          case "job_completed":
            setStatus("COMPLETED");
            setCompletedChapters(data.data.completedChapters || 0);
            setTimeout(() => {
              eventSource.close();
              onCompleteRef.current();
            }, 1000);
            break;

          case "job_failed":
            setStatus("FAILED");
            setError(data.data.error || "알 수 없는 오류가 발생했습니다.");
            eventSource.close();
            break;
        }
      } catch (e) {
        console.error("Failed to parse SSE event:", e);
      }
    };

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        log(`[${timestamp()}] [ProgressMonitor] SSE 연결 종료됨`);
      }
    };

    return () => {
      log(`[${timestamp()}] [ProgressMonitor] SSE 연결 정리`);
      eventSource.close();
    };
  }, [jobId, log]);

  const overallProgress =
    totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0;

  const currentChapter = chapters.find((ch) => ch.status === "TRANSLATING");
  const chunkProgress =
    currentChapter && currentChapter.totalChunks > 0
      ? (currentChapter.currentChunk / currentChapter.totalChunks) * 100
      : 0;

  const failedCount = chapters.filter(
    (ch) => ch.status === "FAILED" || ch.status === "PARTIAL"
  ).length;

  const statusKey = status as keyof typeof STATUS_STYLES;
  const styles = STATUS_STYLES[statusKey] || STATUS_STYLES.PENDING;

  return (
    <div className={cn("section-surface overflow-hidden", styles.container)}>
      {/* 헤더 */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full shrink-0", styles.iconBg)}>
            {status === "IN_PROGRESS" ? (
              <Loader2 className="h-5 w-5 text-status-progress animate-spin" />
            ) : (
              styles.icon
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">{styles.title}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {styles.description}
            </p>
          </div>
          {totalChapters > 0 && (
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold tabular-nums">
                {Math.round(overallProgress)}%
              </div>
              <div className="text-xs text-muted-foreground">
                {completedChapters}/{totalChapters}화
              </div>
            </div>
          )}
        </div>

        {/* 전체 진행률 바 */}
        <div className="mt-4 relative">
          <Progress value={overallProgress} className={cn("h-2", styles.progressBarClass)} />
          {status === "IN_PROGRESS" && (
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div className="progress-shimmer h-full w-full" />
            </div>
          )}
        </div>

        {/* 현재 챕터 진행률 */}
        {currentChapter && (
          <div className="mt-4 p-3 rounded-lg bg-background/50 border">
            <div className="flex items-center justify-between text-sm mb-2">
              <div className="flex items-center gap-2">
                <Spinner size="sm" className="text-status-progress" />
                <span className="font-medium">{currentChapter.number}화 번역 중</span>
              </div>
              <span className="text-muted-foreground tabular-nums">
                {currentChapter.currentChunk}/{currentChapter.totalChunks} 청크
              </span>
            </div>
            <Progress value={chunkProgress} className="h-1.5 [&>div]:bg-status-progress/70" />
          </div>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="px-5 pb-4">
          <div className="rounded-lg bg-status-error/10 border border-status-error/20 p-3 text-sm text-status-error">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* 회차별 상태 (접을 수 있음) */}
      {chapters.length > 0 && (
        <div className="border-t border-border/50">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full px-5 py-3 flex items-center justify-between text-sm hover:bg-background/30 transition-colors"
          >
            <span className="font-medium">회차별 상태</span>
            <div className="flex items-center gap-2">
              {failedCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {failedCount}개 오류
                </Badge>
              )}
              {showDetails ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>

          {showDetails && (
            <div className="px-5 pb-5 space-y-4">
              {/* 챕터 배지 그리드 */}
              <div className="flex flex-wrap gap-1.5">
                {chapters.map((chapter) => {
                  const isActive = chapter.status === "TRANSLATING";
                  const isCompleted = chapter.status === "COMPLETED";
                  const isFailed = chapter.status === "FAILED";
                  const isPartial = chapter.status === "PARTIAL";

                  return (
                    <Badge
                      key={chapter.number}
                      variant={
                        isCompleted
                          ? "success"
                          : isPartial
                            ? "warning"
                            : isActive
                              ? "progress"
                              : isFailed
                                ? "destructive"
                                : "pending"
                      }
                      className="gap-1 px-2 py-1"
                      title={
                        isFailed && chapter.error
                          ? chapter.error
                          : isPartial && chapter.failedChunks
                            ? `${chapter.failedChunks.length}개 청크 실패`
                            : undefined
                      }
                    >
                      {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                      {isPartial && <AlertTriangle className="h-3 w-3" />}
                      {isActive && <Loader2 className="h-3 w-3 animate-spin" />}
                      {isFailed && <XCircle className="h-3 w-3" />}
                      {chapter.number}
                    </Badge>
                  );
                })}
              </div>

              {/* 실패한 챕터 상세 정보 */}
              {failedCount > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-status-error uppercase tracking-wide">
                    오류 상세
                  </p>
                  <div className="space-y-2">
                    {chapters
                      .filter((ch) => ch.status === "PARTIAL" || ch.status === "FAILED")
                      .map((chapter) => (
                        <div
                          key={chapter.number}
                          className="rounded-lg bg-status-error/5 border border-status-error/20 p-3"
                        >
                          <div className="flex items-center gap-2 text-sm font-medium text-status-error">
                            <XCircle className="h-4 w-4" />
                            {chapter.number}화
                            {chapter.status === "PARTIAL" && " (부분 번역)"}
                            {chapter.status === "FAILED" && " (실패)"}
                          </div>
                          {chapter.error && (
                            <p className="mt-1 text-sm text-status-error/80 pl-6">
                              {chapter.error}
                            </p>
                          )}
                          {chapter.failedChunks && chapter.failedChunks.length > 0 && (
                            <p className="mt-1 text-xs text-status-error/70 pl-6">
                              실패한 청크: {chapter.failedChunks.map((f) => `#${f.index + 1}`).join(", ")}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>

                  {/* 재시도 버튼 */}
                  {onRetry && (status === "COMPLETED" || status === "FAILED") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetryFailed}
                      disabled={isRetrying}
                      className="w-full mt-3 border-status-error/30 text-status-error hover:bg-status-error/10"
                    >
                      {isRetrying ? (
                        <>
                          <ButtonSpinner className="text-status-error" />
                          재시도 중...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          실패한 {failedCount}개 회차 재번역
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
