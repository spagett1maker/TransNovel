"use client";

import { Loader2, CheckCircle2, AlertTriangle, Pause, Zap } from "lucide-react";
import Link from "next/link";

import { Progress } from "@/components/ui/progress";
import { useTranslation, type TranslationJobSummary } from "@/contexts/translation-context";
import { cn } from "@/lib/utils";

interface TranslationStatusBadgeProps {
  workId: string;
  variant?: "badge" | "card" | "inline";
  className?: string;
}

/**
 * 번역 상태 배지 컴포넌트
 * 프로젝트 목록, 상세 페이지 등에서 사용
 */
export function TranslationStatusBadge({
  workId,
  variant = "badge",
  className,
}: TranslationStatusBadgeProps) {
  const { getJobByWorkId } = useTranslation();
  const job = getJobByWorkId(workId);

  // 활성 작업이 없으면 표시하지 않음
  if (!job) {
    return null;
  }

  const isActive = job.status === "PENDING" || job.status === "IN_PROGRESS";
  const isPaused = job.status === "PAUSED";
  const isCompleted = job.status === "COMPLETED";
  const isFailed = job.status === "FAILED";

  const progress =
    job.totalChapters > 0
      ? Math.round((job.completedChapters / job.totalChapters) * 100)
      : 0;

  // Badge 스타일 (작은 인라인 배지)
  if (variant === "badge") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
          isActive && "bg-status-progress/10 text-status-progress",
          isPaused && "bg-status-warning/10 text-status-warning",
          isCompleted && "bg-status-success/10 text-status-success",
          isFailed && "bg-status-error/10 text-status-error",
          className
        )}
      >
        {isActive && <Loader2 className="h-3 w-3 animate-spin" />}
        {isPaused && <Pause className="h-3 w-3" />}
        {isCompleted && <CheckCircle2 className="h-3 w-3" />}
        {isFailed && <AlertTriangle className="h-3 w-3" />}
        {isActive && `번역 ${progress}%`}
        {isPaused && "일시정지"}
        {isCompleted && "완료"}
        {isFailed && "실패"}
      </span>
    );
  }

  // Inline 스타일 (텍스트와 함께 표시)
  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs",
          isActive && "text-status-progress",
          isPaused && "text-status-warning",
          isCompleted && "text-status-success",
          isFailed && "text-status-error",
          className
        )}
      >
        {isActive && <Loader2 className="h-3 w-3 animate-spin" />}
        {isActive && `${progress}%`}
        {isPaused && <Pause className="h-3 w-3" />}
        {isCompleted && <CheckCircle2 className="h-3 w-3" />}
        {isFailed && <AlertTriangle className="h-3 w-3" />}
      </span>
    );
  }

  // Card 스타일 (프로젝트 카드 오버레이용)
  return (
    <div
      className={cn(
        "absolute inset-x-0 bottom-0 p-3 rounded-b-xl",
        isActive && "bg-status-progress/10 border-t border-status-progress/20",
        isPaused && "bg-status-warning/10 border-t border-status-warning/20",
        isCompleted && "bg-status-success/10 border-t border-status-success/20",
        isFailed && "bg-status-error/10 border-t border-status-error/20",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isActive && <Loader2 className="h-4 w-4 animate-spin text-status-progress" />}
          {isPaused && <Pause className="h-4 w-4 text-status-warning" />}
          {isCompleted && <CheckCircle2 className="h-4 w-4 text-status-success" />}
          {isFailed && <AlertTriangle className="h-4 w-4 text-status-error" />}
          <span
            className={cn(
              "text-xs font-medium",
              isActive && "text-status-progress",
              isPaused && "text-status-warning",
              isCompleted && "text-status-success",
              isFailed && "text-status-error"
            )}
          >
            {isActive && "번역 중"}
            {isPaused && "일시정지됨"}
            {isCompleted && "번역 완료"}
            {isFailed && "번역 실패"}
          </span>
        </div>
        {isActive && (
          <span className="text-xs text-status-progress tabular-nums">
            {job.completedChapters}/{job.totalChapters}화
          </span>
        )}
      </div>
      {isActive && (
        <Progress
          value={progress}
          className="h-1 mt-2 [&>div]:bg-status-progress"
        />
      )}
    </div>
  );
}

/**
 * 프로젝트 카드 오버레이 (프로젝트 목록에서 사용)
 * 번역 중인 프로젝트에 오버레이로 상태 표시
 */
interface WorkCardTranslationOverlayProps {
  workId: string;
}

export function WorkCardTranslationOverlay({ workId }: WorkCardTranslationOverlayProps) {
  const { getJobByWorkId } = useTranslation();
  const job = getJobByWorkId(workId);

  if (!job) {
    return null;
  }

  const isActive = job.status === "PENDING" || job.status === "IN_PROGRESS";
  const isPaused = job.status === "PAUSED";

  // 완료/실패 상태는 일정 시간 후 자동으로 사라지므로 표시하지 않음
  if (!isActive && !isPaused) {
    return null;
  }

  const progress =
    job.totalChapters > 0
      ? Math.round((job.completedChapters / job.totalChapters) * 100)
      : 0;

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col justify-end rounded-xl overflow-hidden",
        isActive && "bg-gradient-to-t from-status-progress/20 via-transparent to-transparent",
        isPaused && "bg-gradient-to-t from-status-warning/20 via-transparent to-transparent"
      )}
    >
      <div
        className={cn(
          "p-4",
          isActive && "bg-status-progress/90",
          isPaused && "bg-status-warning/90"
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-white">
            {isActive && <Zap className="h-4 w-4" />}
            {isPaused && <Pause className="h-4 w-4" />}
            <span className="text-sm font-medium">
              {isActive && "번역 진행 중"}
              {isPaused && "일시정지됨"}
            </span>
          </div>
          {isActive && (
            <span className="text-sm text-white/90 tabular-nums">
              {progress}%
            </span>
          )}
        </div>
        {isActive && (
          <>
            <Progress
              value={progress}
              className="h-1.5 bg-white/30 [&>div]:bg-white"
            />
            {job.currentChapter && (
              <p className="text-xs text-white/80 mt-1.5">
                {job.currentChapter.number}화 번역 중
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 프로젝트 목록 전체를 감싸는 클라이언트 래퍼
 * 각 프로젝트 카드에 번역 상태 오버레이를 추가
 */
interface WorksListTranslationOverlayProps {
  workIds: string[];
}

export function WorksListTranslationOverlay({ workIds }: WorksListTranslationOverlayProps) {
  const { jobs } = useTranslation();

  // 활성 작업이 있는 workId 목록
  const activeWorkIds = new Set(
    jobs
      .filter((j) => j.status === "PENDING" || j.status === "IN_PROGRESS" || j.status === "PAUSED")
      .map((j) => j.workId)
  );

  // 표시할 작업이 없으면 null 반환
  if (activeWorkIds.size === 0) {
    return null;
  }

  // CSS로 오버레이를 포지셔닝하기 위한 스크립트
  // 각 프로젝트 카드에 data-work-id 속성이 있다고 가정
  return (
    <>
      {workIds.map((workId) => {
        if (!activeWorkIds.has(workId)) return null;
        return (
          <style key={workId} dangerouslySetInnerHTML={{
            __html: `[data-work-id="${workId}"] { position: relative; }`
          }} />
        );
      })}
    </>
  );
}
