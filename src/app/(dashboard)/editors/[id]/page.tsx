"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EditorAvailability } from "@prisma/client";
import {
  ArrowLeft,
  Star,
  Briefcase,
  Globe,
  BookOpen,
  Languages,
  MessageSquare,
  User,
  Calendar,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PortfolioItem {
  id: string;
  title: string;
  description: string | null;
  genre: string | null;
  sampleText: string | null;
}

interface Review {
  id: string;
  overallRating: number;
  qualityRating: number | null;
  speedRating: number | null;
  communicationRating: number | null;
  content: string | null;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  work: {
    id: string;
    titleKo: string;
  };
}

interface EditorProfile {
  id: string;
  displayName: string | null;
  bio: string | null;
  portfolioUrl: string | null;
  specialtyGenres: string[];
  languages: string[];
  availability: EditorAvailability;
  maxConcurrent: number;
  completedProjects: number;
  averageRating: number | null;
  totalReviews: number;
  isVerified: boolean;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  portfolioItems: PortfolioItem[];
  reviews: Review[];
  _count: {
    reviews: number;
  };
}

const LANGUAGES: Record<string, string> = {
  ZH: "중국어",
  JA: "일본어",
  EN: "영어",
};

export default function EditorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [profile, setProfile] = useState<EditorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch(`/api/editors/${id}`);
      if (!res.ok) {
        router.push("/editors");
        return;
      }
      const data = await res.json();
      setProfile(data.profile);
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      toast.error("프로필을 불러오지 못했습니다");
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating
                ? "fill-yellow-500 text-yellow-500"
                : "text-muted-foreground"
            }`}
          />
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">윤문가를 찾을 수 없습니다</p>
        <Link href="/editors">
          <Button variant="outline" className="mt-4">
            목록으로 돌아가기
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Back button */}
      <Link
        href="/editors"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        윤문가 목록
      </Link>

      {/* Profile Header */}
      <div className="flex items-start gap-6 pb-8 border-b border-border mb-8">
        {profile.user.image ? (
          <Image
            src={profile.user.image}
            alt=""
            width={96}
            height={96}
            className="h-24 w-24 rounded-full object-cover"
          />
        ) : (
          <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
            <span className="text-3xl font-medium">
              {(profile.displayName || profile.user.name || "?")[0]}
            </span>
          </div>
        )}

        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold">
              {profile.displayName || profile.user.name}
            </h1>
            {getAvailabilityBadge(profile.availability)}
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            {profile.averageRating && (
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                {profile.averageRating.toFixed(1)} ({profile.totalReviews}개 리뷰)
              </span>
            )}
            <span className="flex items-center gap-1">
              <Briefcase className="h-4 w-4" />
              {profile.completedProjects}개 프로젝트 완료
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(profile.createdAt)} 가입
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {profile.specialtyGenres.map((genre) => (
              <Badge key={genre} variant="secondary">
                {genre}
              </Badge>
            ))}
            {profile.languages.map((lang) => (
              <Badge key={lang} variant="outline">
                {LANGUAGES[lang] || lang}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-3 mb-8">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">동시 작업</p>
          <p className="text-lg font-semibold">최대 {profile.maxConcurrent}개</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">완료 프로젝트</p>
          <p className="text-lg font-semibold">{profile.completedProjects}개</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">총 리뷰</p>
          <p className="text-lg font-semibold">{profile._count.reviews}개</p>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Bio */}
          {profile.bio && (
            <section>
              <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
                <User className="h-5 w-5" />
                소개
              </h2>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {profile.bio}
              </p>
            </section>
          )}

          {/* Portfolio */}
          {profile.portfolioItems.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                포트폴리오
              </h2>
              <div className="space-y-4">
                {profile.portfolioItems.map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium">{item.title}</h3>
                      {item.genre && (
                        <Badge variant="outline">{item.genre}</Badge>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {item.description}
                      </p>
                    )}
                    {item.sampleText && (
                      <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs text-muted-foreground mb-1">샘플</p>
                        <p className="text-sm whitespace-pre-wrap line-clamp-4">
                          {item.sampleText}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Empty state when no bio, portfolio, or reviews */}
          {!profile.bio && profile.portfolioItems.length === 0 && profile.reviews.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <User className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>아직 등록된 상세 정보가 없습니다.</p>
            </div>
          )}

          {/* Reviews */}
          {profile.reviews.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                리뷰
              </h2>
              <div className="space-y-4">
                {profile.reviews.map((review) => (
                  <div
                    key={review.id}
                    className="border rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-3">
                        {review.author.image ? (
                          <Image
                            src={review.author.image}
                            alt=""
                            width={32}
                            height={32}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-sm font-medium">
                              {(review.author.name || "?")[0]}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium">{review.author.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {review.work.titleKo}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {renderStars(review.overallRating)}
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(review.createdAt)}
                        </p>
                      </div>
                    </div>
                    {review.content && (
                      <p className="text-sm text-muted-foreground mt-3">
                        {review.content}
                      </p>
                    )}
                    {(review.qualityRating || review.speedRating || review.communicationRating) && (
                      <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                        {review.qualityRating && (
                          <span>품질: {review.qualityRating}/5</span>
                        )}
                        {review.speedRating && (
                          <span>속도: {review.speedRating}/5</span>
                        )}
                        {review.communicationRating && (
                          <span>소통: {review.communicationRating}/5</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* External Links */}
          {profile.portfolioUrl && (
            <div className="border rounded-xl p-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Globe className="h-4 w-4" />
                외부 링크
              </h3>
              <a
                href={profile.portfolioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline break-all"
              >
                {profile.portfolioUrl}
              </a>
            </div>
          )}

          {/* Languages */}
          {profile.languages.length > 0 && (
            <div className="border rounded-xl p-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Languages className="h-4 w-4" />
                번역 가능 언어
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map((lang) => (
                  <Badge key={lang} variant="outline">
                    {LANGUAGES[lang] || lang}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* 상태 안내 */}
          {profile.availability === "UNAVAILABLE" && (
            <div className="border rounded-xl p-4">
              <p className="text-sm text-muted-foreground text-center">
                현재 새 프로젝트를 받지 않습니다
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
