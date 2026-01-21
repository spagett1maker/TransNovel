"use client";

import { Loader2, Pause, Zap } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "@/contexts/translation-context";
import { cn } from "@/lib/utils";

interface WorkCardClientProps {
  workId: string;
  href: string;
  children: ReactNode;
  className?: string;
}

/**
 * 프로젝트 카드 클라이언트 래퍼
 * 서버 렌더링된 카드 내용을 감싸고, 번역 상태 오버레이를 추가
 */
export function WorkCardClient({
  workId,
  href,
  children,
  className,
}: WorkCardClientProps) {
  const { getJobByWorkId } = useTranslation();
  const job = getJobByWorkId(workId);

  const isActive = job && (job.status === "PENDING" || job.status === "IN_PROGRESS");
  const isPaused = job?.status === "PAUSED";

  const progress =
    job && job.totalChapters > 0
      ? Math.round((job.completedChapters / job.totalChapters) * 100)
      : 0;

  return (
    <Link
      href={href}
      className={cn(
        "project-card group relative overflow-hidden",
        isActive && "ring-2 ring-status-progress/50",
        isPaused && "ring-2 ring-status-warning/50",
        className
      )}
    >
      {children}

      {/* 번역 상태 오버레이 */}
      {(isActive || isPaused) && job && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 p-3 transition-all",
            isActive && "bg-status-progress text-white",
            isPaused && "bg-status-warning text-white"
          )}
        >
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              {isActive && <Zap className="h-4 w-4" />}
              {isPaused && <Pause className="h-4 w-4" />}
              <span className="text-sm font-medium">
                {isActive && "번역 중"}
                {isPaused && "일시정지"}
              </span>
            </div>
            {isActive && (
              <span className="text-sm tabular-nums opacity-90">
                {progress}%
              </span>
            )}
          </div>
          {isActive && (
            <>
              <Progress
                value={progress}
                className="h-1 bg-white/30 [&>div]:bg-white"
              />
              {job.currentChapter && (
                <p className="text-xs opacity-80 mt-1">
                  {job.currentChapter.number}화 번역 중
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Link>
  );
}

/**
 * 번역 상태 인라인 배지
 * 프로젝트 카드 내부에서 사용 (상태 배지 옆에 표시)
 */
interface TranslationStatusInlineProps {
  workId: string;
  className?: string;
}

export function TranslationStatusInline({
  workId,
  className,
}: TranslationStatusInlineProps) {
  const { getJobByWorkId } = useTranslation();
  const job = getJobByWorkId(workId);

  if (!job) {
    return null;
  }

  const isActive = job.status === "PENDING" || job.status === "IN_PROGRESS";
  const isPaused = job.status === "PAUSED";

  // 완료/실패 상태는 표시하지 않음
  if (!isActive && !isPaused) {
    return null;
  }

  const progress =
    job.totalChapters > 0
      ? Math.round((job.completedChapters / job.totalChapters) * 100)
      : 0;

  return (
    <Badge
      variant={isActive ? "progress" : "warning"}
      className={cn("gap-1 text-xs", className)}
    >
      {isActive && <Loader2 className="h-3 w-3 animate-spin" />}
      {isPaused && <Pause className="h-3 w-3" />}
      {isActive && `번역 ${progress}%`}
      {isPaused && "일시정지"}
    </Badge>
  );
}
