"use client";

import { useState, useEffect, useCallback } from "react";
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
  Minus
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner, ButtonSpinner } from "@/components/ui/spinner";
import { useTranslation, TranslationJobSummary } from "@/contexts/translation-context";
import { cn } from "@/lib/utils";

// 개별 작업 카드
function JobItem({
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

  // 중앙화된 진행률 사용
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

  // 상태별 스타일
  const statusStyles = {
    active: {
      bg: "bg-status-progress/5",
      border: "border-status-progress/30",
      text: "text-status-progress",
      progressBar: "[&>div]:bg-status-progress",
    },
    completed: {
      bg: "bg-status-success/5",
      border: "border-status-success/30",
      text: "text-status-success",
      progressBar: "[&>div]:bg-status-success",
    },
    failed: {
      bg: "bg-status-error/5",
      border: "border-status-error/30",
      text: "text-status-error",
      progressBar: "[&>div]:bg-status-error",
    },
    paused: {
      bg: "bg-status-warning/5",
      border: "border-status-warning/30",
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
          {isCompleted ? (
            <CheckCircle className="h-4 w-4 text-status-success shrink-0" />
          ) : isFailed ? (
            <XCircle className="h-4 w-4 text-status-error shrink-0" />
          ) : isPaused ? (
            <Pause className="h-4 w-4 text-status-warning shrink-0" />
          ) : (
            <Spinner size="sm" label="번역 중" className="text-status-progress shrink-0" />
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
          {/* 일시정지 버튼 - 진행 중일 때 */}
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

          {/* 재개 버튼 - 일시정지 상태일 때 */}
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

          {/* 닫기 버튼 - 완료/실패/일시정지 상태일 때 */}
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

export function GlobalTranslationIndicator() {
  const { jobs, removeJob, pauseJob, resumeJob } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  // 활성 작업 수 (진행 중 또는 대기 중)
  const activeJobs = jobs.filter(
    (job) => job.status === "PENDING" || job.status === "IN_PROGRESS"
  );
  const activeJobsCount = activeJobs.length;

  // 완료/실패된 작업 자동 제거 (5초 후)
  useEffect(() => {
    const completedOrFailedJobs = jobs.filter(
      (job) => job.status === "COMPLETED" || job.status === "FAILED"
    );

    if (completedOrFailedJobs.length > 0) {
      const timers = completedOrFailedJobs.map((job) => {
        return setTimeout(() => {
          removeJob(job.jobId);
        }, 5000);
      });

      return () => {
        timers.forEach((timer) => clearTimeout(timer));
      };
    }
  }, [jobs, removeJob]);

  // 일시정지 핸들러
  const handlePause = useCallback(async (jobId: string) => {
    const success = await pauseJob(jobId);
    if (success) {
      toast.success("번역이 일시정지되었습니다.");
    } else {
      toast.error("일시정지에 실패했습니다.");
    }
  }, [pauseJob]);

  // 재개 핸들러
  const handleResume = useCallback(async (job: TranslationJobSummary) => {
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
  }, [resumeJob]);

  // 표시할 작업이 없으면 렌더링하지 않음
  if (jobs.length === 0) {
    return null;
  }

  // 최소화 상태
  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-status-progress text-white rounded-full shadow-lg hover:bg-status-progress/90 transition-colors translation-active"
      >
        {activeJobsCount > 0 ? (
          <>
            <Spinner size="sm" label="번역 중" className="text-white" />
            <span className="text-sm font-medium">번역 중 {activeJobsCount}</span>
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            <span className="text-sm font-medium">{jobs.length}개 작업</span>
          </>
        )}
      </button>
    );
  }

  // 헤더 스타일 결정
  const hasActiveJobs = activeJobsCount > 0;
  const headerBgClass = hasActiveJobs ? "bg-status-progress" : "bg-muted";
  const headerTextClass = hasActiveJobs ? "text-white" : "text-foreground";

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
            <Spinner size="sm" label="번역 중" className={headerTextClass} />
          ) : (
            <Zap className={cn("h-4 w-4", headerTextClass)} />
          )}
          <span className="text-sm font-medium">
            {hasActiveJobs
              ? `번역 진행 중 (${activeJobsCount})`
              : `번역 작업 (${jobs.length})`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-6 w-6",
              hasActiveJobs
                ? "text-white/80 hover:text-white hover:bg-white/10"
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
          {jobs.map((job, index) => (
            <JobItem
              key={job.jobId}
              job={job}
              isFirst={index === 0}
              onRemove={() => removeJob(job.jobId)}
              onPause={() => handlePause(job.jobId)}
              onResume={() => handleResume(job)}
            />
          ))}
        </div>
      )}

      {/* Footer - 축소된 상태에서만 표시 */}
      {!isExpanded && (
        <div className="px-4 py-2 bg-muted/30">
          <p className="text-[10px] text-muted-foreground text-center">
            클릭하여 작업 목록 확장
          </p>
        </div>
      )}
    </div>
  );
}
