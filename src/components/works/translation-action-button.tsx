"use client";

import Link from "next/link";
import { Pause, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useTranslation } from "@/contexts/translation-context";

interface TranslationActionButtonProps {
  workId: string;
  settingBibleConfirmed: boolean;
}

export function TranslationActionButton({
  workId,
  settingBibleConfirmed,
}: TranslationActionButtonProps) {
  const { getJobByWorkId } = useTranslation();
  const job = getJobByWorkId(workId);

  const isActive = job && (job.status === "PENDING" || job.status === "IN_PROGRESS");
  const isPaused = job?.status === "PAUSED";

  // 중앙화된 진행률 사용
  const displayProgress = job?.progress ?? 0;

  // 번역 활성 상태
  if (isActive) {
    return (
      <Button
        asChild
        className="gap-2 bg-status-progress hover:bg-status-progress/90 text-white"
      >
        <Link href={`/works/${workId}/translate`}>
          <Spinner size="sm" className="text-white" />
          <span>번역 중 {displayProgress}%</span>
        </Link>
      </Button>
    );
  }

  // 일시정지 상태
  if (isPaused) {
    return (
      <Button
        asChild
        variant="outline"
        className="gap-2 border-status-warning text-status-warning hover:bg-status-warning/10"
      >
        <Link href={`/works/${workId}/translate`}>
          <Pause className="h-4 w-4" />
          <span>일시정지됨 {displayProgress}%</span>
        </Link>
      </Button>
    );
  }

  // 설정집 미확정 상태
  if (!settingBibleConfirmed) {
    return (
      <Button variant="outline" asChild>
        <Link href={`/works/${workId}/setting-bible`}>설정집 관리</Link>
      </Button>
    );
  }

  // 기본 상태 - 번역 시작 가능
  return (
    <Button variant="outline" asChild className="gap-2">
      <Link href={`/works/${workId}/translate`}>
        <Zap className="h-4 w-4" />
        번역 시작
      </Link>
    </Button>
  );
}
