"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  User,
  Clock,
  CheckCircle,
  FileText,
  Star,
  AlertCircle,
} from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface RevisionRequest {
  id: string;
  reason: string;
  specificFeedback: string | null;
  status: string;
  response: string | null;
  requestedAt: string;
  completedAt: string | null;
  chapter: {
    id: string;
    number: number;
    title: string;
  };
  requestedBy: {
    id: string;
    name: string | null;
  };
}

interface Contract {
  id: string;
  workId: string;
  authorId: string;
  editorId: string;
  startDate: string;
  expectedEndDate: string | null;
  chapterStart: number;
  chapterEnd: number | null;
  isActive: boolean;
  createdAt: string;
  work: {
    id: string;
    titleKo: string;
    titleOriginal: string;
    totalChapters: number;
    genres: string[];
  };
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  editor: {
    id: string;
    name: string | null;
    image: string | null;
  };
  listing: {
    id: string;
    title: string;
    description: string;
  };
  revisionRequests: RevisionRequest[];
}

const revisionStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "warning" | "success" }> = {
  PENDING: { label: "대기", variant: "warning" },
  IN_PROGRESS: { label: "진행중", variant: "default" },
  COMPLETED: { label: "완료", variant: "success" },
  DISPUTED: { label: "이의제기", variant: "destructive" },
};

