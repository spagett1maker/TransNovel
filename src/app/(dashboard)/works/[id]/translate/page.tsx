"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  HelpCircle,
  Languages,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { TranslationProgress } from "@/components/translation/progress-monitor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ButtonSpinner, Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/contexts/translation-context";

interface Chapter {
  id: string;
  number: number;
  title: string | null;
  status: string;
  wordCount: number;
}

interface StuckChapter {
  id: string;
  number: number;
  title: string | null;
  stuckSince: string;
  progressPercent: number;
  hasPartialResults: boolean;
}

// 상태별 설정
const STATUS_CONFIG: Record<
  string,
  { variant: "outline" | "pending" | "progress" | "success" | "warning"; label: string; icon?: React.ReactNode }
> = {
  PENDING: { variant: "pending", label: "대기", icon: <Clock className="h-3 w-3" /> },
  TRANSLATING: { variant: "progress", label: "번역중", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  TRANSLATED: { variant: "success", label: "번역완료", icon: <CheckCircle2 className="h-3 w-3" /> },
  REVIEWING: { variant: "warning", label: "검토중" },
  EDITED: { variant: "success", label: "윤문완료", icon: <CheckCircle2 className="h-3 w-3" /> },
  APPROVED: { variant: "success", label: "승인", icon: <CheckCircle2 className="h-3 w-3" /> },
};

// 상태별 색상 (체크박스, 하이라이트용)
const STATUS_COLORS: Record<string, string> = {
  PENDING: "border-gray-200 bg-gray-50/50",
  TRANSLATING: "border-blue-200 bg-blue-50/50",
  TRANSLATED: "border-green-200 bg-green-50/50",
  REVIEWING: "border-purple-200 bg-purple-50/50",
  EDITED: "border-emerald-200 bg-emerald-50/50",
  APPROVED: "border-emerald-200 bg-emerald-50/50",
};

// 메모이제이션된 회차 아이템 컴포넌트
const ChapterItem = memo(function ChapterItem({
  chapter,
  isSelected,
  onToggle,
}: {
  chapter: Chapter;
  isSelected: boolean;
  onToggle: (number: number) => void;
}) {
  const isPending = chapter.status === "PENDING";
  const config = STATUS_CONFIG[chapter.status] || STATUS_CONFIG.PENDING;
  const colors = STATUS_COLORS[chapter.status] || STATUS_COLORS.PENDING;

  return (
    <div
      className={`group flex items-center gap-4 rounded-xl border p-4 transition-all duration-200 ${colors} ${
        isPending
          ? "cursor-pointer hover:border-foreground/30 hover:shadow-sm"
          : "cursor-not-allowed opacity-60"
      } ${isSelected ? "ring-2 ring-primary/20 border-primary/40" : ""}`}
      onClick={() => isPending && onToggle(chapter.number)}
    >
      <Checkbox
        checked={isSelected}
        disabled={!isPending}
        onCheckedChange={() => isPending && onToggle(chapter.number)}
        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
      />

      {/* 회차 번호 */}
      <div className="flex h-8 w-12 items-center justify-center rounded-lg bg-background border text-sm font-medium tabular-nums">
        {chapter.number}
      </div>

      {/* 제목 */}
      <div className="flex-1 min-w-0">
        <span className="font-medium truncate block">
          {chapter.title || `${chapter.number}화`}
        </span>
      </div>

      {/* 글자수 */}
      <span className="text-sm text-muted-foreground tabular-nums hidden sm:block">
        {chapter.wordCount.toLocaleString()}자
      </span>

      {/* 상태 배지 */}
      <Badge variant={config.variant} className="gap-1 shrink-0">
        {config.icon}
        {config.label}
      </Badge>
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

const ITEMS_PER_PAGE = 30;

export default function TranslatePage() {
  const params = useParams();
  const workId = params.id as string;

  const { getJobByWorkId, startTracking } = useTranslation();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [workTitle, setWorkTitle] = useState<string>("");
  const [stuckChapters, setStuckChapters] = useState<StuckChapter[]>([]);
  const [isRecovering, setIsRecovering] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const currentJob = getJobByWorkId(workId);
  const activeJobId = currentJob?.jobId ?? null;

  const fetchChapters = useCallback(async () => {
    try {
      const [chaptersRes, workRes] = await Promise.all([
        fetch(`/api/works/${workId}/chapters?all=true&limit=2000`),
        fetch(`/api/works/${workId}`),
      ]);

      if (chaptersRes.ok) {
        const data = await chaptersRes.json();
        setChapters(data.chapters || data);
      }

      if (workRes.ok) {
        const workData = await workRes.json();
        setWorkTitle(workData.titleKo || "");
      }
    } catch (error) {
      console.error("Failed to fetch chapters:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workId]);

  const checkStuckTranslations = useCallback(async () => {
    try {
      const res = await fetch(`/api/translation/recovery?workId=${workId}`);
      if (res.ok) {
        const data = await res.json();
        const thisWorkRecovery = data.recoverable?.find(
          (r: { workId: string }) => r.workId === workId
        );
        if (thisWorkRecovery) {
          setStuckChapters(thisWorkRecovery.stuckChapters);
        }
      }
    } catch (error) {
      console.error("Failed to check stuck translations:", error);
    }
  }, [workId]);

  const handleRecovery = useCallback(async (action: "reset" | "clear") => {
    setIsRecovering(true);
    try {
      const res = await fetch("/api/translation/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workId, action }),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(data.message);
        setStuckChapters([]);
        fetchChapters();
      } else {
        toast.error(data.error || "복구 실패");
      }
    } catch {
      toast.error("복구 중 오류 발생");
    } finally {
      setIsRecovering(false);
    }
  }, [workId, fetchChapters]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  useEffect(() => {
    checkStuckTranslations();
  }, [checkStuckTranslations]);

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

  // 현재 페이지의 대기 상태 챕터
  const currentPagePendingChapters = useMemo(
    () => paginatedChapters.filter((c) => c.status === "PENDING"),
    [paginatedChapters]
  );

  // 페이지 변경 시 스크롤 위치 초기화하지 않음 (선택 유지)
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

  // 현재 페이지의 대기 챕터 전체 선택/해제
  const selectCurrentPage = useCallback(() => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      const allCurrentPageSelected = currentPagePendingChapters.every((c) => next.has(c.number));

      if (allCurrentPageSelected) {
        // 현재 페이지 해제
        currentPagePendingChapters.forEach((c) => next.delete(c.number));
      } else {
        // 현재 페이지 선택
        currentPagePendingChapters.forEach((c) => next.add(c.number));
      }
      return next;
    });
  }, [currentPagePendingChapters]);

  // 전체 대기 챕터 선택/해제
  const selectAll = useCallback(() => {
    setSelectedChapters((prev) => {
      if (prev.size === pendingChapters.length) {
        return new Set();
      } else {
        return new Set(pendingChapters.map((c) => c.number));
      }
    });
  }, [pendingChapters]);

  const handleTranslate = async (force: boolean = false) => {
    if (selectedChapters.size === 0) {
      toast.error("번역할 회차를 선택해주세요.");
      return;
    }

    setIsStarting(true);

    try {
      const sortedChapters = Array.from(selectedChapters).sort((a, b) => a - b);

      const response = await fetch("/api/translation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workId,
          chapterNumbers: sortedChapters,
          force,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 409: 이미 진행 중인 작업이 있는 경우 강제 시작 옵션 제공
        if (response.status === 409) {
          toast.error("이미 진행 중인 번역 작업이 있습니다.", {
            duration: 10000,
            action: {
              label: "강제 시작",
              onClick: () => handleTranslate(true),
            },
            description: "기존 작업을 취소하고 새로 시작하려면 '강제 시작'을 클릭하세요.",
          });
          return;
        }
        throw new Error(data.error || "번역 시작에 실패했습니다.");
      }

      startTracking(
        data.jobId,
        workId,
        workTitle || "번역 작업",
        sortedChapters.length
      );

      toast.success(force ? "기존 작업을 취소하고 새 번역이 시작되었습니다!" : "번역이 시작되었습니다!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "번역 시작에 실패했습니다."
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleTranslationComplete = useCallback(() => {
    setSelectedChapters(new Set());
    fetchChapters();
    toast.success("모든 번역이 완료되었습니다!");
  }, [fetchChapters]);

  const handleRetryFailed = useCallback(async (chapterNumbers: number[], force: boolean = false) => {
    try {
      const response = await fetch("/api/translation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workId,
          chapterNumbers,
          force,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 409: 이미 진행 중인 작업이 있는 경우 강제 시작 옵션 제공
        if (response.status === 409) {
          toast.error("이미 진행 중인 번역 작업이 있습니다.", {
            duration: 10000,
            action: {
              label: "강제 시작",
              onClick: () => handleRetryFailed(chapterNumbers, true),
            },
            description: "기존 작업을 취소하고 새로 시작하려면 '강제 시작'을 클릭하세요.",
          });
          return;
        }
        throw new Error(data.error || "재시도에 실패했습니다.");
      }

      startTracking(
        data.jobId,
        workId,
        workTitle || "번역 작업",
        chapterNumbers.length
      );

      toast.success(force ? "기존 작업을 취소하고 재번역이 시작되었습니다!" : "재번역이 시작되었습니다!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "재시도에 실패했습니다."
      );
      throw error;
    }
  }, [workId, workTitle, startTracking]);

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

      {/* 번역 진행 모니터 */}
      {activeJobId && (
        <div className="mb-6">
          <TranslationProgress
            jobId={activeJobId}
            workId={workId}
            onComplete={handleTranslationComplete}
            onRetry={handleRetryFailed}
          />
        </div>
      )}

      {/* 멈춘 번역 복구 배너 */}
      {stuckChapters.length > 0 && !activeJobId && (
        <div className="section-surface border-orange-200 bg-orange-50/50 p-5 mb-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-orange-900">
                이전 번역 작업이 중단되었습니다
              </h3>
              <p className="text-sm text-orange-700 mt-1">
                {stuckChapters.length}개 회차가 번역 중 멈췄습니다.
                {stuckChapters.some(c => c.hasPartialResults) && (
                  <span className="block mt-1 text-orange-600">
                    일부 회차는 중간 저장된 결과가 있어 이어서 번역할 수 있습니다.
                  </span>
                )}
              </p>
              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <Button
                  size="sm"
                  onClick={() => handleRecovery("reset")}
                  disabled={isRecovering}
                  className="gap-2"
                >
                  {isRecovering ? <ButtonSpinner /> : <RefreshCw className="h-4 w-4" />}
                  이어서 번역
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRecovery("clear")}
                  disabled={isRecovering}
                >
                  처음부터 다시
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 용어집 안내 */}
      {!activeJobId && stuckChapters.length === 0 && !isLoading && pendingChapters.length > 0 && (
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

      {/* 로딩 상태 */}
      {isLoading ? (
        <div className="section-surface p-12 text-center">
          <Spinner size="lg" className="mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">회차 목록을 불러오는 중...</p>
        </div>
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
      ) : pendingChapters.length === 0 && !activeJobId ? (
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
      ) : !activeJobId && (
        /* 회차 선택 */
        <div className="section-surface">
          {/* 헤더 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 border-b border-border">
            <div>
              <h2 className="text-lg font-semibold">회차 선택</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                번역할 회차를 선택하세요 (대기 상태만 선택 가능)
              </p>
            </div>
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
          </div>

          {/* 회차 목록 */}
          <div className="p-3 space-y-2">
            {paginatedChapters.map((chapter) => (
              <ChapterItem
                key={chapter.id}
                chapter={chapter}
                isSelected={selectedChapters.has(chapter.number)}
                onToggle={toggleChapter}
              />
            ))}
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
                {/* 페이지 번호 버튼들 */}
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

          {/* 액션 */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 border-t border-border bg-muted/30">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{selectedChapters.size}</span>개 회차 선택됨
            </p>
            <Button
              size="lg"
              onClick={() => handleTranslate()}
              disabled={isStarting || selectedChapters.size === 0}
              className="w-full sm:w-auto gap-2"
            >
              {isStarting ? (
                <>
                  <ButtonSpinner />
                  시작 중...
                </>
              ) : (
                <>
                  <Languages className="h-4 w-4" />
                  {selectedChapters.size}개 회차 번역 시작
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
