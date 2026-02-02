"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  FileText,
  Clock,
  Save,
  StopCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

import { BibleStatusBadge } from "@/components/setting-bible/bible-status-badge";
import { CharacterCard } from "@/components/setting-bible/character-card";
import { CharacterEditDialog } from "@/components/setting-bible/character-edit-dialog";
import { TermTable } from "@/components/setting-bible/term-table";
import { TermEditDialog } from "@/components/setting-bible/term-edit-dialog";
import { TimelineView } from "@/components/setting-bible/timeline-view";
import { GenerationProgress } from "@/components/setting-bible/generation-progress";
import { ConfirmDialog } from "@/components/setting-bible/confirm-dialog";
import { useBibleGeneration } from "@/contexts/bible-generation-context";
import { Progress } from "@/components/ui/progress";

import type { BibleStatus, CharacterRole, TermCategory, EventType } from "@prisma/client";

interface Character {
  id: string;
  nameOriginal: string;
  nameKorean: string;
  nameHanja: string | null;
  titles: string[];
  aliases: string[];
  personality: string | null;
  speechStyle: string | null;
  role: CharacterRole;
  description: string | null;
  relationships: Record<string, string> | null;
  firstAppearance: number | null;
  isConfirmed: boolean;
}

interface Term {
  id: string;
  original: string;
  translated: string;
  category: TermCategory;
  note: string | null;
  context: string | null;
  firstAppearance: number | null;
  frequency: number;
  isConfirmed: boolean;
}

interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  chapterStart: number;
  chapterEnd: number | null;
  eventType: EventType;
  importance: number;
  isForeshadowing: boolean;
  foreshadowNote: string | null;
  involvedCharacterIds: string[];
}

// 메타 정보 (카운트 포함, 엔티티 데이터 미포함)
interface BibleMeta {
  id: string;
  status: BibleStatus;
  version: number;
  translationGuide: string | null;
  analyzedChapters: number;
  generatedAt: string | null;
  confirmedAt: string | null;
  characterCount: number;
  termCount: number;
  eventCount: number;
}

const PAGE_SIZE = 100;

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "전체 역할" },
  { value: "PROTAGONIST", label: "주인공" },
  { value: "ANTAGONIST", label: "적대자" },
  { value: "SUPPORTING", label: "조연" },
  { value: "MINOR", label: "단역" },
];

const CATEGORY_FILTER_OPTIONS = [
  { value: "all", label: "전체 분류" },
  { value: "CHARACTER", label: "인명" },
  { value: "PLACE", label: "지명" },
  { value: "ORGANIZATION", label: "조직" },
  { value: "RANK_TITLE", label: "직위" },
  { value: "SKILL_TECHNIQUE", label: "무공" },
  { value: "ITEM", label: "아이템" },
  { value: "OTHER", label: "기타" },
];

