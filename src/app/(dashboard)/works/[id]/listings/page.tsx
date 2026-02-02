"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  User,
  Clock,
  FileText,
  CheckCircle,
  XCircle,
  ExternalLink,
  Inbox,
  Pencil,
  Send,
  Trash2,
} from "lucide-react";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PortfolioItem {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
}

interface Application {
  id: string;
  listingId: string;
  proposalMessage: string;
  priceQuote: number | null;
  estimatedDays: number | null;
  status: "PENDING" | "SHORTLISTED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  authorNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  editorProfile: {
    id: string;
    displayName: string | null;
    bio: string | null;
    completedProjects: number;
    averageRating: number | null;
    totalReviews: number;
    user: {
      id: string;
      name: string | null;
      image: string | null;
    };
    portfolioItems: PortfolioItem[];
  };
}

interface Listing {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  status: string;
  budgetMin: number | null;
  budgetMax: number | null;
  deadline: string | null;
  chapterStart: number | null;
  chapterEnd: number | null;
  createdAt: string;
  _count: {
    applications: number;
  };
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" | "pending" }> = {
  PENDING: { label: "대기중", variant: "pending" },
  SHORTLISTED: { label: "관심목록", variant: "warning" },
  ACCEPTED: { label: "진행중", variant: "success" },
  REJECTED: { label: "거절됨", variant: "destructive" },
  WITHDRAWN: { label: "철회됨", variant: "secondary" },
};

function getApplicationStatusConfig(appStatus: string, listingStatus: string) {
  if (appStatus === "ACCEPTED") {
    if (listingStatus === "COMPLETED") return { label: "완료", variant: "secondary" as const };
    if (listingStatus === "CANCELLED") return { label: "취소됨", variant: "destructive" as const };
    return statusConfig.ACCEPTED;
  }
  return statusConfig[appStatus] || statusConfig.PENDING;
}

