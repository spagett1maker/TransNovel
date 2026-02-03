"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, CheckCircle2, XCircle, Sparkles, CloudOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useBibleGeneration } from "@/contexts/bible-generation-context";

interface GenerationProgressProps {
  workId: string;
  workTitle: string;
  totalChapters: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void | Promise<void>;
}

// 서버 작업 상태
interface JobStatus {
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  totalBatches: number;
  currentBatchIndex: number;
  analyzedChapters: number;
  errorMessage?: string | null;
  lastError?: string | null;
}

const POLL_INTERVAL_MS = 3000;

export function GenerationProgress({
  workId,
  workTitle,
  totalChapters,
  open,
  onOpenChange,
  onComplete,
}: GenerationProgressProps) {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [stats, setStats] = useState<{ characters: number; terms: number; events: number } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const hasCompletedRef = useRef(false);

  const { registerJob, cancelGeneration } = useBibleGeneration();

  // Polling 시작
  const startPolling = useCallback(() => {
    if (pollRef.current) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/works/${workId}/setting-bible/status`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.stats) setStats(data.stats);

        const serverJob = data.job as JobStatus | null;
        if (!serverJob) return;

        setJobStatus(serverJob);

        if (serverJob.status === "COMPLETED" && !hasCompletedRef.current) {
          hasCompletedRef.current = true;
          stopPolling();
          toast.success("설정집 생성이 완료되었습니다!");
          await onComplete();
        } else if (serverJob.status === "FAILED") {
          stopPolling();
        } else if (serverJob.status === "CANCELLED") {
          stopPolling();
        }
      } catch {
        // 네트워크 에러 무시 (다음 poll에서 재시도)
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, onComplete]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // 생성 시작
  const startGeneration = useCallback(async () => {
    setIsStarting(true);
    setLocalError(null);
    hasCompletedRef.current = false;

    try {
      const result = await registerJob(workId, workTitle, totalChapters);

      if (result === null) {
        // 이미 전부 분석됨
        toast.success("이미 모든 회차가 분석되었습니다.");
        await onComplete();
        return;
      }

      // polling 시작
      startPolling();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "작업 생성에 실패했습니다.";
      setLocalError(msg);
      toast.error(msg);
    } finally {
      setIsStarting(false);
    }
  }, [workId, workTitle, totalChapters, registerJob, startPolling, onComplete]);

  // 다이얼로그 열리면 자동 시작
  useEffect(() => {
    if (open && !jobStatus && !isStarting) {
      startGeneration();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 다이얼로그 닫힐 때 polling 정지 + 상태 초기화
  useEffect(() => {
    if (!open) {
      stopPolling();
      // 완료/실패 상태가 아닐 때만 초기화 (닫아도 서버에서 계속 처리됨)
      if (jobStatus?.status !== "COMPLETED" && jobStatus?.status !== "FAILED") {
        // 초기화하지 않음 — 다시 열면 polling 재개
      }
    }
  }, [open, jobStatus?.status, stopPolling]);

  // 클린업
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleCancel = async () => {
    stopPolling();
    await cancelGeneration(workId);
    toast.info("설정집 생성이 취소되었습니다.");
    onOpenChange(false);
  };

  const isActive = jobStatus?.status === "PENDING" || jobStatus?.status === "IN_PROGRESS";
  const isCompleted = jobStatus?.status === "COMPLETED";
  const isFailed = jobStatus?.status === "FAILED";

  const progressPercent = jobStatus && jobStatus.totalBatches > 0
    ? Math.round((jobStatus.currentBatchIndex / jobStatus.totalBatches) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(isStarting || isActive) && (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {isCompleted && (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            )}
            {isFailed && (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            {!jobStatus && !isStarting && !localError && (
              <Sparkles className="h-5 w-5 text-primary" />
            )}
            {localError && (
              <CloudOff className="h-5 w-5 text-destructive" />
            )}
            설정집 생성
          </DialogTitle>
          <DialogDescription>
            {isStarting && "설정집 생성을 준비 중입니다..."}
            {isActive && "AI가 원문을 분석하고 있습니다..."}
            {isCompleted && "설정집 생성이 완료되었습니다."}
            {isFailed && "설정집 생성에 실패했습니다."}
            {localError && localError}
            {!jobStatus && !isStarting && !localError && "설정집 생성을 준비 중입니다..."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* 진행률 바 */}
          {jobStatus && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>분석 진행률</span>
                <span className="tabular-nums">
                  {jobStatus.currentBatchIndex}/{jobStatus.totalBatches} 배치 ({progressPercent}%)
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          )}

          {/* 분석 상태 */}
          {jobStatus && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>분석된 회차</span>
              <span className="tabular-nums">
                {jobStatus.analyzedChapters}/{totalChapters}화
              </span>
            </div>
          )}

          {/* 통계 */}
          {stats && (
            <div className="grid grid-cols-3 gap-2 p-3 bg-muted rounded-lg">
              <div className="text-center">
                <div className="text-lg font-semibold">{stats.characters}</div>
                <div className="text-xs text-muted-foreground">인물</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{stats.terms}</div>
                <div className="text-xs text-muted-foreground">용어</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{stats.events}</div>
                <div className="text-xs text-muted-foreground">이벤트</div>
              </div>
            </div>
          )}

          {/* 백그라운드 안내 */}
          {isActive && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary">
              <p className="font-medium">백그라운드에서 계속 진행됩니다</p>
              <p className="mt-1 text-xs text-primary/80">이 창을 닫거나 페이지를 이동해도 서버에서 자동으로 분석이 계속됩니다.</p>
            </div>
          )}

          {/* 에러 메시지 */}
          {(isFailed || localError) && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              <p className="font-medium">
                {jobStatus?.errorMessage || jobStatus?.lastError || localError}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {isActive && (
            <Button variant="outline" onClick={handleCancel}>
              취소
            </Button>
          )}
          {isActive && (
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
          )}
          {(isCompleted || isFailed || (!isActive && !isStarting)) && (
            <Button onClick={() => onOpenChange(false)}>
              확인
            </Button>
          )}
          {isFailed && (
            <Button onClick={startGeneration}>
              재시도
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