export default function SettingBiblePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workId = params.id as string;

  const initialTab = searchParams.get("tab") || "characters";

  // 메타 정보 (가벼운 데이터)
  const [bible, setBible] = useState<BibleMeta | null>(null);
  const [totalChapters, setTotalChapters] = useState(0);
  const [workTitle, setWorkTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // 탭별 페이지네이션 데이터
  const [characters, setCharacters] = useState<{ items: Character[]; total: number }>({ items: [], total: 0 });
  const [terms, setTerms] = useState<{ items: Term[]; total: number }>({ items: [], total: 0 });
  const [events, setEvents] = useState<{ items: TimelineEvent[]; total: number }>({ items: [], total: 0 });
  const [isTabLoading, setIsTabLoading] = useState(false);

  // UI 상태
  const [activeTab, setActiveTab] = useState(initialTab);
  const [characterSearch, setCharacterSearch] = useState("");
  const [characterRoleFilter, setCharacterRoleFilter] = useState("all");
  const [characterPage, setCharacterPage] = useState(1);
  const [termSearch, setTermSearch] = useState("");
  const [termCategoryFilter, setTermCategoryFilter] = useState("all");
  const [termPage, setTermPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);

  // 검색 디바운스
  const charSearchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const termSearchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [debouncedCharSearch, setDebouncedCharSearch] = useState("");
  const [debouncedTermSearch, setDebouncedTermSearch] = useState("");

  // 다이얼로그 상태
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [showGenerationProgress, setShowGenerationProgress] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [deletingCharacterId, setDeletingCharacterId] = useState<string | null>(null);
  const [isDeletingCharacter, setIsDeletingCharacter] = useState(false);
  const [deletingTermId, setDeletingTermId] = useState<string | null>(null);
  const [isDeletingTerm, setIsDeletingTerm] = useState(false);
  const [guideText, setGuideText] = useState("");
  const [isSavingGuide, setIsSavingGuide] = useState(false);
  const [guideDirty, setGuideDirty] = useState(false);

  // 전역 설정집 생성 상태
  const { getJobByWorkId, cancelGeneration } = useBibleGeneration();
  const activeGenerationJob = getJobByWorkId(workId);
  const isGenerating = activeGenerationJob?.status === "generating";

  // 검색 디바운스 처리
  useEffect(() => {
    if (charSearchTimerRef.current) clearTimeout(charSearchTimerRef.current);
    charSearchTimerRef.current = setTimeout(() => {
      setDebouncedCharSearch(characterSearch);
      setCharacterPage(1);
    }, 300);
    return () => { if (charSearchTimerRef.current) clearTimeout(charSearchTimerRef.current); };
  }, [characterSearch]);

  useEffect(() => {
    if (termSearchTimerRef.current) clearTimeout(termSearchTimerRef.current);
    termSearchTimerRef.current = setTimeout(() => {
      setDebouncedTermSearch(termSearch);
      setTermPage(1);
    }, 300);
    return () => { if (termSearchTimerRef.current) clearTimeout(termSearchTimerRef.current); };
  }, [termSearch]);

  // 메타 데이터 로드 (가벼운 요청)
  const fetchBibleMeta = useCallback(async () => {
    try {
      const [bibleRes, statusRes, workRes] = await Promise.all([
        fetch(`/api/works/${workId}/setting-bible`),
        fetch(`/api/works/${workId}/setting-bible/status`),
        fetch(`/api/works/${workId}`),
      ]);

      if (bibleRes.ok) {
        const data = await bibleRes.json();
        setBible(data.bible);
        if (data.bible?.translationGuide != null) {
          setGuideText(data.bible.translationGuide);
          setGuideDirty(false);
        }
      }

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setTotalChapters(statusData.totalChapters || 0);
      }

      if (workRes.ok) {
        const workData = await workRes.json();
        setWorkTitle(workData.titleKo || workData.titleOriginal || "");
      }
    } catch (error) {
      console.error("Failed to fetch bible:", error);
      toast.error("설정집을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [workId]);

  // 탭별 데이터 로드 (페이지네이션)
  const fetchTabData = useCallback(async (tab: string, page: number, search: string, filter: string) => {
    if (!bible) return;
    setIsTabLoading(true);
    try {
      const params = new URLSearchParams({
        tab,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (filter !== "all") params.set("filter", filter);

      const res = await fetch(`/api/works/${workId}/setting-bible?${params}`);
      if (!res.ok) return;
      const data = await res.json();

      if (tab === "characters") {
        setCharacters({ items: data.characters || [], total: data.total || 0 });
      } else if (tab === "terms") {
        setTerms({ items: data.terms || [], total: data.total || 0 });
      } else if (tab === "events") {
        setEvents({ items: data.events || [], total: data.total || 0 });
      }
    } catch (error) {
      console.error(`Failed to fetch ${tab} data:`, error);
    } finally {
      setIsTabLoading(false);
    }
  }, [workId, bible]);

  // 생성 완료 시 콜백
  const handleGenerationComplete = useCallback(async () => {
    await fetchBibleMeta();
  }, [fetchBibleMeta]);

  // 초기 로드
  useEffect(() => {
    fetchBibleMeta();
  }, [fetchBibleMeta]);

  // 탭/페이지/필터 변경 시 데이터 로드
  useEffect(() => {
    if (!bible) return;
    if (activeTab === "characters") {
      fetchTabData("characters", characterPage, debouncedCharSearch, characterRoleFilter);
    }
  }, [bible, activeTab, characterPage, debouncedCharSearch, characterRoleFilter, fetchTabData]);

  useEffect(() => {
    if (!bible) return;
    if (activeTab === "terms") {
      fetchTabData("terms", termPage, debouncedTermSearch, termCategoryFilter);
    }
  }, [bible, activeTab, termPage, debouncedTermSearch, termCategoryFilter, fetchTabData]);

  useEffect(() => {
    if (!bible) return;
    if (activeTab === "timeline") {
      fetchTabData("events", eventPage, "", "all");
    }
  }, [bible, activeTab, eventPage, fetchTabData]);

  // 필터 변경 시 페이지 리셋
  useEffect(() => { setCharacterPage(1); }, [characterRoleFilter]);
  useEffect(() => { setTermPage(1); }, [termCategoryFilter]);

  // 핸들러
  const handleDeleteCharacter = async () => {
    if (!deletingCharacterId || isDeletingCharacter) return;

    setIsDeletingCharacter(true);
    try {
      const response = await fetch(
        `/api/works/${workId}/setting-bible/characters/${deletingCharacterId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "삭제에 실패했습니다.");
      }

      toast.success("인물이 삭제되었습니다.");
      // 탭 데이터 + 메타(카운트) 새로고침
      fetchBibleMeta();
      fetchTabData("characters", characterPage, debouncedCharSearch, characterRoleFilter);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setDeletingCharacterId(null);
      setIsDeletingCharacter(false);
    }
  };

  const handleDeleteTerm = async () => {
    if (!deletingTermId || isDeletingTerm) return;

    setIsDeletingTerm(true);
    try {
      const response = await fetch(
        `/api/works/${workId}/setting-bible/terms/${deletingTermId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "삭제에 실패했습니다.");
      }

      toast.success("용어가 삭제되었습니다.");
      fetchBibleMeta();
      fetchTabData("terms", termPage, debouncedTermSearch, termCategoryFilter);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setDeletingTermId(null);
      setIsDeletingTerm(false);
    }
  };

  const handleSaveGuide = async () => {
    if (isSavingGuide) return;
    setIsSavingGuide(true);
    try {
      const res = await fetch(`/api/works/${workId}/setting-bible`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ translationGuide: guideText }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "번역 가이드 저장에 실패했습니다.");
        return;
      }
      toast.success("번역 가이드가 저장되었습니다.");
      setGuideDirty(false);
    } catch (error) {
      console.error("Failed to save translation guide:", error);
      toast.error("번역 가이드 저장에 실패했습니다.");
    } finally {
      setIsSavingGuide(false);
    }
  };

  const isReadOnly = bible?.status === "CONFIRMED";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  // 설정집이 없는 경우
  if (!bible) {
    return (
      <div className="max-w-6xl">
        <nav className="mb-6">
          <Link
            href={`/works/${workId}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            프로젝트로 돌아가기
          </Link>
        </nav>

        <div className="section-surface p-16 text-center max-w-4xl mx-auto">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto mb-4">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">설정집 생성</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            AI가 원문을 분석하여 인물 DB, 용어집, 타임라인을 자동 생성합니다.
            번역 전 설정집을 확정하면 더 일관된 번역이 가능합니다.
          </p>

          {totalChapters > 0 ? (
            isGenerating && activeGenerationJob ? (
              <div className="space-y-4">
                <div className="p-4 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Spinner size="sm" className="text-violet-600" />
                    <span className="font-medium text-violet-700 dark:text-violet-300">
                      설정집 생성 중...
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-violet-600 dark:text-violet-400">
                      <span>
                        {activeGenerationJob.currentBatch}/{activeGenerationJob.totalBatches} 배치 분석 중
                      </span>
                      <span>{activeGenerationJob.progress}%</span>
                    </div>
                    <Progress
                      value={activeGenerationJob.progress}
                      className="h-2 [&>div]:bg-violet-500"
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    cancelGeneration(workId);
                    toast.info("설정집 생성이 취소되었습니다.");
                  }}
                >
                  <StopCircle className="mr-2 h-4 w-4" />
                  생성 취소
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  총 {totalChapters}개 회차가 분석됩니다
                </p>
                <Button size="lg" onClick={() => setShowGenerationProgress(true)}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  설정집 생성 시작
                </Button>
              </>
            )
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                회차가 등록되지 않았습니다. 먼저 원문을 업로드해주세요.
              </p>
              <Button variant="outline" asChild>
                <Link href={`/works/${workId}/chapters`}>회차 업로드하기</Link>
              </Button>
            </div>
          )}
        </div>

        <GenerationProgress
          workId={workId}
          workTitle={workTitle}
          totalChapters={totalChapters}
          open={showGenerationProgress}
          onOpenChange={setShowGenerationProgress}
          onComplete={handleGenerationComplete}
        />
      </div>
    );
  }

  // 페이지네이션 컴포넌트
  const PaginationControls = ({ page, total, pageSize, onPageChange }: { page: number; total: number; pageSize: number; onPageChange: (p: number) => void }) => {
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) return null;

    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);

    return (
      <div className="flex items-center justify-between mt-4 pt-4 border-t">
        <span className="text-sm text-muted-foreground">
          {total.toLocaleString()}개 중 {start.toLocaleString()}-{end.toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
            이전
          </Button>
          <span className="text-sm tabular-nums">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            다음
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <nav className="mb-6">
        <Link
          href={`/works/${workId}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          프로젝트로 돌아가기
        </Link>
      </nav>

      <header className="pb-6 border-b border-border mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-semibold">설정집 관리</h1>
              <BibleStatusBadge status={bible.status} />
            </div>
            <p className="text-muted-foreground">
              분석된 회차: {bible.analyzedChapters}/{totalChapters}화
              {bible.generatedAt && (
                <span className="ml-2 text-sm">
                  · 생성: {new Date(bible.generatedAt).toLocaleDateString()}
                </span>
              )}
            </p>
            {/* 생성 중 상태 표시 */}
            {isGenerating && activeGenerationJob && (
              <div className="mt-3 flex items-center gap-3">
                <Spinner size="sm" className="text-violet-600" />
                <div className="flex-1 max-w-xs">
                  <div className="flex justify-between text-xs text-violet-600 dark:text-violet-400 mb-1">
                    <span>
                      {activeGenerationJob.currentBatch}/{activeGenerationJob.totalBatches} 배치 분석 중
                    </span>
                    <span>{activeGenerationJob.progress}%</span>
                  </div>
                  <Progress
                    value={activeGenerationJob.progress}
                    className="h-1.5 [&>div]:bg-violet-500"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            {/* 다운로드 버튼 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  다운로드
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    window.location.href = `/api/works/${workId}/setting-bible/export?format=json`;
                  }}
                >
                  JSON 형식 (.json)
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    window.location.href = `/api/works/${workId}/setting-bible/export?format=csv`;
                  }}
                >
                  CSV 형식 (.csv)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {bible.status !== "CONFIRMED" && (
              isGenerating ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    cancelGeneration(workId);
                    toast.info("설정집 생성이 취소되었습니다.");
                  }}
                >
                  <StopCircle className="mr-2 h-4 w-4" />
                  생성 취소
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setShowGenerationProgress(true)}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    재분석
                  </Button>
                  <Button onClick={() => setShowConfirmDialog(true)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    설정집 확정
                  </Button>
                </>
              )
            )}
            {bible.status === "CONFIRMED" && (
              <Button asChild>
                <Link href={`/works/${workId}/translate`}>
                  번역 시작하기
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">인물</span>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{bible.characterCount.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">용어</span>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{bible.termCount.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">이벤트</span>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{bible.eventCount.toLocaleString()}</p>
        </div>
      </div>

      {/* Read-only Warning */}
      {isReadOnly && (
        <div className="p-4 mb-6 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            설정집이 확정되어 수정할 수 없습니다. 번역 시 이 설정이 자동 적용됩니다.
          </p>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="characters" className="gap-2">
            <Users className="h-4 w-4" />
            인물 DB ({bible.characterCount.toLocaleString()})
          </TabsTrigger>
          <TabsTrigger value="terms" className="gap-2">
            <FileText className="h-4 w-4" />
            용어집 ({bible.termCount.toLocaleString()})
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-2">
            <Clock className="h-4 w-4" />
            타임라인 ({bible.eventCount.toLocaleString()})
          </TabsTrigger>
          <TabsTrigger value="guide">번역 가이드</TabsTrigger>
        </TabsList>

        {/* Characters Tab */}
        <TabsContent value="characters">
          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="인물 검색..."
                value={characterSearch}
                onChange={(e) => setCharacterSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={characterRoleFilter} onValueChange={setCharacterRoleFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Character Grid */}
          {isTabLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="md" />
            </div>
          ) : characters.items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {characterSearch || characterRoleFilter !== "all"
                ? "검색 결과가 없습니다"
                : "등록된 인물이 없습니다"}
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {characters.items.map((char) => (
                  <CharacterCard
                    key={char.id}
                    character={char}
                    onEdit={setEditingCharacter}
                    onDelete={setDeletingCharacterId}
                    readOnly={isReadOnly}
                  />
                ))}
              </div>
              <PaginationControls
                page={characterPage}
                total={characters.total}
                pageSize={PAGE_SIZE}
                onPageChange={setCharacterPage}
              />
            </>
          )}
        </TabsContent>

        {/* Terms Tab */}
        <TabsContent value="terms">
          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="용어 검색..."
                value={termSearch}
                onChange={(e) => setTermSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={termCategoryFilter} onValueChange={setTermCategoryFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isTabLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="md" />
            </div>
          ) : (
            <>
              <TermTable
                terms={terms.items}
                onEdit={setEditingTerm}
                onDelete={setDeletingTermId}
                readOnly={isReadOnly}
              />
              <PaginationControls
                page={termPage}
                total={terms.total}
                pageSize={PAGE_SIZE}
                onPageChange={setTermPage}
              />
            </>
          )}
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline">
          {isTabLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="md" />
            </div>
          ) : (
            <>
              <TimelineView events={events.items} />
              <PaginationControls
                page={eventPage}
                total={events.total}
                pageSize={PAGE_SIZE}
                onPageChange={setEventPage}
              />
            </>
          )}
        </TabsContent>

        {/* Guide Tab */}
        <TabsContent value="guide">
          <div className="section-surface p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">번역 가이드</h3>
              {!isReadOnly && (
                <Button
                  size="sm"
                  onClick={handleSaveGuide}
                  disabled={isSavingGuide || !guideDirty}
                >
                  {isSavingGuide ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  저장
                </Button>
              )}
            </div>
            {isReadOnly ? (
              <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap">
                {bible.translationGuide || "등록된 번역 가이드가 없습니다."}
              </div>
            ) : (
              <Textarea
                value={guideText}
                onChange={(e) => {
                  setGuideText(e.target.value);
                  setGuideDirty(true);
                }}
                placeholder="AI가 생성한 번역 가이드가 여기에 표시됩니다. 수정이 필요하면 직접 편집할 수 있습니다."
                className="min-h-[300px]"
              />
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <CharacterEditDialog
        character={editingCharacter}
        workId={workId}
        open={!!editingCharacter}
        onOpenChange={(open) => !open && setEditingCharacter(null)}
        onSaved={() => {
          fetchBibleMeta();
          fetchTabData("characters", characterPage, debouncedCharSearch, characterRoleFilter);
        }}
      />

      <TermEditDialog
        term={editingTerm}
        workId={workId}
        open={!!editingTerm}
        onOpenChange={(open) => !open && setEditingTerm(null)}
        onSaved={() => {
          fetchBibleMeta();
          fetchTabData("terms", termPage, debouncedTermSearch, termCategoryFilter);
        }}
      />

      <GenerationProgress
        workId={workId}
        workTitle={workTitle}
        totalChapters={totalChapters}
        open={showGenerationProgress}
        onOpenChange={setShowGenerationProgress}
        onComplete={handleGenerationComplete}
      />

      <ConfirmDialog
        workId={workId}
        stats={{
          characters: bible.characterCount,
          terms: bible.termCount,
          events: bible.eventCount,
        }}
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirmed={() => {
          setBible((prev) =>
            prev ? { ...prev, status: "CONFIRMED" as BibleStatus } : prev
          );
          fetchBibleMeta();
          router.refresh();
        }}
      />

      {/* 인물 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deletingCharacterId} onOpenChange={() => setDeletingCharacterId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>인물 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 인물을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingCharacter}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCharacter}
              disabled={isDeletingCharacter}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingCharacter ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 용어 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deletingTermId} onOpenChange={() => setDeletingTermId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>용어 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 용어를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingTerm}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTerm}
              disabled={isDeletingTerm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingTerm ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
