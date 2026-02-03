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

export function GenerationProgress({
  workId,
  workTitle,
  totalChapters,
  open,
  onOpenChange,
  onComplete,
}: GenerationProgressProps) {
  const [localError, setLocalError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const hasCompletedRef = useRef(false);

  const { registerJob, cancelGeneration, getJobByWorkId, stopPolling } = useBibleGeneration();

  // Context에서 job 상태 가져오기 (context가 polling)
  const job = getJobByWorkId(workId);

  // 완료 감지
  useEffect(() => {
    if (job?.status === "completed" && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      toast.success("설정집 생성이 완료되었습니다!");
      onComplete();
    }
  }, [job?.status, onComplete]);

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
      // registerJob 내부에서 startPolling 호출됨
    } catch (err) {
      const msg = err instanceof Error ? err.message : "작업 생성에 실패했습니다.";
      setLocalError(msg);
      toast.error(msg);
    } finally {
      setIsStarting(false);
    }
  }, [workId, workTitle, totalChapters, registerJob, onComplete]);

  // 다이얼로그 열리면 자동 시작
  useEffect(() => {
    if (open && !job && !isStarting && !localError) {
      startGeneration();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 다이얼로그 닫힐 때 (job은 계속 진행됨, polling도 context에서 계속)
  useEffect(() => {
    if (!open) {
      // 완료/실패 시에만 상태 리셋
      if (job?.status === "completed" || job?.status === "failed") {
        hasCompletedRef.current = false;
      }
    }
  }, [open, job?.status]);

  const handleCancel = async () => {
    await cancelGeneration(workId);
    toast.info("설정집 생성이 취소되었습니다.");
    onOpenChange(false);
  };

  const isActive = job?.status === "generating";
  const isCompleted = job?.status === "completed";
  const isFailed = job?.status === "failed";

  const progressPercent = job?.progress ?? 0;

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
            {!job && !isStarting && !localError && (
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
            {!job && !isStarting && !localError && "설정집 생성을 준비 중입니다..."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* 진행률 바 */}
          {job && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>분석 진행률</span>
                <span className="tabular-nums">
                  {job.currentBatch}/{job.totalBatches} 배치 ({progressPercent}%)
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          )}

          {/* 분석 상태 */}
          {job && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>분석된 회차</span>
              <span className="tabular-nums">
                {job.analyzedChapters}/{totalChapters}화
              </span>
            </div>
          )}

          {/* 통계 */}
          {job?.stats && (
            <div className="grid grid-cols-3 gap-2 p-3 bg-muted rounded-lg">
              <div className="text-center">
                <div className="text-lg font-semibold">{job.stats.characters}</div>
                <div className="text-xs text-muted-foreground">인물</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{job.stats.terms}</div>
                <div className="text-xs text-muted-foreground">용어</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{job.stats.events}</div>
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
                {job?.error || localError}
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