export default function ContractDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const contractId = params.id as string;

  const [contract, setContract] = useState<Contract | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // Review form
  const [overallRating, setOverallRating] = useState(0);
  const [qualityRating, setQualityRating] = useState(0);
  const [speedRating, setSpeedRating] = useState(0);
  const [communicationRating, setCommunicationRating] = useState(0);
  const [reviewContent, setReviewContent] = useState("");

  const fetchContract = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}`);
      if (!res.ok) {
        if (res.status === 403 || res.status === 404) router.push("/contracts");
        return;
      }
      const data = await res.json();
      setContract(data.contract);
      if (data.hasReview) {
        setReviewSubmitted(true);
      }
    } catch (error) {
      console.error("Failed to fetch contract:", error);
    } finally {
      setIsLoading(false);
    }
  }, [contractId, router]);

  useEffect(() => {
    fetchContract();
  }, [fetchContract]);

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });

      if (res.ok) {
        toast.success("계약이 완료 처리되었습니다");
        await fetchContract();
      } else {
        const err = await res.json();
        toast.error(err.error || "처리에 실패했습니다");
      }
    } catch {
      toast.error("처리에 실패했습니다");
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSubmitReview = async () => {
    if (overallRating === 0) {
      toast.error("전체 평점을 선택해주세요");
      return;
    }

    setIsSubmittingReview(true);
    try {
      const body: Record<string, unknown> = {
        overallRating,
        content: reviewContent || undefined,
        isPublic: true,
      };
      if (qualityRating > 0) body.qualityRating = qualityRating;
      if (speedRating > 0) body.speedRating = speedRating;
      if (communicationRating > 0) body.communicationRating = communicationRating;

      const res = await fetch(`/api/contracts/${contractId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok || res.status === 409) {
        toast.success("리뷰가 제출되었습니다");
        setReviewSubmitted(true);
      } else {
        const err = await res.json();
        toast.error(err.error || "리뷰 작성에 실패했습니다");
      }
    } catch {
      toast.error("리뷰 작성에 실패했습니다");
    } finally {
      setIsSubmittingReview(false);
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
      <div className="max-w-5xl">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="max-w-5xl">
        <div className="text-center py-20">
          <p className="text-muted-foreground">계약을 찾을 수 없습니다</p>
          <Link href="/contracts">
            <Button variant="outline" className="mt-4">계약 목록으로</Button>
          </Link>
        </div>
      </div>
    );
  }

  const isAuthor = session?.user?.id === contract.author.id;
  const isEditor = session?.user?.id === contract.editor.id;

  return (
    <div className="max-w-5xl">
      {/* Breadcrumb */}
      <nav className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/contracts" className="hover:text-foreground transition-colors">
            내 계약
          </Link>
          <span>→</span>
          <span className="text-foreground">계약 상세</span>
        </div>
      </nav>

      {/* Header */}
      <header className="pb-8 border-b border-border mb-8">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-2">
                <Badge
                  variant={contract.isActive ? "default" : "secondary"}
                  className={contract.isActive ? "bg-status-success text-white" : ""}
                >
                  {contract.isActive ? (
                    <>
                      <Clock className="h-3 w-3 mr-1" />
                      진행 중
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      완료
                    </>
                  )}
                </Badge>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight mb-1 truncate">
                {contract.listing.title}
              </h1>
              <p className="text-muted-foreground truncate">
              {contract.work.titleKo}
            </p>
          </div>
          {isAuthor && contract.isActive && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isCompleting}>
                  <CheckCircle className="h-4 w-4 mr-1.5" />
                  계약 완료
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>계약 완료 처리</AlertDialogTitle>
                  <AlertDialogDescription>
                    이 계약을 완료 처리하시겠습니까? 완료 후에는 리뷰를 작성할 수 있습니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isCompleting}>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={handleComplete} disabled={isCompleting}>
                    {isCompleting ? "처리 중..." : "완료 처리"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        {/* Main Content */}
        <div className="space-y-10">
          {/* Contract Info */}
          <section>
            <h2 className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
              계약 정보
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="stat-card">
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  시작일
                </p>
                <p className="text-lg font-semibold mt-1">
                  {formatDate(contract.startDate)}
                </p>
              </div>
              <div className="stat-card">
                <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  회차 범위
                </p>
                <p className="text-lg font-semibold mt-1">
                  {contract.chapterStart}화
                  {contract.chapterEnd ? ` ~ ${contract.chapterEnd}화` : " ~"}
                </p>
              </div>
              {contract.expectedEndDate && (
                <div className="stat-card">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    예상 종료일
                  </p>
                  <p className="text-lg font-semibold mt-1">
                    {formatDate(contract.expectedEndDate)}
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Revision Requests */}
          <section>
            <div className="section-header">
              <div>
                <h2 className="text-xl font-semibold">수정 요청</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {contract.revisionRequests.length}건의 수정 요청
                </p>
              </div>
            </div>

            {contract.revisionRequests.length === 0 ? (
              <div className="text-center py-12 border rounded-xl border-dashed">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-muted-foreground">수정 요청이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-3">
                {contract.revisionRequests.map((req) => {
                  const revConfig = revisionStatusConfig[req.status] || revisionStatusConfig.PENDING;
                  return (
                    <div key={req.id} className="border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <Link
                            href={`/works/${contract.work.id}/chapters/${req.chapter.number}`}
                            className="font-medium hover:underline"
                          >
                            {req.chapter.number}화: {req.chapter.title}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {req.requestedBy.name} · {formatDate(req.requestedAt)}
                          </p>
                        </div>
                        <Badge variant={revConfig.variant}>{revConfig.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{req.reason}</p>
                      {req.specificFeedback && (
                        <p className="text-sm mt-2 bg-muted/50 rounded-lg p-3">
                          {req.specificFeedback}
                        </p>
                      )}
                      {req.response && (
                        <div className="mt-2 text-sm">
                          <p className="text-xs text-muted-foreground mb-1">답변:</p>
                          <p className="bg-muted/50 rounded-lg p-3">{req.response}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Review Form (Author only, after completion) */}
          {isAuthor && !contract.isActive && !reviewSubmitted && (
            <section>
              <h2 className="text-xl font-semibold mb-2">리뷰 작성</h2>
              <p className="text-sm text-muted-foreground mb-6">
                윤문가에 대한 리뷰를 작성해주세요
              </p>

              <div className="border rounded-xl p-6 space-y-6">
                {/* Overall Rating */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    전체 평점 <span className="text-destructive">*</span>
                  </label>
                  <StarRating value={overallRating} onChange={setOverallRating} />
                </div>

                {/* Detail Ratings */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">품질</label>
                    <StarRating value={qualityRating} onChange={setQualityRating} size="sm" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">속도</label>
                    <StarRating value={speedRating} onChange={setSpeedRating} size="sm" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">소통</label>
                    <StarRating value={communicationRating} onChange={setCommunicationRating} size="sm" />
                  </div>
                </div>

                {/* Content */}
                <div>
                  <label className="text-sm font-medium mb-2 block">리뷰 내용</label>
                  <textarea
                    className="w-full min-h-[120px] rounded-xl border bg-background px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="윤문가에 대한 리뷰를 작성해주세요 (선택)"
                    value={reviewContent}
                    onChange={(e) => setReviewContent(e.target.value)}
                    maxLength={2000}
                  />
                </div>

                <Button
                  onClick={handleSubmitReview}
                  disabled={isSubmittingReview || overallRating === 0}
                >
                  {isSubmittingReview ? "제출 중..." : "리뷰 제출"}
                </Button>
              </div>
            </section>
          )}

          {reviewSubmitted && (
            <div className="border rounded-xl p-6 text-center">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-status-success" />
              <p className="font-medium">리뷰가 제출되었습니다</p>
              <p className="text-sm text-muted-foreground mt-1">감사합니다!</p>
              <Link href={`/works/${contract.workId}`}>
                <Button variant="outline" size="sm" className="mt-4">
                  프로젝트 페이지로 이동
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-8">
          {/* Author Info */}
          <div>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
              작가
            </h3>
            <div className="flex items-center gap-3">
              {contract.author.image ? (
                <img
                  src={contract.author.image}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-medium">{contract.author.name || "이름 없음"}</p>
                {isAuthor && (
                  <span className="text-xs text-muted-foreground">나</span>
                )}
              </div>
            </div>
          </div>

          {/* Editor Info */}
          <div>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
              윤문가
            </h3>
            <div className="flex items-center gap-3">
              {contract.editor.image ? (
                <img
                  src={contract.editor.image}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-medium">{contract.editor.name || "이름 없음"}</p>
                {isEditor && (
                  <span className="text-xs text-muted-foreground">나</span>
                )}
              </div>
            </div>
          </div>

          {/* Work Info */}
          <div>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
              작품 정보
            </h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">작품명</dt>
                <dd className="truncate ml-4">
                  <Link
                    href={`/works/${contract.work.id}`}
                    className="hover:underline"
                  >
                    {contract.work.titleKo}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">총 회차</dt>
                <dd>{contract.work.totalChapters}화</dd>
              </div>
              {contract.work.genres.length > 0 && (
                <div>
                  <dt className="text-muted-foreground mb-1">장르</dt>
                  <dd className="flex flex-wrap gap-1">
                    {contract.work.genres.slice(0, 3).map((genre) => (
                      <span
                        key={genre}
                        className="text-xs px-2 py-0.5 bg-muted rounded"
                      >
                        {genre}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Editor: Quick Link */}
          {isEditor && contract.isActive && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
                빠른 링크
              </h3>
              <Link
                href={`/works/${contract.work.id}/review`}
                className="block"
              >
                <Button variant="outline" size="sm" className="w-full">
                  <FileText className="h-4 w-4 mr-1.5" />
                  프로젝트 검토
                </Button>
              </Link>
            </div>
          )}

          {/* Listing Description */}
          <div>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
              공고 내용
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-6">
              {contract.listing.description}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Star Rating Component
function StarRating({
  value,
  onChange,
  size = "default",
}: {
  value: number;
  onChange: (v: number) => void;
  size?: "default" | "sm";
}) {
  const [hover, setHover] = useState(0);
  const iconSize = size === "sm" ? "h-5 w-5" : "h-7 w-7";

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className="transition-colors cursor-pointer"
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(star === value ? 0 : star)}
        >
          <Star
            className={`${iconSize} ${
              star <= (hover || value)
                ? "text-yellow-500 fill-yellow-500"
                : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
