"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { EditorAvailability } from "@prisma/client";
import { Search, Star, Briefcase, Filter, Users } from "lucide-react";

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

interface EditorProfile {
  id: string;
  displayName: string | null;
  bio: string | null;
  specialtyGenres: string[];
  languages: string[];
  availability: EditorAvailability;
  completedProjects: number;
  averageRating: number | null;
  totalReviews: number;
  isVerified: boolean;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  portfolioItems: {
    id: string;
    title: string;
    genre: string | null;
  }[];
  _count: {
    reviews: number;
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

export default function EditorsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const abortRef = useRef<AbortController | null>(null);

  const [editors, setEditors] = useState<EditorProfile[]>([]);
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
  const [availability, setAvailability] = useState(searchParams.get("availability") || "all");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") || "rating");

  // URL 동기화
  const syncUrl = useCallback((page: number, s: string, g: string, avail: string, sort: string) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", page.toString());
    if (s) params.set("search", s);
    if (g && g !== "all") params.set("genre", g);
    if (avail && avail !== "all") params.set("availability", avail);
    if (sort && sort !== "rating") params.set("sortBy", sort);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/editors", { scroll: false });
  }, [router]);

  const fetchEditors = useCallback(async () => {
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
      if (availability && availability !== "all") params.set("availability", availability);
      if (sortBy) params.set("sortBy", sortBy);

      const res = await fetch(`/api/editors?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error("Failed to fetch editors");
      }
      const data = await res.json();

      setEditors(data.data || []);
      setFetchError(false);
      setPagination((prev) => ({
        ...prev,
        total: data.pagination?.total || 0,
        totalPages: data.pagination?.totalPages || 0,
      }));
      syncUrl(pagination.page, search, genre, availability, sortBy);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to fetch editors:", error);
      setFetchError(true);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, search, genre, availability, sortBy, syncUrl]);

  useEffect(() => {
    fetchEditors();
    return () => abortRef.current?.abort();
  }, [fetchEditors]);

  const handleSearch = () => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const getAvailabilityBadge = (status: EditorAvailability) => {
    switch (status) {
      case "AVAILABLE":
        return <Badge variant="success">가능</Badge>;
      case "BUSY":
        return <Badge variant="warning">바쁨</Badge>;
      case "UNAVAILABLE":
        return <Badge variant="destructive">불가</Badge>;
    }
  };

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <header className="pb-8 border-b border-border mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          Directory
        </p>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">
          윤문가 찾기
        </h1>
        <p className="text-muted-foreground">
          검증된 윤문가를 찾아보세요
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
            placeholder="이름 또는 소개 검색..."
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

        <Select value={availability} onValueChange={setAvailability}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="AVAILABLE">가능</SelectItem>
            <SelectItem value="BUSY">바쁨</SelectItem>
            <SelectItem value="UNAVAILABLE">불가</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="정렬" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rating">평점순</SelectItem>
            <SelectItem value="reviews">리뷰순</SelectItem>
            <SelectItem value="projects">프로젝트순</SelectItem>
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
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">
            데이터를 불러오는 데 실패했습니다
          </p>
          <Button variant="outline" onClick={() => { setFetchError(false); fetchEditors(); }}>
            다시 시도
          </Button>
        </div>
      ) : editors.length === 0 ? (
        <div className="text-center py-20 border rounded-xl border-dashed">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">
            {search || genre || availability
              ? "검색 조건에 맞는 윤문가가 없습니다"
              : "등록된 윤문가가 없습니다"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {editors.map((editor) => (
            <Link
              key={editor.id}
              href={`/editors/${editor.id}`}
              className="block border rounded-xl p-6 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-4">
                  {editor.user.image ? (
                    <img
                      src={editor.user.image}
                      alt=""
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-lg font-medium">
                        {(editor.displayName || editor.user.name || "?")[0]}
                      </span>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">
                        {editor.displayName || editor.user.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      {editor.averageRating && (
                        <span className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                          {editor.averageRating.toFixed(1)}
                          <span className="text-xs">({editor.totalReviews})</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Briefcase className="h-3.5 w-3.5" />
                        {editor.completedProjects}개 완료
                      </span>
                    </div>
                  </div>
                </div>
                {getAvailabilityBadge(editor.availability)}
              </div>

              {editor.bio && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                  {editor.bio}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {editor.specialtyGenres.slice(0, 5).map((g) => (
                  <Badge key={g} variant="secondary" className="text-xs">
                    {g}
                  </Badge>
                ))}
                {editor.languages.map((lang) => (
                  <Badge key={lang} variant="outline" className="text-xs">
                    {LANGUAGES[lang] || lang}
                  </Badge>
                ))}
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
