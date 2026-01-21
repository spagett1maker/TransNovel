"use client";

import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Clock,
  HelpCircle,
  Languages,
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
import { Checkbox } from "@/components/ui/checkbox";
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

// 상태별 설정 (디자인 시스템 기반)
const STATUS_CONFIG: Record<
  string,
  { variant: "outline" | "pending" | "progress" | "success" | "warning" | "destructive"; label: string; icon?: React.ReactNode }
> = {
  PENDING: { variant: "pending", label: "대기", icon: <Clock className="h-3 w-3" /> },
  TRANSLATING: { variant: "progress", label: "번역중", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  TRANSLATED: { variant: "success", label: "번역완료", icon: <CheckCircle2 className="h-3 w-3" /> },
  REVIEWING: { variant: "warning", label: "검토중" },
  EDITED: { variant: "success", label: "윤문완료", icon: <CheckCircle2 className="h-3 w-3" /> },
  APPROVED: { variant: "success", label: "승인", icon: <CheckCircle2 className="h-3 w-3" /> },
  FAILED: { variant: "destructive", label: "실패", icon: <XCircle className="h-3 w-3" /> },
  PARTIAL: { variant: "warning", label: "부분완료", icon: <AlertTriangle className="h-3 w-3" /> },
};

// 상태별 색상 (디자인 시스템 통일)
const STATUS_COLORS: Record<string, string> = {
  PENDING: "border-status-pending/30 bg-status-pending/5",
  TRANSLATING: "border-status-progress/30 bg-status-progress/5",
  TRANSLATED: "border-status-success/30 bg-status-success/5",
  REVIEWING: "border-status-warning/30 bg-status-warning/5",
  EDITED: "border-status-success/30 bg-status-success/5",
  APPROVED: "border-status-success/30 bg-status-success/5",
  FAILED: "border-status-error/30 bg-status-error/5",
  PARTIAL: "border-status-warning/30 bg-status-warning/5",
};

// 메모이제이션된 회차 아이템 컴포넌트
const ChapterItem = memo(function ChapterItem({
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
  const canSelect = isPending && !isTranslating;
  const config = STATUS_CONFIG[chapter.status] || STATUS_CONFIG.PENDING;
  const colors = STATUS_COLORS[chapter.status] || STATUS_COLORS.PENDING;

  // 현재 번역 중인 챕터는 특별한 스타일
  const currentlyTranslatingColors = "border-status-progress bg-status-progress/10";

  return (
    <div
      className={cn(
        "chapter-item group flex items-center gap-4 rounded-xl border p-4 transition-all duration-200",
        isCurrentlyTranslating ? currentlyTranslatingColors : colors,
        canSelect
          ? "cursor-pointer hover:border-foreground/30 hover:shadow-sm"
          : "cursor-not-allowed opacity-60",
        isSelected && "ring-2 ring-primary/20 border-primary/40 chapter-selected",
        isCurrentlyTranslating && "translation-active opacity-100"
      )}
      onClick={() => canSelect && onToggle(chapter.number)}
    >
      {!isTranslating && (
        <Checkbox
          checked={isSelected}
          disabled={!canSelect}
          onCheckedChange={() => canSelect && onToggle(chapter.number)}
          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
        />
      )}

      {/* 회차 번호 - 번역 중이면 번개 아이콘 */}
      <div className={cn(
        "flex h-8 w-12 items-center justify-center rounded-lg bg-background border text-sm font-medium tabular-nums",
        isCurrentlyTranslating && "border-status-progress text-status-progress"
      )}>
        {isCurrentlyTranslating ? (
          <Sparkles className="h-4 w-4 text-status-progress animate-pulse" />
        ) : (
          chapter.number
        )}
      </div>

      {/* 제목 */}
      <div className="flex-1 min-w-0">
        <span className={cn(
          "font-medium truncate block",
          isCurrentlyTranslating && "text-status-progress"
        )}>
          {chapter.title || `${chapter.number}화`}
        </span>
        {isCurrentlyTranslating && (
          <span className="text-xs text-status-progress">번역 중...</span>
        )}
      </div>

      {/* 글자수 */}
      <span className={cn(
        "text-sm tabular-nums hidden sm:block",
        isCurrentlyTranslating ? "text-status-progress" : "text-muted-foreground"
      )}>
        {`${chapter.wordCount.toLocaleString()}자`}
      </span>

      {/* 상태 배지 */}
      {isCurrentlyTranslating ? (
        <Badge variant="progress" className="gap-1 shrink-0">
          <Loader2 className="h-3 w-3 animate-spin" />
          번역중
        </Badge>
      ) : (
        <Badge variant={config.variant} className="gap-1 shrink-0">
          {config.icon}
          {config.label}
        </Badge>
      )}
    </div>
  );
});

// 상태 레전드 컴포넌트
function StatusLegend() {
  const statuses = [
    { key: "PENDING", label: "대기", desc: "번역 대기 중" },
    { key: "TRANSLATING", label: "번역중", desc: "AI가 번역하는 중" },
    { key: "TRANSLATED", label: "번역완료", desc: "번역이 완료됨" },
    { key: "EDITED", label: "윤문완료", desc: "교정/윤문 완료" },
  ];

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">상태:</span>
        {statuses.map(({ key, label, desc }) => {
          const config = STATUS_CONFIG[key];
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <div>
                  <Badge variant={config.variant} className="gap-1 cursor-help">
                    {config.icon}
                    {label}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{desc}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

// 서버 측 번역 진행률 모니터
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
    currentChapter?: { number: number };
    error?: string;
  };
  onPause: () => void;
  onComplete: () => void;
  onRetry: (chapterNumbers: number[]) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [failedChapterNumbers, setFailedChapterNumbers] = useState<number[]>([]);

  const totalProgress = job.totalChapters > 0
    ? Math.round((job.completedChapters / job.totalChapters) * 100)
    : 0;

  useEffect(() => {
    if (job.status === "COMPLETED") {
      onComplete();
    }
  }, [job.status, onComplete]);

  // 상태별 스타일
  const statusStyles: Record<string, {
    container: string;
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    progressBarClass: string;
  }> = {
    PENDING: {
      container: "border-status-pending/30 bg-status-pending/5",
      icon: <Clock className="h-5 w-5 text-status-pending" />,
      iconBg: "bg-status-pending/10",
      title: "번역 대기 중",
      progressBarClass: "[&>div]:bg-status-pending",
    },
    IN_PROGRESS: {
      container: "border-status-progress/30 bg-status-progress/5 translation-progress-card active",
      icon: <Loader2 className="h-5 w-5 animate-spin text-status-progress" />,
      iconBg: "bg-status-progress/10",
      title: "번역 진행 중",
      progressBarClass: "[&>div]:bg-status-progress",
    },
    COMPLETED: {
      container: "border-status-success/30 bg-status-success/5",
      icon: <CheckCircle2 className="h-5 w-5 text-status-success" />,
      iconBg: "bg-status-success/10",
      title: "번역 완료!",
      progressBarClass: "[&>div]:bg-status-success",
    },
    PAUSED: {
      container: "border-status-warning/30 bg-status-warning/5",
      icon: <Pause className="h-5 w-5 text-status-warning" />,
      iconBg: "bg-status-warning/10",
      title: "번역 일시정지됨",
      progressBarClass: "[&>div]:bg-status-warning",
    },
    FAILED: {
      container: "border-status-error/30 bg-status-error/5",
      icon: <XCircle className="h-5 w-5 text-status-error" />,
      iconBg: "bg-status-error/10",
      title: "번역 실패",
      progressBarClass: "[&>div]:bg-status-error",
    },
  };

  const styles = statusStyles[job.status] || statusStyles.PENDING;
  const isActive = job.status === "PENDING" || job.status === "IN_PROGRESS";

  return (
    <div className={cn("section-surface overflow-hidden", styles.container)}>
      {/* 헤더 */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-full shrink-0", styles.iconBg)}>
            {styles.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-semibold">{styles.title}</h3>
              {isActive && (
                <Button variant="outline" size="sm" onClick={onPause} className="gap-2 shrink-0">
                  <Pause className="h-4 w-4" />
                  일시정지
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {job.status === "PENDING" && "번역이 곧 시작됩니다..."}
              {job.status === "IN_PROGRESS" && (
                job.currentChapter
                  ? `${job.currentChapter.number}화 번역 중...`
                  : "AI가 번역하고 있습니다..."
              )}
              {job.status === "COMPLETED" && "모든 회차의 번역이 완료되었습니다."}
              {job.status === "PAUSED" && "번역이 일시정지되었습니다. 재개하려면 다시 번역을 시작하세요."}
              {job.status === "FAILED" && (job.error || "번역 중 오류가 발생했습니다.")}
            </p>
          </div>
          {job.totalChapters > 0 && (
            <div className="text-right shrink-0">
              <div className="text-2xl font-bold tabular-nums">{totalProgress}%</div>
              <div className="text-xs text-muted-foreground">
                {job.completedChapters}/{job.totalChapters}화
              </div>
            </div>
          )}
        </div>

        {/* 전체 진행률 바 */}
        <div className="mt-4 relative">
          <Progress value={totalProgress} className={cn("h-2", styles.progressBarClass)} />
          {isActive && (
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div className="progress-shimmer h-full w-full" />
            </div>
          )}
        </div>

        {/* 현재 챕터 표시 (번역 중일 때만) */}
        {job.status === "IN_PROGRESS" && job.currentChapter && (
          <div className="mt-4 p-3 rounded-lg bg-background/50 border">
            <div className="flex items-center gap-2 text-sm">
              <Spinner size="sm" className="text-status-progress" />
              <span className="font-medium">{job.currentChapter.number}화 번역 중</span>
            </div>
          </div>
        )}
      </div>

      {/* 실패한 회차가 있을 경우 에러 복구 UI */}
      {job.failedChapters > 0 && (job.status === "COMPLETED" || job.status === "FAILED") && (
        <div className="border-t border-border/50 p-4">
          <ErrorRecovery
            failedChapters={failedChapterNumbers}
            onRetry={onRetry}
            className="border-none bg-transparent p-0"
          />
        </div>
      )}

      {/* 회차별 상태 (접을 수 있음) */}
      {job.totalChapters > 0 && (
        <div className="border-t border-border/50">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full px-5 py-3 flex items-center justify-between text-sm hover:bg-background/30 transition-colors"
          >
            <span className="font-medium">회차별 상태</span>
            <div className="flex items-center gap-2">
              {job.failedChapters > 0 && isActive && (
                <Badge variant="destructive" className="text-xs">
                  {job.failedChapters}개 오류
                </Badge>
              )}
              {showDetails ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>

          {showDetails && (
            <div className="px-5 pb-5">
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: job.totalChapters }, (_, i) => {
                  const chapterNum = i + 1;
                  const isCompleted = i < job.completedChapters;
                  const isFailed = failedChapterNumbers.includes(chapterNum);
                  const isCurrent = job.currentChapter?.number === chapterNum && job.status === "IN_PROGRESS";

                  return (
                    <div
                      key={chapterNum}
                      className={cn(
                        "h-6 rounded flex items-center justify-center text-[10px] font-medium transition-all",
                        isCompleted && "bg-status-success/20 text-status-success",
                        isFailed && "bg-status-error/20 text-status-error",
                        isCurrent && "bg-status-progress/20 text-status-progress translation-active",
                        !isCompleted && !isFailed && !isCurrent && "bg-muted text-muted-foreground"
                      )}
                      title={
                        isCompleted
                          ? `${chapterNum}화 완료`
                          : isFailed
                          ? `${chapterNum}화 실패`
                          : isCurrent
                          ? `${chapterNum}화 번역 중`
                          : `${chapterNum}화 대기`
                      }
                    >
                      {chapterNum}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ITEMS_PER_PAGE = 30;

export default function TranslatePage() {
  const params = useParams();
  const workId = params.id as string;

  // Global translation context for tracking server-side translation
  const { getJobByWorkId, startTracking, pauseJob, refreshJobs } = useTranslation();

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [workTitle, setWorkTitle] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [bibleStatus, setBibleStatus] = useState<string | null>(null);
  const [isStartingTranslation, setIsStartingTranslation] = useState(false);

  // 서버 측 번역 작업 상태 (TranslationContext에서 가져옴)
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
    } finally {
      setIsLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  // 필터 결과 캐싱
  const pendingChapters = useMemo(
    () => chapters.filter((c) => c.status === "PENDING"),
    [chapters]
  );

  const translatedCount = useMemo(
    () => chapters.filter((c) => ["TRANSLATED", "EDITED", "APPROVED"].includes(c.status)).length,
    [chapters]
  );

  const progressPercent = chapters.length > 0
    ? Math.round((translatedCount / chapters.length) * 100)
    : 0;

  // 페이지네이션 계산
  const totalPages = Math.ceil(chapters.length / ITEMS_PER_PAGE);
  const paginatedChapters = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return chapters.slice(start, start + ITEMS_PER_PAGE);
  }, [chapters, currentPage]);

  const currentPagePendingChapters = useMemo(
    () => paginatedChapters.filter((c) => c.status === "PENDING"),
    [paginatedChapters]
  );

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

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

  const selectCurrentPage = useCallback(() => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      const allCurrentPageSelected = currentPagePendingChapters.every((c) => next.has(c.number));

      if (allCurrentPageSelected) {
        currentPagePendingChapters.forEach((c) => next.delete(c.number));
      } else {
        currentPagePendingChapters.forEach((c) => next.add(c.number));
      }
      return next;
    });
  }, [currentPagePendingChapters]);

  const selectAll = useCallback(() => {
    setSelectedChapters((prev) => {
      if (prev.size === pendingChapters.length) {
        return new Set();
      } else {
        return new Set(pendingChapters.map((c) => c.number));
      }
    });
  }, [pendingChapters]);

  // 서버 측 번역 시작 (API 호출)
  const handleTranslate = async () => {
    if (selectedChapters.size === 0) {
      toast.error("번역할 회차를 선택해주세요.");
      return;
    }

    const sortedChapterNumbers = Array.from(selectedChapters).sort((a, b) => a - b);

    try {
      setIsStartingTranslation(true);

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

      // 글로벌 컨텍스트에서 추적 시작 (SSE 연결)
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

  // 번역 일시정지
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

  // 번역 완료 처리
  const handleTranslationComplete = useCallback(() => {
    setSelectedChapters(new Set());
    fetchChapters();
  }, [fetchChapters]);

  // 실패 회차 재시도
  const handleRetryFailed = useCallback(async (chapterNumbers: number[]) => {
    setSelectedChapters(new Set(chapterNumbers));
    // 약간의 딜레이 후 자동 시작
    setTimeout(() => {
      handleTranslate();
    }, 100);
  }, []);

  return (
    <div className="max-w-4xl">
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

      {/* Page Header */}
      <header className="pb-8 border-b border-border mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Languages className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              AI Translation
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              AI 번역
            </h1>
          </div>
        </div>
        <p className="text-muted-foreground mt-2">
          {workTitle && <span className="font-medium text-foreground">{workTitle}</span>}
          {workTitle && " · "}
          Gemini AI를 사용한 자동 번역
        </p>
      </header>

      {/* 번역 진행률 개요 */}
      {!isLoading && chapters.length > 0 && (
        <div className="section-surface p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">전체 번역 진행률</span>
            </div>
            <span className="text-sm tabular-nums">
              <span className="font-semibold">{translatedCount}</span>
              <span className="text-muted-foreground">/{chapters.length}화</span>
              <span className="ml-2 text-muted-foreground">({progressPercent}%)</span>
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="mt-4 flex items-center justify-between">
            <StatusLegend />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>대기 상태의 회차만 번역할 수 있습니다. 이미 번역된 회차는 재번역 기능을 사용하세요.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {/* 서버 측 번역 진행 모니터 - Sticky */}
      {job && (
        <div className="sticky top-0 z-40 -mx-4 px-4 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border mb-6">
          <ServerTranslationProgress
            job={job}
            onPause={handlePause}
            onComplete={handleTranslationComplete}
            onRetry={handleRetryFailed}
          />
        </div>
      )}

      {/* 용어집 안내 */}
      {!isTranslating && !isLoading && pendingChapters.length > 0 && !job && (
        <div className="section-surface border-blue-200 bg-blue-50/50 p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong className="font-medium">팁:</strong> 번역 전에{" "}
            <Link
              href={`/works/${workId}/glossary`}
              className="underline hover:no-underline font-medium"
            >
              용어집
            </Link>
            을 먼저 등록하면 더 정확한 번역이 가능합니다.
          </p>
        </div>
      )}

      {/* 설정집 미확정 경고 */}
      {!isLoading && bibleStatus !== "CONFIRMED" && (
        <div className="section-surface border-amber-200 bg-amber-50/50 p-6 mb-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 mx-auto mb-4">
            <BookOpen className="h-6 w-6 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold mb-2">설정집 확정이 필요합니다</h3>
          <p className="text-muted-foreground mb-4">
            번역을 시작하려면 먼저 설정집을 생성하고 확정해야 합니다.
            <br />
            설정집에는 인물 정보, 용어집, 번역 가이드가 포함됩니다.
          </p>
          <Button asChild>
            <Link href={`/works/${workId}/setting-bible`}>
              <BookOpen className="mr-2 h-4 w-4" />
              설정집 {bibleStatus ? "확정하기" : "생성하기"}
            </Link>
          </Button>
        </div>
      )}

      {/* 로딩 상태 */}
      {isLoading ? (
        <div className="section-surface p-12 text-center">
          <Spinner size="lg" className="mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">회차 목록을 불러오는 중...</p>
        </div>
      ) : bibleStatus !== "CONFIRMED" ? (
        // 설정집 미확정이면 회차 선택 UI를 숨김
        null
      ) : chapters.length === 0 ? (
        /* 회차 없음 */
        <div className="section-surface p-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto mb-4">
            <Languages className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">등록된 회차가 없습니다</h3>
          <p className="text-muted-foreground mb-6">
            먼저 회차를 업로드해주세요.
          </p>
          <Button asChild>
            <Link href={`/works/${workId}/chapters`}>회차 업로드하기</Link>
          </Button>
        </div>
      ) : pendingChapters.length === 0 && !isTranslating && !job ? (
        /* 번역 대기 없음 */
        <div className="section-surface p-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold mb-2">모든 번역이 완료되었습니다</h3>
          <p className="text-muted-foreground mb-6">
            {chapters.length}개 회차의 번역이 완료되었습니다.
          </p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" asChild>
              <Link href={`/works/${workId}`}>프로젝트로 돌아가기</Link>
            </Button>
            <Button asChild>
              <Link href={`/works/${workId}/review`}>윤문 시작하기</Link>
            </Button>
          </div>
        </div>
      ) : (
        /* 회차 선택 - 번역 중에도 표시 (읽기 전용) */
        <div className="section-surface">
          {/* 헤더 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 border-b border-border">
            <div>
              <h2 className="text-lg font-semibold">
                {isTranslating ? "회차 목록" : "회차 선택"}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isTranslating
                  ? "번역이 진행 중입니다. 실시간 상태를 확인하세요."
                  : "번역할 회차를 선택하세요 (대기 상태만 선택 가능)"}
              </p>
            </div>
            {!isTranslating && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectCurrentPage}
                  disabled={currentPagePendingChapters.length === 0}
                >
                  {currentPagePendingChapters.every((c) => selectedChapters.has(c.number)) && currentPagePendingChapters.length > 0
                    ? "페이지 해제"
                    : `페이지 선택`}
                </Button>
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
            )}
          </div>

          {/* 회차 목록 */}
          <div className="p-3 space-y-2">
            {paginatedChapters.map((chapter) => {
              const isCurrentlyTranslating = isTranslating && job?.currentChapter?.number === chapter.number;
              return (
                <ChapterItem
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

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 p-4 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-1 mx-2">
                {(() => {
                  const pages: (number | "ellipsis")[] = [];
                  const maxVisible = 5;

                  if (totalPages <= maxVisible) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                  } else {
                    pages.push(1);

                    if (currentPage > 3) pages.push("ellipsis");

                    const start = Math.max(2, currentPage - 1);
                    const end = Math.min(totalPages - 1, currentPage + 1);

                    for (let i = start; i <= end; i++) pages.push(i);

                    if (currentPage < totalPages - 2) pages.push("ellipsis");

                    pages.push(totalPages);
                  }

                  return pages.map((page, idx) =>
                    page === "ellipsis" ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                        ...
                      </span>
                    ) : (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "ghost"}
                        size="sm"
                        onClick={() => goToPage(page)}
                        className="h-8 w-8 p-0 tabular-nums"
                      >
                        {page}
                      </Button>
                    )
                  );
                })()}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className="h-8 w-8 p-0"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>

              <span className="ml-3 text-sm text-muted-foreground tabular-nums">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, chapters.length)} / {chapters.length}
              </span>
            </div>
          )}

          {/* 액션 - 번역 중이 아닐 때만 표시 */}
          {!isTranslating && (
            <div className="flex flex-col gap-4 p-5 border-t border-border bg-muted/30">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">{selectedChapters.size}</span>개 회차 선택됨
                </p>
                <Button
                  size="lg"
                  onClick={handleTranslate}
                  disabled={selectedChapters.size === 0 || isStartingTranslation}
                  className="w-full sm:w-auto gap-2"
                >
                  {isStartingTranslation ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      번역 시작 중...
                    </>
                  ) : (
                    <>
                      <Languages className="h-4 w-4" />
                      {`${selectedChapters.size}개 회차 번역 시작`}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
