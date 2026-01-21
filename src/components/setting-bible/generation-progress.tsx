"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, CheckCircle2, XCircle, Sparkles } from "lucide-react";
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
  batchSize?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

interface GenerationState {
  status: "idle" | "generating" | "completed" | "failed";
  currentBatch: number;
  totalBatches: number;
  analyzedChapters: number;
  error?: string;
  retryCount?: number;
  stats?: {
    characters: number;
    terms: number;
    events: number;
  };
}

// 배치 재시도 설정 (Vercel Pro 최적화)
const BATCH_MAX_RETRIES = 3;
const BATCH_RETRY_DELAY_MS = 15000; // 15초 (빠른 재시도)
const BATCH_INTERVAL_DELAY_MS = 1000; // 배치 간 1초 대기 (Gemini 자체 rate limit 활용)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function GenerationProgress({
  workId,
  workTitle,
  totalChapters,
  batchSize = 10, // 10개씩 (Vercel Pro 타임아웃 확장)
  open,
  onOpenChange,
  onComplete,
}: GenerationProgressProps) {
  const [state, setState] = useState<GenerationState>({
    status: "idle",
    currentBatch: 0,
    totalBatches: Math.ceil(totalChapters / batchSize),
    analyzedChapters: 0,
  });

  const [shouldCancel, setShouldCancel] = useState(false);
  const shouldCancelRef = useRef(false);

  // 전역 상태 관리
  const {
    startGeneration,
    updateProgress,
    completeGeneration,
    failGeneration,
    cancelGeneration,
    isCancelRequested,
    clearCancelRequest,
  } = useBibleGeneration();

  // 외부 취소 요청 감시
  useEffect(() => {
    if (isCancelRequested(workId)) {
      console.log("[GenerationProgress] 외부 취소 요청 감지");
      shouldCancelRef.current = true;
      setShouldCancel(true);
      clearCancelRequest(workId);
    }
  }, [workId, isCancelRequested, clearCancelRequest]);

  // 페이지 이탈 방지 (생성 중일 때)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.status === "generating") {
        e.preventDefault();
        e.returnValue = "설정집 분석이 진행 중입니다. 페이지를 벗어나면 분석이 중단됩니다.";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state.status]);

  const generateBible = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "generating", error: undefined }));
    setShouldCancel(false);
    shouldCancelRef.current = false;
    clearCancelRequest(workId); // 시작할 때 기존 취소 요청 클리어

    const totalBatches = Math.ceil(totalChapters / batchSize);

    // 전역 상태에 작업 시작 알림
    startGeneration(workId, workTitle, totalChapters, batchSize);

    try {
      // 먼저 설정집 초기화
      const initResponse = await fetch(`/api/works/${workId}/setting-bible`, {
        method: "POST",
      });

      if (!initResponse.ok) {
        const error = await initResponse.json();
        // 이미 존재하는 경우 계속 진행
        if (!error.error?.includes("이미")) {
          throw new Error(error.error || "설정집 초기화 실패");
        }
      }

      // 배치별로 분석 실행
      for (let batch = 0; batch < totalBatches; batch++) {
        if (shouldCancelRef.current) {
          setState((prev) => ({
            ...prev,
            status: "idle",
            error: "취소됨",
          }));
          cancelGeneration(workId);
          return;
        }

        const startChapter = batch * batchSize + 1;
        const endChapter = Math.min((batch + 1) * batchSize, totalChapters);
        const chapterNumbers = Array.from(
          { length: endChapter - startChapter + 1 },
          (_, i) => startChapter + i
        );

        setState((prev) => ({
          ...prev,
          currentBatch: batch + 1,
          retryCount: 0,
        }));

        // 전역 상태 업데이트
        updateProgress(workId, {
          currentBatch: batch + 1,
          retryCount: 0,
        });

        // 배치 재시도 로직
        let batchSuccess = false;
        let lastError: Error | null = null;

        for (let retry = 0; retry < BATCH_MAX_RETRIES; retry++) {
          if (shouldCancelRef.current) break;

          try {
            if (retry > 0) {
              setState((prev) => ({ ...prev, retryCount: retry }));
              updateProgress(workId, { retryCount: retry });
              console.log(`[GenerationProgress] 배치 ${batch + 1} 재시도 ${retry}/${BATCH_MAX_RETRIES}, ${BATCH_RETRY_DELAY_MS / 1000}초 대기...`);
              await sleep(BATCH_RETRY_DELAY_MS);
            }

            const response = await fetch(
              `/api/works/${workId}/setting-bible/analyze-batch`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chapterNumbers }),
              }
            );

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || "분석 실패");
            }

            const result = await response.json();

            setState((prev) => ({
              ...prev,
              analyzedChapters: result.analyzedChapters,
              stats: result.stats,
              retryCount: 0,
            }));

            // 전역 상태 업데이트
            updateProgress(workId, {
              analyzedChapters: result.analyzedChapters,
              stats: result.stats,
              retryCount: 0,
            });

            batchSuccess = true;
            break; // 성공하면 재시도 루프 종료
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console.error(`[GenerationProgress] 배치 ${batch + 1} 시도 ${retry + 1} 실패:`, lastError.message);
          }
        }

        if (!batchSuccess && lastError) {
          throw lastError;
        }

        // 다음 배치 전 딜레이 (API 부하 방지)
        if (batch < totalBatches - 1) {
          console.log(`[GenerationProgress] 다음 배치 전 ${BATCH_INTERVAL_DELAY_MS / 1000}초 대기...`);
          await sleep(BATCH_INTERVAL_DELAY_MS);
        }
      }

      setState((prev) => ({
        ...prev,
        status: "completed",
      }));

      // 전역 상태에 완료 알림
      completeGeneration(workId, state.stats);

      toast.success("설정집 생성이 완료되었습니다!");
      onComplete();
    } catch (error) {
      console.error("Bible generation error:", error);
      const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
      setState((prev) => ({
        ...prev,
        status: "failed",
        error: errorMessage,
      }));

      // 전역 상태에 실패 알림
      failGeneration(workId, errorMessage);

      toast.error(error instanceof Error ? error.message : "설정집 생성 실패");
    }
  }, [workId, workTitle, totalChapters, batchSize, onComplete, startGeneration, updateProgress, completeGeneration, failGeneration, cancelGeneration, clearCancelRequest, state.stats]);

  // 다이얼로그가 열리면 자동 시작
  useEffect(() => {
    if (open && state.status === "idle") {
      generateBible();
    }
  }, [open, state.status, generateBible]);

  // 다이얼로그 닫힐 때 상태 초기화
  useEffect(() => {
    if (!open) {
      setState({
        status: "idle",
        currentBatch: 0,
        totalBatches: Math.ceil(totalChapters / batchSize),
        analyzedChapters: 0,
      });
    }
  }, [open, totalChapters, batchSize]);

  const progressPercent =
    state.totalBatches > 0
      ? Math.round((state.currentBatch / state.totalBatches) * 100)
      : 0;

  const handleCancel = () => {
    setShouldCancel(true);
    shouldCancelRef.current = true;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {state.status === "generating" && (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {state.status === "completed" && (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            )}
            {state.status === "failed" && (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
            {state.status === "idle" && (
              <Sparkles className="h-5 w-5 text-primary" />
            )}
            설정집 생성
          </DialogTitle>
          <DialogDescription>
            {state.status === "generating" && state.retryCount && state.retryCount > 0
              ? `재시도 중... (${state.retryCount}/${BATCH_MAX_RETRIES})`
              : state.status === "generating" && "AI가 원문을 분석하고 있습니다..."}
            {state.status === "completed" && "설정집 생성이 완료되었습니다."}
            {state.status === "failed" && "설정집 생성에 실패했습니다."}
            {state.status === "idle" && "설정집 생성을 준비중입니다..."}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* 진행률 바 */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>분석 진행률</span>
              <span className="tabular-nums">
                {state.currentBatch}/{state.totalBatches} 배치 ({progressPercent}%)
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* 분석 상태 */}
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>분석된 회차</span>
            <span className="tabular-nums">
              {state.analyzedChapters}/{totalChapters}화
            </span>
          </div>

          {/* 통계 */}
          {state.stats && (
            <div className="grid grid-cols-3 gap-2 p-3 bg-muted rounded-lg">
              <div className="text-center">
                <div className="text-lg font-semibold">{state.stats.characters}</div>
                <div className="text-xs text-muted-foreground">인물</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{state.stats.terms}</div>
                <div className="text-xs text-muted-foreground">용어</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">{state.stats.events}</div>
                <div className="text-xs text-muted-foreground">이벤트</div>
              </div>
            </div>
          )}

          {/* 페이지 이탈 주의 안내 */}
          {state.status === "generating" && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              <p className="font-medium">분석 중 이 페이지를 벗어나지 마세요</p>
              <p className="mt-1 text-xs text-blue-600">페이지를 닫거나 이동하면 분석이 중단됩니다.</p>
            </div>
          )}

          {/* 재시도 상태 표시 */}
          {state.status === "generating" && state.retryCount && state.retryCount > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
              API 서버가 혼잡합니다. 15초 후 자동으로 재시도합니다...
            </div>
          )}

          {/* 에러 메시지 */}
          {state.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <p className="font-medium">{state.error}</p>
              {state.error.includes("503") || state.error.includes("overload") ? (
                <p className="mt-1 text-xs">AI 서버가 과부하 상태입니다. 잠시 후 다시 시도해주세요.</p>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter>
          {state.status === "generating" && (
            <Button variant="outline" onClick={handleCancel}>
              취소
            </Button>
          )}
          {(state.status === "completed" || state.status === "failed") && (
            <Button onClick={() => onOpenChange(false)}>
              확인
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