export default function WorkListingsPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const workId = params.id as string;

  const [listings, setListings] = useState<Listing[]>([]);
  const [applications, setApplications] = useState<Record<string, Application[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [workTitle, setWorkTitle] = useState("");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/works/${workId}/listings`);
      if (!res.ok) {
        if (res.status === 403) {
          toast.error("이 작품의 공고에 접근할 권한이 없습니다");
          router.push("/works");
        }
        return;
      }
      const data = await res.json();
      const listingsData: Listing[] = data.data || [];
      setListings(listingsData);

      if (data.work?.titleKo) {
        setWorkTitle(data.work.titleKo);
      }

      // Fetch applications for each listing
      const appsMap: Record<string, Application[]> = {};
      await Promise.all(
        listingsData.map(async (listing) => {
          const appsRes = await fetch(`/api/listings/${listing.id}/applications`);
          if (appsRes.ok) {
            const appsData = await appsRes.json();
            appsMap[listing.id] = appsData.data || [];
          }
        })
      );
      setApplications(appsMap);
    } catch (error) {
      console.error("Failed to fetch listings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workId, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePublish = async (listingId: string) => {
    setActionLoading(listingId);
    try {
      const res = await fetch(`/api/listings/${listingId}/publish`, {
        method: "POST",
      });

      if (res.ok) {
        toast.success("공고가 게시되었습니다");
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "게시에 실패했습니다");
      }
    } catch {
      toast.error("게시에 실패했습니다");
    } finally {
      setActionLoading(null);
    }
  };

  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    requirements: "",
    budgetMin: "",
    budgetMax: "",
  });
  const [deletingListingId, setDeletingListingId] = useState<string | null>(null);

  const openEditDialog = (listing: Listing) => {
    setEditForm({
      title: listing.title,
      description: listing.description,
      requirements: listing.requirements || "",
      budgetMin: listing.budgetMin?.toString() || "",
      budgetMax: listing.budgetMax?.toString() || "",
    });
    setEditingListing(listing);
  };

  const handleEditListing = async () => {
    if (!editingListing) return;
    setActionLoading(editingListing.id);
    try {
      const payload: Record<string, unknown> = {
        title: editForm.title,
        description: editForm.description,
        requirements: editForm.requirements || undefined,
      };
      if (editForm.budgetMin) payload.budgetMin = parseInt(editForm.budgetMin, 10);
      else payload.budgetMin = null;
      if (editForm.budgetMax) payload.budgetMax = parseInt(editForm.budgetMax, 10);
      else payload.budgetMax = null;

      const res = await fetch(`/api/listings/${editingListing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success("공고가 수정되었습니다");
        setEditingListing(null);
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "수정에 실패했습니다");
      }
    } catch {
      toast.error("수정에 실패했습니다");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteListing = async () => {
    if (!deletingListingId) return;
    setActionLoading(deletingListingId);
    try {
      const res = await fetch(`/api/listings/${deletingListingId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("공고가 삭제되었습니다");
        setDeletingListingId(null);
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "삭제에 실패했습니다");
      }
    } catch {
      toast.error("삭제에 실패했습니다");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateStatus = async (
    listingId: string,
    applicationId: string,
    status: "ACCEPTED" | "REJECTED"
  ) => {
    setActionLoading(applicationId);
    try {
      const res = await fetch(
        `/api/listings/${listingId}/applications/${applicationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );

      if (res.ok) {
        toast.success(status === "ACCEPTED" ? "지원서를 수락했습니다" : "지원서를 거절했습니다");
        await fetchData();
      } else {
        const err = await res.json();
        toast.error(err.error || "처리에 실패했습니다");
      }
    } catch {
      toast.error("처리에 실패했습니다");
    } finally {
      setActionLoading(null);
    }
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

  return (
    <div className="max-w-5xl">
      {/* Breadcrumb */}
      <nav className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/works" className="hover:text-foreground transition-colors">
            프로젝트 목록
          </Link>
          <span>→</span>
          <Link href={`/works/${workId}`} className="hover:text-foreground transition-colors">
            {workTitle || "작품"}
          </Link>
          <span>→</span>
          <span className="text-foreground">지원서 관리</span>
        </div>
      </nav>

      {/* Header */}
      <header className="pb-8 border-b border-border mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Applications
        </p>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          지원서 관리
        </h1>
        <p className="text-muted-foreground">
          윤문가의 지원서를 확인하고 수락 또는 거절하세요
        </p>
      </header>

      {listings.length === 0 ? (
        <div className="text-center py-20 border rounded-xl border-dashed">
          <Inbox className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">등록된 공고가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-12">
          {listings.map((listing) => {
            const apps = applications[listing.id] || [];
            const pendingApps = apps.filter((a) => a.status === "PENDING");
            const otherApps = apps.filter((a) => a.status !== "PENDING");

            return (
              <section key={listing.id}>
                {/* Listing Info */}
                <div className="border rounded-xl p-6 mb-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">{listing.title}</h2>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {listing.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!["IN_PROGRESS", "COMPLETED"].includes(listing.status) && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(listing)}
                            disabled={actionLoading === listing.id}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingListingId(listing.id)}
                            disabled={actionLoading === listing.id}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {listing.status === "DRAFT" && (
                        <Button
                          size="sm"
                          onClick={() => handlePublish(listing.id)}
                          disabled={actionLoading === listing.id}
                        >
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          게시하기
                        </Button>
                      )}
                      <Badge variant={
                        listing.status === "OPEN" ? "success" :
                        listing.status === "DRAFT" ? "secondary" :
                        listing.status === "IN_PROGRESS" ? "warning" :
                        listing.status === "CANCELLED" ? "destructive" :
                        "secondary"
                      }>
                        {listing.status === "DRAFT" ? "초안" : listing.status === "OPEN" ? "모집중" : listing.status === "IN_PROGRESS" ? "진행중" : listing.status === "COMPLETED" ? "완료" : listing.status === "CANCELLED" ? "취소됨" : listing.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                    <span>지원서 {listing._count.applications}건</span>
                  </div>
                </div>

                {/* Applications */}
                {apps.length === 0 ? (
                  <div className="text-center py-12 border rounded-xl border-dashed">
                    <Inbox className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-muted-foreground">아직 지원서가 없습니다</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Pending first, then others */}
                    {[...pendingApps, ...otherApps].map((app) => {
                      const config = getApplicationStatusConfig(app.status, listing.status);
                      const editorName = app.editorProfile.displayName || app.editorProfile.user.name || "이름 없음";

                      return (
                        <div
                          key={app.id}
                          className="border rounded-xl p-6 transition-colors"
                        >
                          {/* Editor Info */}
                          <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex items-center gap-3">
                              {app.editorProfile.user.image ? (
                                <Image
                                  src={app.editorProfile.user.image}
                                  alt=""
                                  width={40}
                                  height={40}
                                  className="w-10 h-10 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                  <User className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}
                              <div>
                                <Link
                                  href={`/editors/${app.editorProfile.id}`}
                                  className="font-medium hover:underline"
                                >
                                  {editorName}
                                </Link>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                  <span>완료 {app.editorProfile.completedProjects}건</span>
                                  {app.editorProfile.averageRating && (
                                    <span>
                                      ★ {app.editorProfile.averageRating.toFixed(1)} ({app.editorProfile.totalReviews})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <Badge variant={config.variant}>{config.label}</Badge>
                          </div>

                          {/* Proposal */}
                          <div className="bg-muted/50 rounded-lg p-4 mb-4">
                            <p className="text-sm whitespace-pre-wrap">{app.proposalMessage}</p>
                          </div>

                          {/* Metadata */}
                          <div className="flex items-center gap-6 text-sm text-muted-foreground mb-4">
                            {app.estimatedDays && (
                              <span className="flex items-center gap-1.5">
                                <Clock className="h-4 w-4" />
                                {app.estimatedDays}일
                              </span>
                            )}
                            <span className="flex items-center gap-1.5">
                              <FileText className="h-4 w-4" />
                              {new Date(app.submittedAt).toLocaleDateString("ko-KR")}
                            </span>
                          </div>

                          {/* Portfolio */}
                          {app.editorProfile.portfolioItems.length > 0 && (
                            <div className="mb-4">
                              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
                                포트폴리오
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {app.editorProfile.portfolioItems.map((item) => (
                                  <span
                                    key={item.id}
                                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-muted rounded-full"
                                  >
                                    {item.url ? (
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:underline flex items-center gap-1"
                                      >
                                        {item.title}
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    ) : (
                                      item.title
                                    )}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          {app.status === "PENDING" && listing.status === "OPEN" && (
                            <div className="flex items-center gap-3 pt-4 border-t">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    disabled={actionLoading === app.id}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-1.5" />
                                    수락
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>지원서 수락</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {editorName}님의 지원서를 수락하시겠습니까?
                                      수락 시 계약이 자동 생성되며, 다른 대기중인 지원서는 자동 거절됩니다.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel disabled={actionLoading === app.id}>취소</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() =>
                                        handleUpdateStatus(listing.id, app.id, "ACCEPTED")
                                      }
                                      disabled={actionLoading === app.id}
                                    >
                                      {actionLoading === app.id ? "처리 중..." : "수락하기"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={actionLoading === app.id}
                                  >
                                    <XCircle className="h-4 w-4 mr-1.5" />
                                    거절
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>지원서 거절</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {editorName}님의 지원서를 거절하시겠습니까?
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel disabled={actionLoading === app.id}>취소</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() =>
                                        handleUpdateStatus(listing.id, app.id, "REJECTED")
                                      }
                                      disabled={actionLoading === app.id}
                                    >
                                      {actionLoading === app.id ? "처리 중..." : "거절하기"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>

                              {actionLoading === app.id && (
                                <div className="h-5 w-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                              )}
                            </div>
                          )}

                          {app.status === "ACCEPTED" && (
                            <div className="pt-4 border-t">
                              <Link href="/contracts">
                                <Button variant="outline" size="sm">
                                  계약 보기 →
                                </Button>
                              </Link>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* 공고 수정 다이얼로그 */}
      <Dialog open={!!editingListing} onOpenChange={() => setEditingListing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>공고 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-title">제목</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">설명</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-requirements">요구사항</Label>
              <Textarea
                id="edit-requirements"
                value={editForm.requirements}
                onChange={(e) => setEditForm((f) => ({ ...f, requirements: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-budgetMin">최소 예산 (원)</Label>
                <Input
                  id="edit-budgetMin"
                  type="number"
                  value={editForm.budgetMin}
                  onChange={(e) => setEditForm((f) => ({ ...f, budgetMin: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-budgetMax">최대 예산 (원)</Label>
                <Input
                  id="edit-budgetMax"
                  type="number"
                  value={editForm.budgetMax}
                  onChange={(e) => setEditForm((f) => ({ ...f, budgetMax: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingListing(null)}>
              취소
            </Button>
            <Button
              onClick={handleEditListing}
              disabled={actionLoading === editingListing?.id || !editForm.title || !editForm.description}
            >
              {actionLoading === editingListing?.id ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 공고 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deletingListingId} onOpenChange={() => setDeletingListingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>공고 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 공고를 삭제하시겠습니까? 대기 중인 지원서는 자동으로 거절 처리됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading === deletingListingId}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteListing}
              disabled={actionLoading === deletingListingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading === deletingListingId ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
