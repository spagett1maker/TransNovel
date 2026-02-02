"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, Filter, Calendar, Users, BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Listing {
  id: string;
  title: string;
  description: string;
  budgetMin: number | null;
  budgetMax: number | null;
  deadline: string | null;
  chapterStart: number | null;
  chapterEnd: number | null;
  viewCount: number;
  publishedAt: string;
  work: {
    id: string;
    titleKo: string;
    genres: string[];
    sourceLanguage: string;
    totalChapters: number;
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

const GENRES = [
  "무협",
  "판타지",
  "현대판타지",
  "로맨스",
  "로맨스판타지",
  "SF",
  "BL",
  "미스터리",
  "라이트노벨",
];

const LANGUAGES: Record<string, string> = {
  ZH: "중국어",
  JA: "일본어",
  EN: "영어",
};

export default function MarketplacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const abortRef = useRef<AbortController | null>(null);

  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [pagination, setPagination] = useState({
    page: parseInt(searchParams.get("page") || "1", 10),
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Filters
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [genre, setGenre] = useState(searchParams.get("genre") || "all");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") || "recent");

  // URL 동기화
  const syncUrl = useCallback((page: number, s: string, g: string, sort: string) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", page.toString());
    if (s) params.set("search", s);
    if (g && g !== "all") params.set("genre", g);
    if (sort && sort !== "recent") params.set("sortBy", sort);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/marketplace", { scroll: false });
  }, [router]);

  const fetchListings = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setFetchError(false);
    try {
      const params = new URLSearchParams();
      params.set("page", pagination.page.toString());
      params.set("limit", pagination.limit.toString());
      if (search) params.set("search", search);
      if (genre && genre !== "all") params.set("genre", genre);
      if (sortBy) params.set("sortBy", sortBy);

      const res = await fetch(`/api/listings?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        setFetchError(true);
        return;
      }
      const data = await res.json();

      setListings(data.data || []);
      setPagination((prev) => ({
        ...prev,
        total: data.pagination?.total || 0,
        totalPages: data.pagination?.totalPages || 0,
      }));
      syncUrl(pagination.page, search, genre, sortBy);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to fetch listings:", error);
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, search, genre, sortBy, syncUrl]);

  useEffect(() => {
    fetchListings();
    return () => abortRef.current?.abort();
  }, [fetchListings]);

  const handleSearch = () => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const formatDeadline = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return "마감됨";
    if (days === 0) return "오늘 마감";
    if (days === 1) return "내일 마감";
    if (days <= 7) return `${days}일 남음`;
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <header className="pb-8 border-b border-border mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Marketplace
        </p>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          윤문 프로젝트 마켓
        </h1>
        <p className="text-muted-foreground">
          작가들이 올린 윤문 프로젝트에 지원하세요
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="프로젝트 또는 작품 검색..."
            className="pl-10"
          />
        </div>

        <Select value={genre} onValueChange={setGenre}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="장르" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 장르</SelectItem>
            {GENRES.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="정렬" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">최신순</SelectItem>
            <SelectItem value="deadline">마감임박순</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={handleSearch}>
          <Filter className="h-4 w-4 mr-2" />
          검색
        </Button>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
        </div>
      ) : fetchError ? (
        <div className="text-center py-20 border rounded-xl border-dashed">
          <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">
            데이터를 불러오는 데 실패했습니다
          </p>
          <Button variant="outline" onClick={() => { setFetchError(false); fetchListings(); }}>
            다시 시도
          </Button>
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-20 border rounded-xl border-dashed">
          <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            {search || genre ? "검색 조건에 맞는 프로젝트가 없습니다" : "현재 진행 중인 프로젝트가 없습니다"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map((listing) => (
            <Link
              key={listing.id}
              href={`/marketplace/${listing.id}`}
              className="block border rounded-xl p-6 hover:bg-muted/50 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <h3 className="font-medium line-clamp-1" title={listing.title}>{listing.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {listing.work.titleKo}
                      </p>
                    </div>
                    {listing.deadline && (
                      <Badge
                        variant={
                          formatDeadline(listing.deadline)?.includes("마감")
                            ? "destructive"
                            : "secondary"
                        }
                        className="shrink-0"
                      >
                        <Calendar className="h-3 w-3 mr-1" />
                        {formatDeadline(listing.deadline)}
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {listing.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {/* Chapter Range */}
                    {(listing.chapterStart != null || listing.chapterEnd != null) && (
                      <span className="text-muted-foreground">
                        {listing.chapterStart != null && listing.chapterEnd != null
                          ? `${listing.chapterStart}-${listing.chapterEnd}화`
                          : listing.chapterStart != null
                          ? `${listing.chapterStart}화~`
                          : `~${listing.chapterEnd}화`}
                      </span>
                    )}

                    {/* Budget */}
                    {(listing.budgetMin != null || listing.budgetMax != null) && (
                      <span className="text-muted-foreground">
                        {listing.budgetMin != null && listing.budgetMax != null
                          ? `${listing.budgetMin.toLocaleString("ko-KR")}~${listing.budgetMax.toLocaleString("ko-KR")}원`
                          : listing.budgetMin != null
                          ? `${listing.budgetMin.toLocaleString("ko-KR")}원~`
                          : `~${listing.budgetMax!.toLocaleString("ko-KR")}원`}
                      </span>
                    )}

                    {/* Applications */}
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {listing._count.applications}명 지원
                    </span>

                    {/* Genre & Language */}
                    <div className="flex gap-1 ml-auto">
                      <Badge variant="outline" className="text-xs">
                        {LANGUAGES[listing.work.sourceLanguage] || listing.work.sourceLanguage}
                      </Badge>
                      {listing.work.genres.slice(0, 2).map((g) => (
                        <Badge key={g} variant="secondary" className="text-xs">
                          {g}
                        </Badge>
                      ))}
                    </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          <Button
            variant="outline"
            disabled={pagination.page === 1}
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
          >
            이전
          </Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            disabled={pagination.page === pagination.totalPages}
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}
