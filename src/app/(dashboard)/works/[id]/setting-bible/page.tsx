"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  FileText,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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

interface SettingBible {
  id: string;
  status: BibleStatus;
  version: number;
  translationGuide: string | null;
  analyzedChapters: number;
  generatedAt: string | null;
  confirmedAt: string | null;
  characters: Character[];
  terms: Term[];
  events: TimelineEvent[];
}

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

  // URL에서 탭 파라미터 읽기 (기본값: characters)
  const initialTab = searchParams.get("tab") || "characters";

  const [bible, setBible] = useState<SettingBible | null>(null);
  const [totalChapters, setTotalChapters] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // UI 상태
  const [activeTab, setActiveTab] = useState(initialTab);
  const [characterSearch, setCharacterSearch] = useState("");
  const [characterRoleFilter, setCharacterRoleFilter] = useState("all");
  const [termSearch, setTermSearch] = useState("");
  const [termCategoryFilter, setTermCategoryFilter] = useState("all");

  // 다이얼로그 상태
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [showGenerationProgress, setShowGenerationProgress] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // 데이터 로드
  const fetchBible = useCallback(async () => {
    try {
      const [bibleRes, statusRes] = await Promise.all([
        fetch(`/api/works/${workId}/setting-bible`),
        fetch(`/api/works/${workId}/setting-bible/status`),
      ]);

      if (bibleRes.ok) {
        const data = await bibleRes.json();
        setBible(data.bible);
      }

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setTotalChapters(statusData.totalChapters || 0);
      }
    } catch (error) {
      console.error("Failed to fetch bible:", error);
      toast.error("설정집을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    fetchBible();
  }, [fetchBible]);

  // 필터링된 캐릭터
  const filteredCharacters = bible?.characters.filter((char) => {
    const matchesSearch =
      !characterSearch ||
      char.nameKorean.toLowerCase().includes(characterSearch.toLowerCase()) ||
      char.nameOriginal.toLowerCase().includes(characterSearch.toLowerCase());
    const matchesRole =
      characterRoleFilter === "all" || char.role === characterRoleFilter;
    return matchesSearch && matchesRole;
  }) || [];

  // 필터링된 용어
  const filteredTerms = bible?.terms.filter((term) => {
    const matchesSearch =
      !termSearch ||
      term.original.toLowerCase().includes(termSearch.toLowerCase()) ||
      term.translated.toLowerCase().includes(termSearch.toLowerCase());
    const matchesCategory =
      termCategoryFilter === "all" || term.category === termCategoryFilter;
    return matchesSearch && matchesCategory;
  }) || [];

  // 핸들러
  const handleDeleteCharacter = async (id: string) => {
    if (!confirm("이 인물을 삭제하시겠습니까?")) return;

    try {
      const response = await fetch(
        `/api/works/${workId}/setting-bible/characters/${id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "삭제에 실패했습니다.");
      }

      toast.success("인물이 삭제되었습니다.");
      fetchBible();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    }
  };

  const handleDeleteTerm = async (id: string) => {
    if (!confirm("이 용어를 삭제하시겠습니까?")) return;

    try {
      const response = await fetch(
        `/api/works/${workId}/setting-bible/terms/${id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "삭제에 실패했습니다.");
      }

      toast.success("용어가 삭제되었습니다.");
      fetchBible();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "삭제에 실패했습니다.");
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
      <div className="max-w-4xl">
        <nav className="mb-6">
          <Link
            href={`/works/${workId}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            프로젝트로 돌아가기
          </Link>
        </nav>

        <div className="section-surface p-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mx-auto mb-4">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">설정집 생성</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            AI가 원문을 분석하여 인물 DB, 용어집, 타임라인을 자동 생성합니다.
            번역 전 설정집을 확정하면 더 일관된 번역이 가능합니다.
          </p>

          {totalChapters > 0 ? (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                총 {totalChapters}개 회차가 분석됩니다
              </p>
              <Button size="lg" onClick={() => setShowGenerationProgress(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                설정집 생성 시작
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-amber-600">
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
          totalChapters={totalChapters}
          open={showGenerationProgress}
          onOpenChange={setShowGenerationProgress}
          onComplete={fetchBible}
        />
      </div>
    );
  }

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
          <p className="text-2xl font-semibold tabular-nums">{bible.characters.length}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">용어</span>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{bible.terms.length}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">이벤트</span>
          </div>
          <p className="text-2xl font-semibold tabular-nums">{bible.events.length}</p>
        </div>
      </div>

      {/* Read-only Warning */}
      {isReadOnly && (
        <div className="p-4 mb-6 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-amber-600" />
          <p className="text-sm text-amber-800">
            설정집이 확정되어 수정할 수 없습니다. 번역 시 이 설정이 자동 적용됩니다.
          </p>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="characters" className="gap-2">
            <Users className="h-4 w-4" />
            인물 DB ({bible.characters.length})
          </TabsTrigger>
          <TabsTrigger value="terms" className="gap-2">
            <FileText className="h-4 w-4" />
            용어집 ({bible.terms.length})
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-2">
            <Clock className="h-4 w-4" />
            타임라인 ({bible.events.length})
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
          {filteredCharacters.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {characterSearch || characterRoleFilter !== "all"
                ? "검색 결과가 없습니다"
                : "등록된 인물이 없습니다"}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCharacters.map((char) => (
                <CharacterCard
                  key={char.id}
                  character={char}
                  onEdit={setEditingCharacter}
                  onDelete={handleDeleteCharacter}
                  readOnly={isReadOnly}
                />
              ))}
            </div>
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

          <TermTable
            terms={filteredTerms}
            onEdit={setEditingTerm}
            onDelete={handleDeleteTerm}
            readOnly={isReadOnly}
          />
        </TabsContent>

        {/* Timeline Tab */}
        <TabsContent value="timeline">
          <TimelineView events={bible.events} />
        </TabsContent>

        {/* Guide Tab */}
        <TabsContent value="guide">
          <div className="section-surface p-6">
            <h3 className="font-semibold mb-4">번역 가이드</h3>
            {isReadOnly ? (
              <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap">
                {bible.translationGuide || "등록된 번역 가이드가 없습니다."}
              </div>
            ) : (
              <Textarea
                value={bible.translationGuide || ""}
                placeholder="AI가 생성한 번역 가이드가 여기에 표시됩니다. 수정이 필요하면 직접 편집할 수 있습니다."
                className="min-h-[300px]"
                readOnly
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
        onSaved={fetchBible}
      />

      <TermEditDialog
        term={editingTerm}
        workId={workId}
        open={!!editingTerm}
        onOpenChange={(open) => !open && setEditingTerm(null)}
        onSaved={fetchBible}
      />

      <GenerationProgress
        workId={workId}
        totalChapters={totalChapters}
        open={showGenerationProgress}
        onOpenChange={setShowGenerationProgress}
        onComplete={fetchBible}
      />

      <ConfirmDialog
        workId={workId}
        stats={{
          characters: bible.characters.length,
          terms: bible.terms.length,
          events: bible.events.length,
        }}
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirmed={() => {
          fetchBible();
          router.refresh();
        }}
      />
    </div>
  );
}
