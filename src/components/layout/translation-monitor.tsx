"use client";

import { CheckCircle, X, XCircle, ChevronDown, ChevronUp, Pause, Play } from "lucide-react";
import { Spinner, ButtonSpinner } from "@/components/ui/spinner";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useTranslation, TranslationJobSummary } from "@/contexts/translation-context";
import { cn } from "@/lib/utils";

function JobCard({
  job,
  onRemove,
  onPause,
  onResume,
}: {
  job: TranslationJobSummary;
  onRemove: () => void;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPausing, setIsPausing] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const overallProgress =
    job.totalChapters > 0
      ? (job.completedChapters / job.totalChapters) * 100
      : 0;

  const isCompleted = job.status === "COMPLETED";
  const isFailed = job.status === "FAILED";
  const isPaused = job.status === "PAUSED";
  const isActive = job.status === "PENDING" || job.status === "IN_PROGRESS";

  const handlePause = async () => {
    setIsPausing(true);
    try {
      await onPause();
    } finally {
      setIsPausing(false);
    }
  };

  const handleResume = async () => {
    setIsResuming(true);
    try {
      await onResume();
    } finally {
      setIsResuming(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border transition-all overflow-hidden",
        isCompleted
          ? "bg-status-success/5 border-status-success/30"
          : isFailed
            ? "bg-status-error/5 border-status-error/30"
            : isPaused
              ? "bg-status-warning/5 border-status-warning/30"
              : "bg-status-progress/5 border-status-progress/30 translation-progress-card active"
      )}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isCompleted ? (
            <CheckCircle className="h-4 w-4 text-status-success shrink-0" aria-label="완료" />
          ) : isFailed ? (
            <XCircle className="h-4 w-4 text-status-error shrink-0" aria-label="실패" />
          ) : isPaused ? (
            <Pause className="h-4 w-4 text-status-warning shrink-0" aria-label="일시정지" />
          ) : (
            <Spinner size="md" label="번역 진행 중..." className="text-status-progress shrink-0" />
          )}
          <span
            className={cn(
              "text-xs font-medium truncate",
              isCompleted
                ? "text-status-success"
                : isFailed
                  ? "text-status-error"
                  : isPaused
                    ? "text-status-warning"
                    : "text-status-progress"
            )}
          >
            {isCompleted
              ? "번역 완료"
              : isFailed
                ? "번역 실패"
                : isPaused
                  ? "일시정지됨"
                  : "번역 중..."}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* 일시정지 버튼 - 진행 중일 때만 표시 */}
          {isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 hover:bg-status-warning/20"
              disabled={isPausing}
              onClick={(e) => {
                e.stopPropagation();
                handlePause();
              }}
              title="일시정지"
            >
              {isPausing ? (
                <Spinner size="sm" label="일시정지 중" className="text-status-warning" />
              ) : (
                <Pause className="h-3 w-3 text-status-warning" />
              )}
            </Button>
          )}
          {/* 닫기 버튼 - 완료, 실패, 일시정지 상태에서 표시 */}
          {(isCompleted || isFailed || isPaused) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 hover:bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2.5">
          {/* Work Title */}
          <Link
            href={`/works/${job.workId}`}
            className={cn(
              "block text-xs truncate hover:underline",
              isCompleted
                ? "text-status-success"
                : isFailed
                  ? "text-status-error"
                  : isPaused
                    ? "text-status-warning"
                    : "text-status-progress"
            )}
          >
            {job.workTitle}
          </Link>

          {/* Overall Progress */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span
                className={cn(
                  "font-medium",
                  isCompleted
                    ? "text-status-success"
                    : isFailed
                      ? "text-status-error"
                      : isPaused
                        ? "text-status-warning"
                        : "text-status-progress"
                )}
              >
                전체 진행률
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  isCompleted
                    ? "text-status-success/80"
                    : isFailed
                      ? "text-status-error/80"
                      : isPaused
                        ? "text-status-warning/80"
                        : "text-status-progress/80"
                )}
              >
                {job.completedChapters}/{job.totalChapters}
              </span>
            </div>
            <Progress
              value={overallProgress}
              className={cn(
                "h-1.5",
                isCompleted
                  ? "[&>div]:bg-status-success"
                  : isFailed
                    ? "[&>div]:bg-status-error"
                    : isPaused
                      ? "[&>div]:bg-status-warning"
                      : "[&>div]:bg-status-progress"
              )}
            />
          </div>

          {/* Current Chapter Info */}
          {isActive && job.currentChapter && (
            <div className="text-[10px] text-status-progress">
              {job.currentChapter.number}화 번역 중
            </div>
          )}

          {/* Error Message */}
          {isFailed && job.error && (
            <p className="text-[10px] text-status-error line-clamp-2">
              {job.error}
            </p>
          )}

          {/* Action Buttons */}
          {isCompleted && (
            <Link
              href={`/works/${job.workId}`}
              className="block text-center text-[10px] text-status-success font-medium hover:underline pt-1"
            >
              프로젝트 보기 →
            </Link>
          )}

          {/* Resume Button for Paused Jobs */}
          {isPaused && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResume}
              disabled={isResuming}
              className="w-full h-7 text-[10px] border-status-warning/30 text-status-warning hover:bg-status-warning/10"
            >
              {isResuming ? (
                <>
                  <ButtonSpinner className="text-status-warning" />
                  재개 중...
                </>
              ) : (
                <>
                  <Play className="mr-1 h-3 w-3" />
                  번역 재개
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function TranslationMonitor() {
  const { jobs, removeJob, pauseJob } = useTranslation();

  if (jobs.length === 0) {
    return null;
  }

  // 일시정지 핸들러
  const handlePause = async (jobId: string) => {
    const success = await pauseJob(jobId);
    if (success) {
      toast.success("번역이 일시정지되었습니다.");
    } else {
      toast.error("일시정지에 실패했습니다.");
    }
  };

  // 재개 핸들러 - 일시정지된 작업의 남은 챕터를 새 작업으로 시작
  const handleResume = async (job: TranslationJobSummary) => {
    try {
      // 남은 챕터 번호 조회
      const pendingChapters = job.totalChapters - job.completedChapters;
      if (pendingChapters <= 0) {
        toast.error("재개할 챕터가 없습니다.");
        return;
      }

      // 작업 제거
      await removeJob(job.jobId);

      // 새 번역 시작을 위해 작품 페이지로 이동 안내
      toast.success(
        `${pendingChapters}개 챕터 남음. 작품 페이지에서 번역을 다시 시작해주세요.`,
        { duration: 5000 }
      );
    } catch (error) {
      console.error("재개 실패:", error);
      toast.error("재개에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <JobCard
          key={job.jobId}
          job={job}
          onRemove={() => removeJob(job.jobId)}
          onPause={() => handlePause(job.jobId)}
          onResume={() => handleResume(job)}
        />
      ))}
    </div>
  );
}
