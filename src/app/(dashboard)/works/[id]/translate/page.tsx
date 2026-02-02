"use client";

import {
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Grid3X3,
  Languages,
  List,
  Loader2,
  Pause,
  Sparkles,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ErrorRecovery } from "@/components/translation/error-recovery";
import { useTranslation } from "@/contexts/translation-context";
import { cn } from "@/lib/utils";

interface Chapter {
  id: string;
  number: number;
  title: string | null;
  status: string;
  wordCount: number;
}

// 상태별 색상
const STATUS_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  PENDING: { bg: "bg-muted", border: "border-border", text: "text-muted-foreground" },
  TRANSLATING: { bg: "bg-status-progress/20", border: "border-status-progress", text: "text-status-progress" },
  TRANSLATED: { bg: "bg-status-success/20", border: "border-status-success/50", text: "text-status-success" },
  REVIEWING: { bg: "bg-status-warning/20", border: "border-status-warning", text: "text-status-warning" },
  EDITED: { bg: "bg-status-success/30", border: "border-status-success", text: "text-status-success" },
  APPROVED: { bg: "bg-status-success/30", border: "border-status-success", text: "text-status-success" },
};

// 컴팩트 회차 셀 (그리드용)
const ChapterCell = memo(function ChapterCell({
  chapter,
  isSelected,
  onToggle,
  isTranslating,
  isCurrentlyTranslating,
}: {
  chapter: Chapter;
  isSelected: boolean;
  onToggle: (number: number) => void;
  isTranslating?: boolean;
  isCurrentlyTranslating?: boolean;
}) {
  const isPending = chapter.status === "PENDING";
  // 활성 작업이 없을 때 TRANSLATING(멈춘) 챕터도 선택 가능
  const isStuckTranslating = chapter.status === "TRANSLATING" && !isTranslating;
  const canSelect = (isPending || isStuckTranslating) && !isTranslating;
  const styles = STATUS_STYLES[chapter.status] || STATUS_STYLES.PENDING;
  const isCompleted = ["TRANSLATED", "EDITED", "APPROVED"].includes(chapter.status);

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => canSelect && onToggle(chapter.number)}
            disabled={!canSelect}
            className={cn(
              "relative h-10 w-full rounded-lg border text-sm font-medium tabular-nums transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
              styles.bg,
              styles.border,
              canSelect && "hover:border-primary hover:bg-primary/5 cursor-pointer",
              !canSelect && "cursor-default",
              isSelected && "ring-2 ring-primary border-primary bg-primary/10",
              isCurrentlyTranslating && "animate-pulse border-status-progress bg-status-progress/20"
            )}
          >
            {isCurrentlyTranslating ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto text-status-progress" />
            ) : (
              <span className={cn(
                isSelected ? "text-primary" : styles.text,
                chapter.status === "TRANSLATED" && "text-status-success"
              )}>
                {isCompleted && <span className="sr-only">완료 </span>}
                {isCompleted ? `✓${chapter.number}` : chapter.number}
              </span>
            )}
            {isSelected && (
              <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                <Check className="h-2.5 w-2.5 text-primary-foreground" />
              </div>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p className="font-medium">{chapter.title || `${chapter.number}화`}</p>
          <p className="text-muted-foreground">
            {chapter.wordCount.toLocaleString()}자 ·{" "}
            {chapter.status === "PENDING" ? "대기" :
             chapter.status === "TRANSLATED" ? "번역완료" :
             chapter.status === "TRANSLATING" ? "번역중" :
             chapter.status === "EDITED" ? "윤문완료" :
             chapter.status === "FAILED" ? "실패" : chapter.status}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

// 서버 측 번역 진행률 모니터 (간소화)
function ServerTranslationProgress({
  job,
  onPause,
  onComplete,
  onRetry,
}: {
  job: {
    jobId: string;
    status: string;
    totalChapters: number;
    completedChapters: number;
    failedChapters: number;
    failedChapterNums: number[];
    currentChapter?: { number: number; currentChunk?: number; totalChunks?: number };
    error?: string;
  };
  onPause: () => void;
  onComplete: () => void;
  onRetry: (chapterNumbers: number[]) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const totalProgress = job.totalChapters > 0
    ? Math.round((job.completedChapters / job.totalChapters) * 100)
    : 0;

  useEffect(() => {
    // 완료 또는 실패(부분 완료 포함) 시 챕터 목록 새로고침
    if (job.status === "COMPLETED" || job.status === "FAILED") {
      onComplete();
    }
  }, [job.status, onComplete]);

  const isActive = job.status === "PENDING" || job.status === "IN_PROGRESS";

  // 부분 완료 여부 (일부 성공, 일부 실패)
  const isPartialFailure = job.status === "FAILED" && job.completedChapters > 0;

  const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    PENDING: { icon: <Clock className="h-4 w-4" />, label: "대기 중", color: "text-status-pending" },
    IN_PROGRESS: { icon: <Loader2 className="h-4 w-4 animate-spin" />, label: "번역 중", color: "text-status-progress" },
    COMPLETED: { icon: <CheckCircle2 className="h-4 w-4" />, label: "완료", color: "text-status-success" },
    PAUSED: { icon: <Pause className="h-4 w-4" />, label: "일시정지", color: "text-status-warning" },
    FAILED: { icon: <XCircle className="h-4 w-4" />, label: isPartialFailure ? "부분 완료" : "실패", color: isPartialFailure ? "text-status-warning" : "text-status-error" },
  };

  const config = statusConfig[job.status] || statusConfig.PENDING;

  return (
    <div className="bg-background border rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn("flex items-center gap-2", config.color)}>
              {config.icon}
              <span className="font-medium">{config.label}</span>
            </div>
            {job.status === "IN_PROGRESS" && job.currentChapter && (
              <span className="text-sm text-muted-foreground">
                {job.currentChapter.number}화 번역 중
                {job.currentChapter.totalChunks && job.currentChapter.totalChunks > 1 && (
                  <span className="ml-1 text-xs">
                    ({job.currentChapter.currentChunk || 0}/{job.currentChapter.totalChunks} 청크)
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm tabular-nums">
              <span className="font-semibold">{job.completedChapters}</span>
              <span className="text-muted-foreground">/{job.totalChapters}</span>
            </span>
            <span className="text-lg font-bold tabular-nums">{totalProgress}%</span>
            {isActive && (
              <Button variant="outline" size="sm" onClick={onPause}>
                <Pause className="h-4 w-4 mr-1" />
                정지
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 relative">
          <Progress value={totalProgress} className={cn(
            "h-2",
            job.status === "COMPLETED" && "[&>div]:bg-status-success",
            job.status === "FAILED" && isPartialFailure && "[&>div]:bg-status-warning",
            job.status === "FAILED" && !isPartialFailure && "[&>div]:bg-status-error",
            isActive && "[&>div]:bg-status-progress"
          )} />
          {isActive && (
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div className="progress-shimmer h-full w-full" />
            </div>
          )}
        </div>

        {job.status === "FAILED" && (
          <p className="mt-2 text-sm text-status-error">
            {isPartialFailure
              ? `${job.failedChapterNums.length}개 회차 번역 실패 (${job.failedChapterNums.slice(0, 10).join(", ")}${job.failedChapterNums.length > 10 ? `... 외 ${job.failedChapterNums.length - 10}개` : ""}화). 아래에서 실패한 회차를 재시도할 수 있습니다.`
              : job.error || "번역에 실패했습니다."}
          </p>
        )}
      </div>

      {/* 실패한 회차 복구 */}
      {job.failedChapterNums.length > 0 && (job.status === "COMPLETED" || job.status === "FAILED") && (
        <div className="border-t p-4">
          <ErrorRecovery
            failedChapters={job.failedChapterNums}
            onRetry={onRetry}
            className="border-none bg-transparent p-0"
          />
        </div>
      )}

      {/* 회차별 상세 (접기/펼치기) */}
      {job.totalChapters > 0 && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="w-full px-4 py-2 border-t flex items-center justify-center gap-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          회차별 상태 {showDetails ? "숨기기" : "보기"}
        </button>
      )}

      {showDetails && (
        <div className="px-4 pb-4 grid grid-cols-10 gap-1">
          {Array.from({ length: job.totalChapters }, (_, i) => {
            const chapterNum = i + 1;
            const isCompleted = i < job.completedChapters;
            const isFailed = job.failedChapterNums.includes(chapterNum);
            const isCurrent = job.currentChapter?.number === chapterNum;

            return (
              <div
                key={chapterNum}
                className={cn(
                  "h-6 rounded flex items-center justify-center text-[10px] font-medium",
                  isCompleted && "bg-status-success/20 text-status-success",
                  isFailed && "bg-status-error/20 text-status-error",
                  isCurrent && "bg-status-progress/20 text-status-progress animate-pulse",
                  !isCompleted && !isFailed && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {chapterNum}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 그리드 초기 표시 개수
const GRID_INITIAL_COUNT = 200;

export default function TranslatePage() {
  const params = useParams();
  const workId = params.id as string;

  const { getJobByWorkId, startTracking, pauseJob, removeJob } = useTranslation();

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [workTitle, setWorkTitle] = useState<string>("");
  const [bibleStatus, setBibleStatus] = useState<string | null>(null);
  const [isStartingTranslation, setIsStartingTranslation] = useState(false);
  const [rangeInput, setRangeInput] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [showAllGrid, setShowAllGrid] = useState(false);

  const job = getJobByWorkId(workId);
  const isTranslating = job && (job.status === "PENDING" || job.status === "IN_PROGRESS");

  const fetchChapters = useCallback(async () => {
    try {
      const [chaptersRes, workRes, bibleRes] = await Promise.all([
        fetch(`/api/works/${workId}/chapters?all=true&limit=2000`),
        fetch(`/api/works/${workId}`),
        fetch(`/api/works/${workId}/setting-bible/status`),
      ]);

      if (chaptersRes.ok) {
        const data = await chaptersRes.json();
        setChapters(data.chapters || data);
      } else {
        toast.error("챕터 목록을 불러오지 못했습니다");
      }

      if (workRes.ok) {
        const workData = await workRes.json();
        setWorkTitle(workData.titleKo || "");
      }

      if (bibleRes.ok) {
        const bibleData = await bibleRes.json();
        setBibleStatus(bibleData.bibleStatus || null);
      }
    } catch (error) {
      console.error("Failed to fetch chapters:", error);
      toast.error("챕터 목록을 불러오지 못했습니다");
    } finally {
      setIsLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  // 번역 가능한 챕터: PENDING + (활성 작업이 없을 때) 멈춘 TRANSLATING 챕터
  const pendingChapters = useMemo(
    () => chapters.filter((c) =>
      c.status === "PENDING" || (c.status === "TRANSLATING" && !isTranslating)
    ),
    [chapters, isTranslating]
  );

  const translatedCount = useMemo(
    () => chapters.filter((c) => ["TRANSLATED", "EDITED", "APPROVED"].includes(c.status)).length,
    [chapters]
  );

  const progressPercent = chapters.length > 0
    ? Math.round((translatedCount / chapters.length) * 100)
    : 0;

  // 그리드에서 표시할 챕터 (200개 이상일 때 점진적 렌더링)
  const visibleGridChapters = useMemo(() => {
    if (showAllGrid || chapters.length <= GRID_INITIAL_COUNT) return chapters;
    return chapters.slice(0, GRID_INITIAL_COUNT);
  }, [chapters, showAllGrid]);

  const toggleChapter = useCallback((number: number) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedChapters.size === pendingChapters.length) {
      setSelectedChapters(new Set());
    } else {
      setSelectedChapters(new Set(pendingChapters.map((c) => c.number)));
    }
  }, [pendingChapters, selectedChapters.size]);

  // 범위 선택 파싱 (예: "1-50", "1,3,5", "1-10,20-30")
  const parseRange = useCallback((input: string): number[] => {
    const result: Set<number> = new Set();
    const parts = input.split(",").map((p) => p.trim());

    for (const part of parts) {
      if (part.includes("-")) {
        const [startStr, endStr] = part.split("-").map((s) => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
            result.add(i);
          }
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num)) {
          result.add(num);
        }
      }
    }

    return Array.from(result);
  }, []);

  const applyRange = useCallback(() => {
    if (!rangeInput.trim()) return;

    const numbers = parseRange(rangeInput);
    const pendingNumbers = new Set(pendingChapters.map((c) => c.number));
    const validNumbers = numbers.filter((n) => pendingNumbers.has(n));

    if (validNumbers.length === 0) {
      toast.error("선택한 범위에 번역 대기 중인 회차가 없습니다.");
      return;
    }

    setSelectedChapters(new Set(validNumbers));
    toast.success(`${validNumbers.length}개 회차 선택됨`);
  }, [rangeInput, parseRange, pendingChapters]);

  const handleTranslate = async () => {
    if (isStartingTranslation) return;
    if (selectedChapters.size === 0) {
      toast.error("번역할 회차를 선택해주세요.");
      return;
    }

    const sortedChapterNumbers = Array.from(selectedChapters).sort((a, b) => a - b);

    try {
      setIsStartingTranslation(true);

      // 기존 완료/실패 작업이 있으면 정리
      if (job && (job.status === "COMPLETED" || job.status === "FAILED")) {
        removeJob(job.jobId);
      }

      const response = await fetch("/api/translation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workId,
          chapterNumbers: sortedChapterNumbers,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "번역 시작에 실패했습니다.");
      }

      const { jobId, totalChapters } = await response.json();
      startTracking(jobId, workId, workTitle, totalChapters);
      toast.success(`${totalChapters}개 회차 번역을 시작했습니다.`);
      setSelectedChapters(new Set());
    } catch (error) {
      console.error("Translation error:", error);
      toast.error(error instanceof Error ? error.message : "번역 시작에 실패했습니다.");
    } finally {
      setIsStartingTranslation(false);
    }
  };

  const handlePause = useCallback(async () => {
    if (job) {
      const success = await pauseJob(job.jobId);
      if (success) {
        toast.info("번역을 일시정지하고 있습니다...");
      } else {
        toast.error("일시정지에 실패했습니다.");
      }
    }
  }, [job, pauseJob]);

  const handleTranslationComplete = useCallback(() => {
    setSelectedChapters(new Set());
    fetchChapters();
  }, [fetchChapters]);

  const handleRetryFailed = useCallback((chapterNumbers: number[]) => {
    // 실패한 챕터들을 선택 상태로 설정 - 사용자가 수동으로 번역 시작 버튼 클릭
    setSelectedChapters(new Set(chapterNumbers));
    toast.info(`${chapterNumbers.length}개 실패 회차가 선택되었습니다. 번역 시작 버튼을 클릭해주세요.`);
  }, []);

  return (
    <div className="max-w-6xl">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <Link
          href={`/works/${workId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          프로젝트로 돌아가기
        </Link>
      </nav>

      {/* Header */}
      <header className="flex items-start justify-between gap-4 pb-6 border-b border-border mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Languages className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AI 번역</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {workTitle && <span className="text-foreground">{workTitle}</span>}
              {workTitle && " · "}
              {translatedCount}/{chapters.length}화 완료 ({progressPercent}%)
            </p>
          </div>
        </div>
      </header>

      {/* 로딩 */}
      {isLoading ? (
        <div className="section-surface p-12 text-center">
          <Spinner size="lg" className="mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">회차 목록을 불러오는 중...</p>
        </div>
      ) : bibleStatus !== "CONFIRMED" ? (
        /* 설정집 미확정 */
        <div className="section-surface p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 mx-auto mb-4">
            <BookOpen className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-xl font-semibold mb-2">설정집 확정이 필요합니다</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            번역을 시작하려면 먼저 설정집을 생성하고 확정해야 합니다.
          </p>
          <Button asChild size="lg">
            <Link href={`/works/${workId}/setting-bible`}>
              <BookOpen className="mr-2 h-4 w-4" />
              설정집 {bibleStatus ? "확정하기" : "생성하기"}
            </Link>
          </Button>
        </div>
      ) : chapters.length === 0 ? (
        /* 회차 없음 */
        <div className="section-surface p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
            <Languages className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">등록된 회차가 없습니다</h3>
          <p className="text-muted-foreground mb-6">먼저 회차를 업로드해주세요.</p>
          <Button asChild>
            <Link href={`/works/${workId}/chapters`}>회차 업로드하기</Link>
          </Button>
        </div>
      ) : pendingChapters.length === 0 && !isTranslating && !job ? (
        /* 모두 번역 완료 */
        <div className="section-surface p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-status-success/20 mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-status-success" />
          </div>
          <h3 className="text-xl font-semibold mb-2">모든 번역이 완료되었습니다</h3>
          <p className="text-muted-foreground mb-6">
            {chapters.length}개 회차의 번역이 완료되었습니다.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" asChild>
              <Link href={`/works/${workId}`}>프로젝트로 돌아가기</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 번역 진행 모니터 */}
          {job && (
            <ServerTranslationProgress
              job={job}
              onPause={handlePause}
              onComplete={handleTranslationComplete}
              onRetry={handleRetryFailed}
            />
          )}

          {/* 액션바 (Sticky) - 번역 중이 아닐 때만 */}
          {!isTranslating && (
            <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border rounded-xl p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* 범위 입력 */}
                <div className="flex items-center gap-2 flex-1">
                  <Input
                    type="text"
                    placeholder="범위 입력 (예: 1-50, 1,3,5)"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyRange()}
                    className="max-w-[200px]"
                  />
                  <Button variant="outline" size="sm" onClick={applyRange} disabled={!rangeInput.trim()}>
                    적용
                  </Button>
                  <div className="h-6 w-px bg-border mx-1 hidden sm:block" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAll}
                    disabled={pendingChapters.length === 0}
                  >
                    {selectedChapters.size === pendingChapters.length && pendingChapters.length > 0
                      ? "전체 해제"
                      : `전체 선택 (${pendingChapters.length})`}
                  </Button>
                </div>

                {/* 선택 현황 + 번역 시작 */}
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    <span className="font-semibold text-foreground tabular-nums">{selectedChapters.size}</span>개 선택
                  </span>
                  <Button
                    onClick={handleTranslate}
                    disabled={selectedChapters.size === 0 || isStartingTranslation}
                    className="gap-2 whitespace-nowrap"
                  >
                    {isStartingTranslation ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        시작 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        번역 시작
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* 선택된 범위 표시 */}
              {selectedChapters.size > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    선택됨: {Array.from(selectedChapters).sort((a, b) => a - b).slice(0, 20).join(", ")}
                    {selectedChapters.size > 20 && ` 외 ${selectedChapters.size - 20}개`}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 회차 그리드/리스트 */}
          <div className="section-surface">
            {/* 헤더 */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <h2 className="font-medium">회차 목록</h2>
                <Badge variant="outline" className="text-xs">
                  {chapters.length}개
                </Badge>
              </div>
              {/* 뷰 전환 - 세그먼트 컨트롤 스타일 (Issue 12: ARIA radiogroup) */}
              <div className="flex items-center bg-muted rounded-lg p-1" role="radiogroup" aria-label="뷰 모드 선택">
                <button
                  onClick={() => setViewMode("grid")}
                  role="radio"
                  aria-checked={viewMode === "grid"}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                    viewMode === "grid"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Grid3X3 className="h-4 w-4" />
                  <span>그리드</span>
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  role="radio"
                  aria-checked={viewMode === "list"}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                    viewMode === "list"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List className="h-4 w-4" />
                  <span>리스트</span>
                </button>
              </div>
            </div>

            {/* 범례 */}
            <div className="flex items-center gap-4 px-4 py-2 border-b bg-muted/30 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-muted border" />
                <span className="text-muted-foreground">대기</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-status-progress/20 border border-status-progress" />
                <span className="text-muted-foreground">번역중</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-status-success/20 border border-status-success/50" />
                <span className="text-muted-foreground">완료</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded bg-primary/20 border border-primary ring-2 ring-primary/30" />
                <span className="text-muted-foreground">선택됨</span>
              </div>
            </div>

            {/* 콘텐츠 */}
            <div className="p-4">
              {viewMode === "grid" ? (
                <>
                  <div className="overflow-x-auto">
                    <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-15 xl:grid-cols-20 gap-1.5">
                      {visibleGridChapters.map((chapter) => {
                        const isCurrentlyTranslating = isTranslating && job?.currentChapter?.number === chapter.number;
                        return (
                          <ChapterCell
                            key={chapter.id}
                            chapter={chapter}
                            isSelected={selectedChapters.has(chapter.number)}
                            onToggle={toggleChapter}
                            isTranslating={!!isTranslating}
                            isCurrentlyTranslating={isCurrentlyTranslating}
                          />
                        );
                      })}
                    </div>
                  </div>
                  {/* 더 보기 버튼 (Issue 6: 200개 이상일 때) */}
                  {chapters.length > GRID_INITIAL_COUNT && !showAllGrid && (
                    <div className="mt-4 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAllGrid(true)}
                      >
                        나머지 {chapters.length - GRID_INITIAL_COUNT}개 더 보기
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-1 max-h-[500px] overflow-y-auto">
                  {chapters.map((chapter) => {
                    const isPending = chapter.status === "PENDING";
                    const isStuckTranslating = chapter.status === "TRANSLATING" && !isTranslating;
                    const canSelect = (isPending || isStuckTranslating) && !isTranslating;
                    const isCurrentlyTranslating = isTranslating && job?.currentChapter?.number === chapter.number;
                    const isSelected = selectedChapters.has(chapter.number);
                    const styles = STATUS_STYLES[chapter.status] || STATUS_STYLES.PENDING;

                    return (
                      <div
                        key={chapter.id}
                        role={canSelect ? "checkbox" : undefined}
                        aria-checked={canSelect ? isSelected : undefined}
                        tabIndex={canSelect ? 0 : undefined}
                        onClick={() => canSelect && toggleChapter(chapter.number)}
                        onKeyDown={(e) => {
                          if (canSelect && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            toggleChapter(chapter.number);
                          }
                        }}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg border transition-all",
                          styles.bg,
                          styles.border,
                          canSelect && "cursor-pointer hover:border-primary",
                          !canSelect && "cursor-default opacity-70",
                          isSelected && "ring-2 ring-primary border-primary bg-primary/5",
                          isCurrentlyTranslating && "animate-pulse"
                        )}
                      >
                        <span className={cn(
                          "w-12 text-sm font-medium tabular-nums",
                          isSelected ? "text-primary" : styles.text
                        )}>
                          {chapter.number}화
                        </span>
                        <span
                          className="flex-1 text-sm truncate"
                          title={chapter.title || `제 ${chapter.number}화`}
                        >
                          {chapter.title || `제 ${chapter.number}화`}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {chapter.wordCount.toLocaleString()}자
                        </span>
                        {isCurrentlyTranslating && (
                          <Loader2 className="h-4 w-4 animate-spin text-status-progress" />
                        )}
                        {isSelected && !isCurrentlyTranslating && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
