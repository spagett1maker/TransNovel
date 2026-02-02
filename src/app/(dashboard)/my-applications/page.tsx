"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Briefcase, Calendar, User, X, Loader2 } from "lucide-react";

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
} from "@/components/ui/alert-dialog";

interface Application {
  id: string;
  status: "PENDING" | "SHORTLISTED" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
  proposalMessage: string | null;
  priceQuote: number | null;
  submittedAt: string;
  listing: {
    id: string;
    title: string;
    description: string;
    status: string;
    work: {
      id: string;
      titleKo: string;
      titleOriginal: string | null;
      genres: string[];
      totalChapters: number;
      status: string;
    };
    author: {
      id: string;
      name: string | null;
      image: string | null;
    };
    contract?: {
      id: string;
      isActive: boolean;
    } | null;
  };
}

interface Counts {
  total: number;
  pending: number;
  shortlisted: number;
  accepted: number;
  rejected: number;
}

export default function MyApplicationsPage() {
  const { data: session } = useSession();

  const [applications, setApplications] = useState<Application[]>([]);
  const [counts, setCounts] = useState<Counts>({ total: 0, pending: 0, shortlisted: 0, accepted: 0, rejected: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchApplications = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter.toUpperCase());
      }

      const res = await fetch(`/api/me/applications?${params.toString()}`, {
        signal: controller.signal,
      });
      const data = await res.json();
      setApplications(data.applications || []);
      setCounts(data.counts || { total: 0, pending: 0, shortlisted: 0, accepted: 0, rejected: 0 });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to fetch applications:", error);
      toast.error("지원서 목록을 불러오지 못했습니다");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchApplications();
    return () => abortControllerRef.current?.abort();
  }, [fetchApplications]);

  const handleWithdraw = async () => {
    if (!withdrawingId) return;

    setIsWithdrawing(true);
    try {
      const res = await fetch(`/api/me/applications?id=${withdrawingId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success("지원이 철회되었습니다");
        // Optimistic: update local state immediately
        setApplications((prev) =>
          prev.map((app) =>
            app.id === withdrawingId ? { ...app, status: "WITHDRAWN" } : app
          )
        );
        fetchApplications();
      } else {
        const data = await res.json();
        toast.error(data.error || "지원 철회에 실패했습니다");
      }
    } catch (error) {
      console.error("Failed to withdraw application:", error);
      toast.error("지원 철회에 실패했습니다");
    } finally {
      setIsWithdrawing(false);
      setWithdrawingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusConfig = (status: string, listing?: Application["listing"]) => {
    switch (status) {
      case "PENDING":
        return { label: "대기중", variant: "secondary" as const, color: "text-muted-foreground" };
      case "SHORTLISTED":
        return { label: "관심목록", variant: "default" as const, color: "text-status-info" };
      case "ACCEPTED": {
        // 수락된 지원은 프로젝트 진행 상태에 따라 세분화
        const listingStatus = listing?.status;
        const contractDone = listing?.contract?.isActive === false;
        if (listingStatus === "COMPLETED" || contractDone) {
          return { label: "완료", variant: "outline" as const, color: "text-muted-foreground" };
        }
        if (listingStatus === "CANCELLED") {
          return { label: "취소됨", variant: "outline" as const, color: "text-muted-foreground" };
        }
        return { label: "진행중", variant: "default" as const, color: "text-status-success" };
      }
      case "REJECTED":
        return { label: "거절됨", variant: "destructive" as const, color: "text-status-error" };
      case "WITHDRAWN":
        return { label: "철회됨", variant: "outline" as const, color: "text-muted-foreground" };
      default:
        return { label: status, variant: "secondary" as const, color: "text-muted-foreground" };
    }
  };

  // Redirect if not editor
  if (session?.user?.role !== "EDITOR") {
    return (
      <div className="max-w-5xl">
        <div className="text-center py-20">
          <p className="text-muted-foreground">윤문가만 접근할 수 있습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <header className="pb-8 border-b border-border mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Applications
        </p>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          내 지원
        </h1>
        <p className="text-muted-foreground">
          공고에 지원한 내역을 확인하고 관리하세요
        </p>
      </header>

      {/* Status Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8">
        <button
          onClick={() => setStatusFilter("all")}
          className={`text-center p-4 rounded-xl border transition-colors ${
            statusFilter === "all" ? "border-foreground bg-muted/50" : "border-border hover:bg-muted/30"
          }`}
        >
          <p className="text-2xl font-semibold">{counts.total}</p>
          <p className="text-xs text-muted-foreground">전체</p>
        </button>
        <button
          onClick={() => setStatusFilter("pending")}
          className={`text-center p-4 rounded-xl border transition-colors ${
            statusFilter === "pending" ? "border-foreground bg-muted/50" : "border-border hover:bg-muted/30"
          }`}
        >
          <p className="text-2xl font-semibold">{counts.pending}</p>
          <p className="text-xs text-muted-foreground">대기중</p>
        </button>
        <button
          onClick={() => setStatusFilter("shortlisted")}
          className={`text-center p-4 rounded-xl border transition-colors ${
            statusFilter === "shortlisted" ? "border-foreground bg-muted/50" : "border-border hover:bg-muted/30"
          }`}
        >
          <p className="text-2xl font-semibold text-status-info">{counts.shortlisted}</p>
          <p className="text-xs text-muted-foreground">관심목록</p>
        </button>
        <button
          onClick={() => setStatusFilter("accepted")}
          className={`text-center p-4 rounded-xl border transition-colors ${
            statusFilter === "accepted" ? "border-foreground bg-muted/50" : "border-border hover:bg-muted/30"
          }`}
        >
          <p className="text-2xl font-semibold text-status-success">{counts.accepted}</p>
          <p className="text-xs text-muted-foreground">수락됨</p>
        </button>
        <button
          onClick={() => setStatusFilter("rejected")}
          className={`text-center p-4 rounded-xl border transition-colors ${
            statusFilter === "rejected" ? "border-foreground bg-muted/50" : "border-border hover:bg-muted/30"
          }`}
        >
          <p className="text-2xl font-semibold text-muted-foreground">{counts.rejected}</p>
          <p className="text-xs text-muted-foreground">거절됨</p>
        </button>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
        </div>
      ) : applications.length === 0 ? (
        <div className="text-center py-20 border rounded-xl border-dashed">
          <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            {statusFilter !== "all"
              ? "해당 상태의 지원이 없습니다"
              : "아직 지원한 공고가 없습니다"}
          </p>
          <Link href="/marketplace">
            <Button variant="outline" className="mt-4">
              마켓플레이스 둘러보기
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const statusConfig = getStatusConfig(app.status, app.listing);

            return (
              <div
                key={app.id}
                className="border rounded-xl p-6 hover:bg-muted/30 transition-colors"
              >
                <div>
                  <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <Link
                          href={`/marketplace/${app.listing.id}`}
                          className="font-medium hover:underline"
                        >
                          {app.listing.title}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {app.listing.work.titleKo}
                        </p>
                      </div>
                      <Badge variant={statusConfig.variant}>
                        {statusConfig.label}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                      {/* Author */}
                      <div className="flex items-center gap-2">
                        {app.listing.author.image ? (
                          <img
                            src={app.listing.author.image}
                            alt={`${app.listing.author.name || "작가"} 프로필`}
                            className="w-5 h-5 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-3 w-3" />
                          </div>
                        )}
                        <span>{app.listing.author.name}</span>
                      </div>

                      {/* Date */}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(app.submittedAt)}
                      </span>

                    </div>

                    {/* Cover Letter Preview */}
                    {app.proposalMessage && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {app.proposalMessage}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Link href={`/marketplace/${app.listing.id}`}>
                        <Button variant="outline" size="sm">
                          공고 보기
                        </Button>
                      </Link>
                      {app.status === "ACCEPTED" && (
                        <Link href={`/works/${app.listing.work.id}`}>
                          <Button variant="outline" size="sm">
                            작품 보기
                          </Button>
                        </Link>
                      )}
                      {app.status === "PENDING" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setWithdrawingId(app.id)}
                        >
                          <X className="h-4 w-4 mr-1" />
                          지원 철회
                        </Button>
                      )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Withdraw Confirmation Dialog */}
      <AlertDialog open={!!withdrawingId} onOpenChange={() => setWithdrawingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>지원을 철회하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              이 작업은 되돌릴 수 없습니다. 철회 후 다시 지원할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isWithdrawing}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleWithdraw}
              disabled={isWithdrawing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isWithdrawing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  철회 중...
                </>
              ) : (
                "지원 철회"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
