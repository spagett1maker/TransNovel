"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Calendar,
  Users,
  Eye,
  Clock,
  CheckCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Listing {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  deadline: string | null;
  chapterStart: number | null;
  chapterEnd: number | null;
  viewCount: number;
  publishedAt: string;
  status: string;
  work: {
    id: string;
    titleKo: string;
    titleOriginal: string;
    genres: string[];
    sourceLanguage: string;
    synopsis: string;
    totalChapters: number;
    authorId: string;
  };
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  _count: {
    applications: number;
  };
}

interface PreviewChapter {
  number: number;
  title: string | null;
  translatedTitle: string | null;
  translatedContent: string | null;
}

const LANGUAGES: Record<string, string> = {
  ZH: "중국어",
  JA: "일본어",
  EN: "영어",
};

export default function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = useSession();
  const router = useRouter();

  const [listing, setListing] = useState<Listing | null>(null);
  const [myApplication, setMyApplication] = useState<{ id: string; status: string } | null>(null);
  const [hasEditorProfile, setHasEditorProfile] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [previewChapters, setPreviewChapters] = useState<PreviewChapter[]>([]);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
  const [applicationForm, setApplicationForm] = useState({
    proposalMessage: "",
    estimatedDays: "",
  });

  const fetchListing = useCallback(async () => {
    try {
      const res = await fetch(`/api/listings/${id}`);
      if (!res.ok) {
        router.push("/marketplace");
        return;
      }
      const data = await res.json();
      setListing(data.listing);
      setMyApplication(data.myApplication ?? null);
      setHasEditorProfile(data.hasEditorProfile ?? true);
      setPreviewChapters(data.previewChapters ?? []);
    } catch (error) {
      console.error("Failed to fetch listing:", error);
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  const handleApply = async () => {
    if (!applicationForm.proposalMessage || applicationForm.proposalMessage.length < 10) return;

    setIsApplying(true);
    try {
      const res = await fetch(`/api/listings/${id}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalMessage: applicationForm.proposalMessage,
          estimatedDays: applicationForm.estimatedDays
            ? parseInt(applicationForm.estimatedDays)
            : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setApplyDialogOpen(false);
        setApplicationForm({ proposalMessage: "", estimatedDays: "" });
        setMyApplication({ id: data.application.id, status: "PENDING" });
        toast.success("지원이 완료되었습니다");
        fetchListing();
      } else {
        const data = await res.json();
        toast.error(data.error || "지원에 실패했습니다");
      }
    } catch (error) {
      console.error("Failed to apply:", error);
      toast.error("지원에 실패했습니다");
    } finally {
      setIsApplying(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">공고를 찾을 수 없습니다</p>
        <Link href="/marketplace">
          <Button variant="outline" className="mt-4">
            목록으로 돌아가기
          </Button>
        </Link>
      </div>
    );
  }

  const isAuthor = listing.work.authorId === session?.user?.id;
  const isOpen = listing.status === "OPEN";
  const canApply = session?.user?.role === "EDITOR" && !isAuthor;

  return (
    <div className="max-w-4xl">
      {/* Back button */}
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        프로젝트 목록
      </Link>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-semibold">{listing.title}</h1>
              {listing.status !== "OPEN" && (
                <Badge variant={
                  listing.status === "IN_PROGRESS" ? "warning" :
                  listing.status === "COMPLETED" ? "secondary" :
                  listing.status === "CANCELLED" ? "destructive" :
                  "secondary"
                }>
                  {listing.status === "IN_PROGRESS" ? "진행중" :
                   listing.status === "COMPLETED" ? "완료" :
                   listing.status === "CANCELLED" ? "취소됨" :
                   listing.status === "CLOSED" ? "마감" :
                   listing.status}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {listing.viewCount} 조회
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {listing._count.applications}명 지원
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {formatDate(listing.publishedAt)}
              </span>
            </div>
          </div>

          {/* Description */}
          <section>
            <h2 className="text-lg font-medium mb-3">프로젝트 설명</h2>
            <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap">
              {listing.description}
            </div>
          </section>

          {/* Requirements */}
          {listing.requirements && (
            <section>
              <h2 className="text-lg font-medium mb-3">요구사항</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap">
                {listing.requirements}
              </div>
            </section>
          )}

          {/* Work Info */}
          <section className="border rounded-xl p-4">
            <h2 className="text-sm font-medium mb-4">작품 정보</h2>
            <div>
              <h3 className="font-medium">{listing.work.titleKo}</h3>
              <p className="text-sm text-muted-foreground mb-2">
                {listing.work.titleOriginal}
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="outline">
                  {LANGUAGES[listing.work.sourceLanguage] || listing.work.sourceLanguage}
                </Badge>
                {listing.work.genres.map((g) => (
                  <Badge key={g} variant="secondary">
                    {g}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                총 {listing.work.totalChapters}화
              </p>
            </div>
            {listing.work.synopsis && (
              <p className="text-sm text-muted-foreground mt-4 line-clamp-3">
                {listing.work.synopsis}
              </p>
            )}
          </section>

          {/* Chapter Preview */}
          {previewChapters.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                번역 미리보기 (첫 {previewChapters.length}화)
              </h2>
              <div className="space-y-3">
                {previewChapters.map((ch) => {
                  const isExpanded = expandedChapter === ch.number;
                  const displayTitle = ch.translatedTitle || ch.title;
                  const content = ch.translatedContent || "";
                  const previewText = content.length > 500
                    ? content.slice(0, 500) + "..."
                    : content;

                  return (
                    <div key={ch.number} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedChapter(isExpanded ? null : ch.number)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors"
                      >
                        <span className="font-medium text-sm">
                          {ch.number}화
                          {displayTitle && (
                            <span className="ml-2 text-muted-foreground font-normal">
                              {displayTitle}
                            </span>
                          )}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t">
                          <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap pt-3 max-h-[400px] overflow-y-auto">
                            {previewText}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Key Info */}
          <div className="border rounded-xl p-4 space-y-4">
            {/* Chapter Range */}
            {(listing.chapterStart != null || listing.chapterEnd != null) && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">작업 범위</p>
                <p className="font-medium">
                  {listing.chapterStart != null && listing.chapterEnd != null
                    ? `${listing.chapterStart}-${listing.chapterEnd}화`
                    : listing.chapterStart != null
                    ? `${listing.chapterStart}화부터`
                    : `${listing.chapterEnd}화까지`}
                </p>
              </div>
            )}

            {/* Deadline */}
            {listing.deadline && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">마감일</p>
                <p className="font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {formatDate(listing.deadline)}
                </p>
              </div>
            )}
          </div>

          {/* Author Info */}
          <div className="border rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-3">작가</p>
            <div className="flex items-center gap-3">
              {listing.author.image ? (
                <Image
                  src={listing.author.image}
                  alt=""
                  width={40}
                  height={40}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-sm font-medium">
                    {(listing.author.name || "?")[0]}
                  </span>
                </div>
              )}
              <p className="font-medium">{listing.author.name}</p>
            </div>
          </div>

          {/* Apply Button */}
          {canApply && (
            !isOpen ? (
              <Button className="w-full" variant="outline" disabled>
                모집 마감
              </Button>
            ) : !hasEditorProfile ? (
              <div className="space-y-2">
                <Button className="w-full" variant="outline" disabled>
                  지원하기
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  지원하려면 먼저{" "}
                  <Link href="/my-profile" className="text-primary hover:underline">
                    윤문가 프로필
                  </Link>
                  을 작성하세요
                </p>
              </div>
            ) : myApplication ? (
              <Button
                className="w-full"
                variant="outline"
                disabled
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {myApplication.status === "PENDING"
                  ? "지원 완료 (대기 중)"
                  : myApplication.status === "ACCEPTED"
                  ? "지원 승인됨"
                  : myApplication.status === "REJECTED"
                  ? "지원 거절됨"
                  : "이미 지원함"}
              </Button>
            ) : (
              <Button
                className="w-full"
                onClick={() => setApplyDialogOpen(true)}
              >
                지원하기
              </Button>
            )
          )}

          {isAuthor && (
            <Link href={`/works/${listing.work.id}/listings`}>
              <Button variant="outline" className="w-full">
                공고 관리
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Apply Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>프로젝트 지원</DialogTitle>
            <DialogDescription>
              작가에게 보낼 지원서를 작성하세요
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">제안 내용 * <span className="font-normal text-muted-foreground">(10자 이상)</span></label>
              <Textarea
                value={applicationForm.proposalMessage}
                onChange={(e) =>
                  setApplicationForm({ ...applicationForm, proposalMessage: e.target.value })
                }
                placeholder="작업 경험, 접근 방식, 예상 일정 등을 포함해 제안해주세요"
                rows={6}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">예상 소요일</label>
              <Input
                type="number"
                value={applicationForm.estimatedDays}
                onChange={(e) =>
                  setApplicationForm({ ...applicationForm, estimatedDays: e.target.value })
                }
                placeholder="일수"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleApply}
              disabled={
                !applicationForm.proposalMessage ||
                applicationForm.proposalMessage.length < 10 ||
                isApplying
              }
            >
              {isApplying ? "지원 중..." : "지원하기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
