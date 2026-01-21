"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ChevronUp,
  ChevronDown,
  X,
  Zap,
  Pause,
  Play,
  CheckCircle,
  XCircle,
  Minus,
  BookOpen,
  Languages,
  StopCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner, ButtonSpinner } from "@/components/ui/spinner";
import { useTranslation, TranslationJobSummary } from "@/contexts/translation-context";
import { useBibleGeneration, BibleGenerationJob } from "@/contexts/bible-generation-context";
import { cn } from "@/lib/utils";

// 통합 작업 타입
type JobType = "translation" | "bible";

interface UnifiedJob {
  id: string;
  type: JobType;
  workId: string;
  workTitle: string;
  status: "pending" | "in_progress" | "paused" | "completed" | "failed";
  progress: number;
  createdAt: Date;
  // 번역 전용
  translationJob?: TranslationJobSummary;
  // 설정집 전용
  bibleJob?: BibleGenerationJob;
}

// 번역 작업 카드
function TranslationJobItem({
  job,
  onRemove,
  onPause,
  onResume,
  isFirst = false,
}: {
  job: TranslationJobSummary;
  onRemove: () => void;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  isFirst?: boolean;
}) {
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const isCompleted = job.status === "COMPLETED";
  const isFailed = job.status === "FAILED";
  const isPaused = job.status === "PAUSED";
  const isActive = job.status === "PENDING" || job.status === "IN_PROGRESS";

  const displayProgress = job.progress;

  const handlePause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPausing(true);
    try {
      await onPause();
    } finally {
      setIsPausing(false);
    }
  };

  const handleResume = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResuming(true);
    try {
      await onResume();
    } finally {
      setIsResuming(false);
    }
  };

  const statusStyles = {
    active: {
      text: "text-blue-600 dark:text-blue-400",
      progressBar: "[&>div]:bg-blue-500",
    },
    completed: {
      text: "text-status-success",
      progressBar: "[&>div]:bg-status-success",
    },
    failed: {
      text: "text-status-error",
      progressBar: "[&>div]:bg-status-error",
    },
    paused: {
      text: "text-status-warning",
      progressBar: "[&>div]:bg-status-warning",
    },
  };

  const currentStyle = isCompleted
    ? statusStyles.completed
    : isFailed
      ? statusStyles.failed
      : isPaused
        ? statusStyles.paused
        : statusStyles.active;

  return (
    <div
      className={cn(
        "px-4 py-3 border-b border-border last:border-b-0",
        isFirst && isActive && "translation-progress-card active"
      )}
    >
      {/* 작업 정보 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* 타입 아이콘 */}
          <div className="flex items-center justify-center w-5 h-5 rounded bg-blue-100 dark:bg-blue-900/30 shrink-0">
            <Languages className="h-3 w-3 text-blue-600 dark:text-blue-400" />
          </div>
          {/* 상태 아이콘 */}
          {isCompleted ? (
            <CheckCircle className="h-4 w-4 text-status-success shrink-0" />
          ) : isFailed ? (
            <XCircle className="h-4 w-4 text-status-error shrink-0" />
          ) : isPaused ? (
            <Pause className="h-4 w-4 text-status-warning shrink-0" />
          ) : (
            <Spinner size="sm" label="번역 중" className="text-blue-500 shrink-0" />
          )}
          <Link
            href={`/works/${job.workId}`}
            className={cn(
              "text-sm font-medium truncate hover:underline",
              currentStyle.text
            )}
          >
            {job.workTitle}
          </Link>
        </div>
        <span className={cn("text-xs tabular-nums shrink-0", currentStyle.text)}>
          {displayProgress}%
        </span>
      </div>

      {/* 진행률 바 */}
      <div className="relative mb-2">
        <Progress
          value={displayProgress}
          className={cn("h-1.5 transition-all duration-300", currentStyle.progressBar)}
        />
        {isActive && (
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div className="progress-shimmer h-full w-full" />
          </div>
        )}
      </div>

      {/* 현재 상태 정보 및 액션 버튼 */}
      <div className="flex items-center justify-between">
        <div className="text-xs flex-1 min-w-0">
          {isActive && job.currentChapter && (
            <span className={currentStyle.text}>
              {job.currentChapter.number}화 번역 중
            </span>
          )}
          {isActive && !job.currentChapter && job.status === "PENDING" && (
            <span className="text-muted-foreground">대기 중...</span>
          )}
          {isCompleted && (
            <span className={currentStyle.text}>
              {job.completedChapters}화 번역 완료
            </span>
          )}
          {isFailed && (
            <span className={cn(currentStyle.text, "line-clamp-1")}>
              {job.error || "번역 중 오류 발생"}
            </span>
          )}
          {isPaused && (
            <span className={currentStyle.text}>
              {job.completedChapters}/{job.totalChapters}화 완료 후 일시정지
            </span>
          )}
        </div>

        {/* 액션 버튼들 */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs hover:bg-status-warning/20 text-status-warning"
              disabled={isPausing}
              onClick={handlePause}
              title="일시정지"
            >
              {isPausing ? (
                <ButtonSpinner className="text-status-warning" />
              ) : (
                <>
                  <Pause className="h-3 w-3 mr-1" />
                  일시정지
                </>
              )}
            </Button>
          )}

          {isPaused && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs hover:bg-status-success/20 text-status-success"
              disabled={isResuming}
              onClick={handleResume}
              title="재개"
            >
              {isResuming ? (
                <ButtonSpinner className="text-status-success" />
              ) : (
                <>
                  <Play className="h-3 w-3 mr-1" />
                  재개
                </>
              )}
            </Button>
          )}

          {(isCompleted || isFailed || isPaused) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              title="닫기"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// 설정집 생성 작업 카드
function BibleJobItem({
  job,
  onRemove,
  onCancel,
  isFirst = false,
}: {
  job: BibleGenerationJob;
  onRemove: () => void;
  onCancel: () => void;
  isFirst?: boolean;
}) {
  const isCompleted = job.status === "completed";
  const isFailed = job.status === "failed";
  const isActive = job.status === "generating";

  const statusStyles = {
    active: {
      text: "text-violet-600 dark:text-violet-400",
      progressBar: "[&>div]:bg-violet-500",
    },
    completed: {
      text: "text-status-success",
      progressBar: "[&>div]:bg-status-success",
    },
    failed: {
      text: "text-status-error",
      progressBar: "[&>div]:bg-status-error",
    },
  };

  const currentStyle = isCompleted
    ? statusStyles.completed
    : isFailed
      ? statusStyles.failed
      : statusStyles.active;

  return (
    <div
      className={cn(
        "px-4 py-3 border-b border-border last:border-b-0",
        isFirst && isActive && "bible-generation-card active"
      )}
    >
      {/* 작업 정보 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* 타입 아이콘 */}
          <div className="flex items-center justify-center w-5 h-5 rounded bg-violet-100 dark:bg-violet-900/30 shrink-0">
            <BookOpen className="h-3 w-3 text-violet-600 dark:text-violet-400" />
          </div>
          {/* 상태 아이콘 */}
          {isCompleted ? (
            <CheckCircle className="h-4 w-4 text-status-success shrink-0" />
          ) : isFailed ? (
            <XCircle className="h-4 w-4 text-status-error shrink-0" />
          ) : (
            <Spinner size="sm" label="생성 중" className="text-violet-500 shrink-0" />
          )}
          <Link
            href={`/works/${job.workId}/setting-bible`}
            className={cn(
              "text-sm font-medium truncate hover:underline",
              currentStyle.text
            )}
          >
            {job.workTitle}
          </Link>
        </div>
        <span className={cn("text-xs tabular-nums shrink-0", currentStyle.text)}>
          {job.progress}%
        </span>
      </div>

      {/* 진행률 바 */}
      <div className="relative mb-2">
        <Progress
          value={job.progress}
          className={cn("h-1.5 transition-all duration-300", currentStyle.progressBar)}
        />
        {isActive && (
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <div className="progress-shimmer h-full w-full" />
          </div>
        )}
      </div>

      {/* 현재 상태 정보 */}
      <div className="flex items-center justify-between">
        <div className="text-xs flex-1 min-w-0">
          {isActive && (
            <span className={currentStyle.text}>
              {job.currentBatch}/{job.totalBatches} 배치 분석 중
              {job.retryCount && job.retryCount > 0 && (
                <span className="text-yellow-600 ml-1">(재시도 {job.retryCount})</span>
              )}
            </span>
          )}
          {isCompleted && job.stats && (
            <span className={currentStyle.text}>
              인물 {job.stats.characters} · 용어 {job.stats.terms} · 이벤트 {job.stats.events}
            </span>
          )}
          {isFailed && (
            <span className={cn(currentStyle.text, "line-clamp-1")}>
              {job.error || "생성 중 오류 발생"}
            </span>
          )}
        </div>

        {/* 액션 버튼들 */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {/* 취소 버튼 - 진행 중일 때 */}
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs hover:bg-status-error/20 text-status-error"
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              title="취소"
            >
              <StopCircle className="h-3 w-3 mr-1" />
              취소
            </Button>
          )}

          {/* 닫기 버튼 - 완료/실패 상태일 때 */}
          {(isCompleted || isFailed) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              title="닫기"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function GlobalTranslationIndicator() {
  const {
    jobs: translationJobs,
    removeJob: removeTranslationJob,
    pauseJob,
    resumeJob,
  } = useTranslation();

  const {
    jobs: bibleJobs,
    removeJob: removeBibleJob,
    cancelGeneration,
  } = useBibleGeneration();

  const [isExpanded, setIsExpanded] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  // 통합 작업 목록 생성
  const unifiedJobs = useMemo((): UnifiedJob[] => {
    const jobs: UnifiedJob[] = [];

    // 번역 작업 추가
    translationJobs.forEach((job) => {
      jobs.push({
        id: `translation-${job.jobId}`,
        type: "translation",
        workId: job.workId,
        workTitle: job.workTitle,
        status:
          job.status === "PENDING"
            ? "pending"
            : job.status === "IN_PROGRESS"
              ? "in_progress"
              : job.status === "PAUSED"
                ? "paused"
                : job.status === "COMPLETED"
                  ? "completed"
                  : "failed",
        progress: job.progress,
        createdAt: job.createdAt,
        translationJob: job,
      });
    });

    // 설정집 생성 작업 추가
    bibleJobs.forEach((job) => {
      jobs.push({
        id: `bible-${job.workId}`,
        type: "bible",
        workId: job.workId,
        workTitle: job.workTitle,
        status:
          job.status === "idle"
            ? "pending"
            : job.status === "generating"
              ? "in_progress"
              : job.status === "completed"
                ? "completed"
                : "failed",
        progress: job.progress,
        createdAt: job.createdAt,
        bibleJob: job,
      });
    });

    // 생성 시간순 정렬
    return jobs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }, [translationJobs, bibleJobs]);

  // 활성 작업 수
  const activeJobsCount = useMemo(
    () =>
      unifiedJobs.filter(
        (job) => job.status === "pending" || job.status === "in_progress"
      ).length,
    [unifiedJobs]
  );

  // 번역 활성 작업 수
  const activeTranslationCount = useMemo(
    () =>
      translationJobs.filter(
        (job) => job.status === "PENDING" || job.status === "IN_PROGRESS"
      ).length,
    [translationJobs]
  );

  // 설정집 활성 작업 수
  const activeBibleCount = useMemo(
    () => bibleJobs.filter((job) => job.status === "generating").length,
    [bibleJobs]
  );

  // 완료/실패된 번역 작업 자동 제거 (5초 후)
  useEffect(() => {
    const completedOrFailedJobs = translationJobs.filter(
      (job) => job.status === "COMPLETED" || job.status === "FAILED"
    );

    if (completedOrFailedJobs.length > 0) {
      const timers = completedOrFailedJobs.map((job) => {
        return setTimeout(() => {
          removeTranslationJob(job.jobId);
        }, 5000);
      });

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [translationJobs, removeTranslationJob]);

  // 완료/실패된 설정집 작업 자동 제거 (5초 후)
  useEffect(() => {
    const completedOrFailedJobs = bibleJobs.filter(
      (job) => job.status === "completed" || job.status === "failed"
    );

    if (completedOrFailedJobs.length > 0) {
      const timers = completedOrFailedJobs.map((job) => {
        return setTimeout(() => {
          removeBibleJob(job.workId);
        }, 5000);
      });

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [bibleJobs, removeBibleJob]);

  // 일시정지 핸들러
  const handlePause = useCallback(
    async (jobId: string) => {
      const success = await pauseJob(jobId);
      if (success) {
        toast.success("번역이 일시정지되었습니다.");
      } else {
        toast.error("일시정지에 실패했습니다.");
      }
    },
    [pauseJob]
  );

  // 재개 핸들러
  const handleResume = useCallback(
    async (job: TranslationJobSummary) => {
      const pendingChapters = job.totalChapters - job.completedChapters;
      if (pendingChapters <= 0) {
        toast.error("재개할 챕터가 없습니다.");
        return;
      }

      const result = await resumeJob(job.jobId);
      if (result.success) {
        toast.success(`${pendingChapters}개 챕터 번역을 재개합니다.`);
      } else {
        toast.error(result.error || "재개에 실패했습니다.");
      }
    },
    [resumeJob]
  );

  // 설정집 생성 취소 핸들러
  const handleCancelBible = useCallback(
    (workId: string) => {
      cancelGeneration(workId);
      toast.info("설정집 생성이 취소되었습니다.");
    },
    [cancelGeneration]
  );

  // 표시할 작업이 없으면 렌더링하지 않음
  if (unifiedJobs.length === 0) {
    return null;
  }

  // 헤더 텍스트 생성
  const getHeaderText = () => {
    if (activeJobsCount === 0) {
      return `작업 완료 (${unifiedJobs.length})`;
    }

    const parts: string[] = [];
    if (activeTranslationCount > 0) {
      parts.push(`번역 ${activeTranslationCount}`);
    }
    if (activeBibleCount > 0) {
      parts.push(`설정집 ${activeBibleCount}`);
    }
    return `진행 중: ${parts.join(", ")}`;
  };

  // 최소화 상태
  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition-colors"
      >
        {activeJobsCount > 0 ? (
          <>
            <Spinner size="sm" label="작업 중" className="text-primary-foreground" />
            <span className="text-sm font-medium">{getHeaderText()}</span>
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            <span className="text-sm font-medium">{unifiedJobs.length}개 작업</span>
          </>
        )}
      </button>
    );
  }

  // 헤더 스타일 결정
  const hasActiveJobs = activeJobsCount > 0;
  const headerBgClass = hasActiveJobs ? "bg-primary" : "bg-muted";
  const headerTextClass = hasActiveJobs ? "text-primary-foreground" : "text-foreground";

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3 cursor-pointer",
          headerBgClass,
          headerTextClass
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {hasActiveJobs ? (
            <Spinner size="sm" label="작업 중" className={headerTextClass} />
          ) : (
            <Zap className={cn("h-4 w-4", headerTextClass)} />
          )}
          <span className="text-sm font-medium">{getHeaderText()}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6",
              hasActiveJobs
                ? "text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            onClick={(e) => {
              e.stopPropagation();
              setIsMinimized(true);
            }}
            title="최소화"
          >
            <Minus className="h-4 w-4" />
          </Button>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </div>
      </div>

      {/* Job List */}
      {isExpanded && (
        <div className="max-h-80 overflow-y-auto">
          {unifiedJobs.map((job, index) =>
            job.type === "translation" && job.translationJob ? (
              <TranslationJobItem
                key={job.id}
                job={job.translationJob}
                isFirst={index === 0}
                onRemove={() => removeTranslationJob(job.translationJob!.jobId)}
                onPause={() => handlePause(job.translationJob!.jobId)}
                onResume={() => handleResume(job.translationJob!)}
              />
            ) : job.type === "bible" && job.bibleJob ? (
              <BibleJobItem
                key={job.id}
                job={job.bibleJob}
                isFirst={index === 0}
                onRemove={() => removeBibleJob(job.bibleJob!.workId)}
                onCancel={() => handleCancelBible(job.bibleJob!.workId)}
              />
            ) : null
          )}
        </div>
      )}

      {/* Legend - 확장된 상태에서만 표시 */}
      {isExpanded && unifiedJobs.length > 0 && (
        <div className="px-4 py-2 bg-muted/30 border-t border-border flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Languages className="h-2 w-2 text-blue-600 dark:text-blue-400" />
            </div>
            <span>번역</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <BookOpen className="h-2 w-2 text-violet-600 dark:text-violet-400" />
            </div>
            <span>설정집</span>
          </div>
        </div>
      )}
    </div>
  );
}
