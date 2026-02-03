"use client";

import { CheckCircle, X, XCircle, ChevronDown, ChevronUp, StopCircle } from "lucide-react";
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
  onCancel,
}: {
  job: TranslationJobSummary;
  onRemove: () => void;
  onCancel: () => Promise<void>;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);

  const overallProgress =
    job.totalChapters > 0
      ? (job.completedChapters / job.totalChapters) * 100
      : 0;

  const isCompleted = job.status === "COMPLETED";
  const isFailed = job.status === "FAILED";
  const isActive = job.status === "PENDING" || job.status === "IN_PROGRESS";

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await onCancel();
    } finally {
      setIsCancelling(false);
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
                  : "text-status-progress"
            )}
          >
            {isCompleted
              ? "번역 완료"
              : isFailed
                ? "번역 실패"
                : "번역 중..."}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* 취소 버튼 - 진행 중일 때만 표시 */}
          {isActive && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 hover:bg-status-error/20"
              disabled={isCancelling}
              onClick={(e) => {
                e.stopPropagation();
                handleCancel();
              }}
              title="취소"
            >
              {isCancelling ? (
                <Spinner size="sm" label="취소 중" className="text-status-error" />
              ) : (
                <StopCircle className="h-3 w-3 text-status-error" />
              )}
            </Button>
          )}
          {/* 닫기 버튼 - 완료, 실패 상태에서 표시 */}
          {(isCompleted || isFailed) && (
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
        </div>
      )}
    </div>
  );
}

export function TranslationMonitor() {
  const { jobs, removeJob, cancelJob } = useTranslation();

  if (jobs.length === 0) {
    return null;
  }

  // 취소 핸들러
  const handleCancel = async (workId: string) => {
    const success = await cancelJob(workId);
    if (success) {
      toast.info("번역 작업이 취소되었습니다.");
    } else {
      toast.error("작업 취소에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <JobCard
          key={job.jobId}
          job={job}
          onRemove={() => removeJob(job.jobId)}
          onCancel={() => handleCancel(job.workId)}
        />
      ))}
    </div>
  );
}
