"use client";

import Link from "next/link";
import { Pause, Zap } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/contexts/translation-context";

interface QuickActionsProps {
  workId: string;
  settingBibleConfirmed: boolean;
  settingBibleExists: boolean;
  characterCount: number;
  termCount: number;
  glossaryCount: number;
}

export function QuickActions({
  workId,
  settingBibleConfirmed,
  settingBibleExists,
  characterCount,
  termCount,
  glossaryCount,
}: QuickActionsProps) {
  const { getJobByWorkId } = useTranslation();
  const job = getJobByWorkId(workId);

  const isActive = job && (job.status === "PENDING" || job.status === "IN_PROGRESS");
  const isPaused = job?.status === "PAUSED";

  // 중앙화된 진행률 사용
  const displayProgress = job?.progress ?? 0;

  return (
    <div className="space-y-2">
      {/* 설정집 관리 */}
      <Link
        href={`/works/${workId}/setting-bible`}
        className={`flex items-center justify-between w-full px-4 py-3 rounded-lg text-sm transition-colors ${
          settingBibleConfirmed
            ? "bg-muted hover:bg-muted/80"
            : "bg-primary/10 border border-primary/20 hover:bg-primary/20"
        }`}
      >
        <span className={!settingBibleConfirmed ? "font-medium" : ""}>
          설정집 {settingBibleConfirmed ? "확인" : "생성"}
        </span>
        {settingBibleExists ? (
          <span className="text-xs text-muted-foreground">
            {characterCount}명 · {termCount}개
          </span>
        ) : (
          <span className="text-xs text-primary">필수</span>
        )}
      </Link>

      {/* AI 번역 - 상태에 따라 다른 UI */}
      {isActive ? (
        // 번역 활성 상태 - 진행률 카드
        <Link
          href={`/works/${workId}/translate`}
          className="block w-full px-4 py-3 bg-status-progress/10 border border-status-progress/30 rounded-lg transition-colors hover:bg-status-progress/20 translation-progress-card active"
        >
          <div className="flex items-center gap-2 mb-2">
            <Spinner size="sm" className="text-status-progress" />
            <span className="text-sm font-medium text-status-progress">
              번역 진행 중
            </span>
          </div>
          <div className="relative mb-2">
            <Progress
              value={displayProgress}
              className="h-1.5 [&>div]:bg-status-progress"
            />
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div className="progress-shimmer h-full w-full" />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-status-progress tabular-nums">
              {displayProgress}%
            </span>
            {job?.currentChapter && (
              <span className="text-status-progress/70">
                {job.currentChapter.number}화 번역 중
              </span>
            )}
          </div>
          <div className="mt-2 pt-2 border-t border-status-progress/20">
            <span className="text-xs text-status-progress font-medium">
              상세보기 →
            </span>
          </div>
        </Link>
      ) : isPaused ? (
        // 일시정지 상태
        <Link
          href={`/works/${workId}/translate`}
          className="block w-full px-4 py-3 bg-status-warning/10 border border-status-warning/30 rounded-lg transition-colors hover:bg-status-warning/20"
        >
          <div className="flex items-center gap-2 mb-2">
            <Pause className="h-4 w-4 text-status-warning" />
            <span className="text-sm font-medium text-status-warning">
              번역 일시정지됨
            </span>
          </div>
          <Progress
            value={displayProgress}
            className="h-1.5 mb-2 [&>div]:bg-status-warning"
          />
          <div className="flex items-center justify-between text-xs">
            <span className="text-status-warning tabular-nums">
              {job?.completedChapters}/{job?.totalChapters}화 완료
            </span>
            <span className="text-status-warning font-medium">
              재개하기 →
            </span>
          </div>
        </Link>
      ) : settingBibleConfirmed ? (
        // 번역 가능 상태 - 강조 버튼
        <Link
          href={`/works/${workId}/translate`}
          className="flex items-center justify-between w-full px-4 py-3 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span>AI 번역 시작</span>
          </div>
          <span>→</span>
        </Link>
      ) : (
        // 설정집 미확정 - 비활성 상태
        <div className="flex items-center justify-between w-full px-4 py-3 bg-muted/50 rounded-lg text-sm text-muted-foreground cursor-not-allowed">
          <span>AI 번역 시작</span>
          <span className="text-xs">설정집 확정 필요</span>
        </div>
      )}

      {/* 용어집 확인 */}
      <Link
        href={`/works/${workId}/glossary`}
        className="flex items-center justify-between w-full px-4 py-3 bg-muted rounded-lg text-sm hover:bg-muted/80 transition-colors"
      >
        <span>용어집 확인</span>
        <span className="text-muted-foreground">{glossaryCount}개</span>
      </Link>

      {/* 회차 일괄 업로드 */}
      <Link
        href={`/works/${workId}/chapters`}
        className="flex items-center justify-between w-full px-4 py-3 bg-muted rounded-lg text-sm hover:bg-muted/80 transition-colors"
      >
        <span>회차 일괄 업로드</span>
        <span className="text-muted-foreground">→</span>
      </Link>
    </div>
  );
}
