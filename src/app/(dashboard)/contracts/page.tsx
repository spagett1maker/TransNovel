"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Briefcase, Calendar, CheckCircle, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Contract {
  id: string;
  startDate: string;
  expectedEndDate: string | null;
  chapterStart: number;
  chapterEnd: number | null;
  isActive: boolean;
  createdAt: string;
  work: {
    id: string;
    titleKo: string;
    totalChapters: number;
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
  };
  _count: {
    revisionRequests: number;
  };
}

export default function ContractsPage() {
  const { data: session } = useSession();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchContracts = useCallback(async () => {
    setIsLoading(true);
    setFetchError(false);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("isActive", statusFilter === "active" ? "true" : "false");
      }

      const res = await fetch(`/api/contracts?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch contracts");
      }
      const data = await res.json();
      setContracts(data.data || []);
    } catch (error) {
      console.error("Failed to fetch contracts:", error);
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const isAuthor = session?.user?.role === "AUTHOR";

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <header className="pb-8 border-b border-border mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Contracts
        </p>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          내 계약
        </h1>
        <p className="text-muted-foreground">
          {isAuthor ? "윤문가와 맺은 계약을 관리하세요" : "작가와 맺은 계약을 확인하세요"}
        </p>
      </header>

      {/* Filters */}
      <div className="flex gap-4 mb-8">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="active">진행 중</SelectItem>
            <SelectItem value="completed">완료</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
        </div>
      ) : fetchError ? (
        <div className="text-center py-20 border rounded-xl border-dashed">
          <p className="text-muted-foreground mb-4">계약 목록을 불러오지 못했습니다</p>
          <Button variant="outline" onClick={fetchContracts}>다시 시도</Button>
        </div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-20 border rounded-xl border-dashed">
          <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            {statusFilter !== "all"
              ? "해당 상태의 계약이 없습니다"
              : "아직 계약이 없습니다"}
          </p>
          {isAuthor && (
            <Link href="/marketplace">
              <Button variant="outline" className="mt-4">
                윤문가 찾기
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {contracts.map((contract) => (
            <Link
              key={contract.id}
              href={`/contracts/${contract.id}`}
              className="block border rounded-xl p-6 hover:bg-muted/50 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <h3 className="font-medium">{contract.listing.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {contract.work.titleKo}
                      </p>
                    </div>
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

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {/* Partner */}
                    <div className="flex items-center gap-2">
                      {(isAuthor ? contract.editor : contract.author).image ? (
                        <img
                          src={(isAuthor ? contract.editor : contract.author).image!}
                          alt=""
                          className="w-5 h-5 rounded-full"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-muted" />
                      )}
                      <span>{(isAuthor ? contract.editor : contract.author).name}</span>
                    </div>

                    {/* Date */}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(contract.startDate)}
                    </span>

                    {/* Revision Requests */}
                    {contract._count.revisionRequests > 0 && (
                      <span className="text-status-warning">
                        수정요청 {contract._count.revisionRequests}건
                      </span>
                    )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
