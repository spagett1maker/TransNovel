"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EditorAvailability } from "@prisma/client";
import {
  User,
  Briefcase,
  Star,
  Edit,
  Plus,
  Trash2,
  Save,
  X,
  Globe,
  BookOpen,
  Languages,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface PortfolioItem {
  id: string;
  title: string;
  description: string | null;
  genre: string | null;
  sampleText: string | null;
  sortOrder: number;
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
  portfolioItems: PortfolioItem[];
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
  "기타",
];

const LANGUAGES = [
  { code: "ZH", label: "중국어" },
  { code: "JA", label: "일본어" },
  { code: "EN", label: "영어" },
];

export default function MyProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [profile, setProfile] = useState<EditorProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit form state
  const [formData, setFormData] = useState<{
    displayName: string;
    bio: string;
    portfolioUrl: string;
    specialtyGenres: string[];
    languages: string[];
    availability: EditorAvailability;
    maxConcurrent: number;
  }>({
    displayName: "",
    bio: "",
    portfolioUrl: "",
    specialtyGenres: [],
    languages: [],
    availability: EditorAvailability.AVAILABLE,
    maxConcurrent: 3,
  });

  // Portfolio dialog state
  const [portfolioDialogOpen, setPortfolioDialogOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<PortfolioItem | null>(null);
  const [portfolioForm, setPortfolioForm] = useState({
    title: "",
    description: "",
    genre: "",
    sampleText: "",
  });
  const [deletingPortfolioId, setDeletingPortfolioId] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/me/editor-profile");
      const data = await res.json();
      setProfile(data.profile);
      if (data.profile) {
        setFormData({
          displayName: data.profile.displayName || "",
          bio: data.profile.bio || "",
          portfolioUrl: data.profile.portfolioUrl || "",
          specialtyGenres: data.profile.specialtyGenres || [],
          languages: data.profile.languages || [],
          availability: data.profile.availability,
          maxConcurrent: data.profile.maxConcurrent,
        });
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      toast.error("프로필을 불러오지 못했습니다");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchProfile();
    }
  }, [status, fetchProfile]);

  // Redirect non-editors
  useEffect(() => {
    if (status === "authenticated" && session?.user.role !== "EDITOR" && session?.user.role !== "ADMIN") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  const handleCreateProfile = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/me/editor-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast.success("프로필이 생성되었습니다");
        await fetchProfile();
      } else {
        const data = await res.json();
        toast.error(data.error || "프로필 생성에 실패했습니다");
      }
    } catch (error) {
      console.error("Failed to create profile:", error);
      toast.error("프로필 생성에 실패했습니다");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/me/editor-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        toast.success("프로필이 저장되었습니다");
        await fetchProfile();
        setIsEditing(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "프로필 저장에 실패했습니다");
      }
    } catch (error) {
      console.error("Failed to update profile:", error);
      toast.error("프로필 저장에 실패했습니다");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePortfolio = async () => {
    setIsSaving(true);
    try {
      const method = editingPortfolio ? "PATCH" : "POST";
      const url = editingPortfolio
        ? `/api/me/editor-profile/portfolio/${editingPortfolio.id}`
        : "/api/me/editor-profile/portfolio";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(portfolioForm),
      });

      if (res.ok) {
        toast.success(editingPortfolio ? "포트폴리오가 수정되었습니다" : "포트폴리오가 추가되었습니다");
        await fetchProfile();
        setPortfolioDialogOpen(false);
        setEditingPortfolio(null);
        setPortfolioForm({ title: "", description: "", genre: "", sampleText: "" });
      } else {
        const data = await res.json();
        toast.error(data.error || "포트폴리오 저장에 실패했습니다");
      }
    } catch (error) {
      console.error("Failed to save portfolio item:", error);
      toast.error("포트폴리오 저장에 실패했습니다");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePortfolio = async () => {
    if (!deletingPortfolioId) return;

    try {
      const res = await fetch(`/api/me/editor-profile/portfolio/${deletingPortfolioId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("포트폴리오가 삭제되었습니다");
        await fetchProfile();
      } else {
        const data = await res.json();
        toast.error(data.error || "포트폴리오 삭제에 실패했습니다");
      }
    } catch (error) {
      console.error("Failed to delete portfolio item:", error);
      toast.error("포트폴리오 삭제에 실패했습니다");
    } finally {
      setDeletingPortfolioId(null);
    }
  };

  const toggleGenre = (genre: string) => {
    setFormData((prev) => ({
      ...prev,
      specialtyGenres: prev.specialtyGenres.includes(genre)
        ? prev.specialtyGenres.filter((g) => g !== genre)
        : [...prev.specialtyGenres, genre],
    }));
  };

  const toggleLanguage = (lang: string) => {
    setFormData((prev) => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((l) => l !== lang)
        : [...prev.languages, lang],
    }));
  };

  if (status === "loading" || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No profile yet - show create form
  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto">
        <header className="pb-8 border-b border-border mb-8">
          <h1 className="text-3xl font-semibold tracking-tight mb-2">
            윤문가 프로필 만들기
          </h1>
          <p className="text-muted-foreground">
            작가들에게 보여질 프로필을 작성하세요
          </p>
        </header>

        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium mb-2 block">표시 이름</label>
            <Input
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder={session?.user.name || ""}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">자기소개</label>
            <Textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="경력, 전문 분야, 작업 스타일 등을 소개해주세요..."
              rows={4}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">전문 장르</label>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((genre) => (
                <Badge
                  key={genre}
                  variant={formData.specialtyGenres.includes(genre) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleGenre(genre)}
                >
                  {genre}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">번역 가능 언어</label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((lang) => (
                <Badge
                  key={lang.code}
                  variant={formData.languages.includes(lang.code) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleLanguage(lang.code)}
                >
                  {lang.label}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">포트폴리오 URL (선택)</label>
            <Input
              value={formData.portfolioUrl}
              onChange={(e) => setFormData({ ...formData, portfolioUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <Button onClick={handleCreateProfile} disabled={isSaving} className="w-full">
            {isSaving ? "생성 중..." : "프로필 생성"}
          </Button>
        </div>
      </div>
    );
  }

  // Profile exists - show profile view/edit
  return (
    <div className="max-w-4xl">
      {/* Header */}
      <header className="pb-8 border-b border-border mb-8 flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            Editor Profile
          </p>
          <h1 className="text-3xl font-semibold tracking-tight mb-2">
            {profile.displayName || session?.user.name}
          </h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
          </div>
        </div>
        {!isEditing && (
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            <Edit className="h-4 w-4 mr-2" />
            수정
          </Button>
        )}
      </header>

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-3 mb-8">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">상태</p>
          <p className="text-lg font-semibold">
            {profile.availability === "AVAILABLE" && "🟢 가능"}
            {profile.availability === "BUSY" && "🟡 바쁨"}
            {profile.availability === "UNAVAILABLE" && "🔴 불가"}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">동시 작업</p>
          <p className="text-lg font-semibold">최대 {profile.maxConcurrent}개</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">완료 프로젝트</p>
          <p className="text-lg font-semibold">{profile.completedProjects}건</p>
        </div>
      </section>

      {isEditing ? (
        /* Edit Form */
        <div className="space-y-6 border rounded-xl p-6 bg-muted/30">
          <div>
            <label className="text-sm font-medium mb-2 block">표시 이름</label>
            <Input
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">자기소개</label>
            <Textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              rows={4}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">전문 장르</label>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((genre) => (
                <Badge
                  key={genre}
                  variant={formData.specialtyGenres.includes(genre) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleGenre(genre)}
                >
                  {genre}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">번역 가능 언어</label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((lang) => (
                <Badge
                  key={lang.code}
                  variant={formData.languages.includes(lang.code) ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => toggleLanguage(lang.code)}
                >
                  {lang.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium mb-2 block">가용 상태</label>
              <Select
                value={formData.availability}
                onValueChange={(v) => setFormData({ ...formData, availability: v as EditorAvailability })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">가능</SelectItem>
                  <SelectItem value="BUSY">바쁨</SelectItem>
                  <SelectItem value="UNAVAILABLE">불가</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">최대 동시 작업 수</label>
              <Input
                type="number"
                min={1}
                max={10}
                value={formData.maxConcurrent}
                onChange={(e) => setFormData({ ...formData, maxConcurrent: parseInt(e.target.value) || 3 })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">포트폴리오 URL</label>
            <Input
              value={formData.portfolioUrl}
              onChange={(e) => setFormData({ ...formData, portfolioUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              <X className="h-4 w-4 mr-2" />
              취소
            </Button>
            <Button onClick={handleSaveProfile} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "저장 중..." : "저장"}
            </Button>
          </div>
        </div>
      ) : (
        /* View Mode */
        <div className="space-y-8">
          {/* Bio */}
          {profile.bio && (
            <section>
              <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                소개
              </h2>
              <p className="text-muted-foreground whitespace-pre-wrap">{profile.bio}</p>
            </section>
          )}

          {/* Genres */}
          {profile.specialtyGenres.length > 0 && (
            <section>
              <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                전문 장르
              </h2>
              <div className="flex flex-wrap gap-2">
                {profile.specialtyGenres.map((genre) => (
                  <Badge key={genre} variant="secondary">
                    {genre}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* Languages */}
          {profile.languages.length > 0 && (
            <section>
              <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Languages className="h-4 w-4" />
                번역 가능 언어
              </h2>
              <div className="flex flex-wrap gap-2">
                {profile.languages.map((lang) => (
                  <Badge key={lang} variant="secondary">
                    {LANGUAGES.find((l) => l.code === lang)?.label || lang}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* External Portfolio */}
          {profile.portfolioUrl && (
            <section>
              <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Globe className="h-4 w-4" />
                외부 포트폴리오
              </h2>
              <a
                href={profile.portfolioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {profile.portfolioUrl}
              </a>
            </section>
          )}

          {/* Portfolio Items */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                포트폴리오
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingPortfolio(null);
                  setPortfolioForm({ title: "", description: "", genre: "", sampleText: "" });
                  setPortfolioDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                추가
              </Button>
            </div>

            {profile.portfolioItems.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center border rounded-xl border-dashed">
                아직 포트폴리오가 없습니다. 작업물을 추가해보세요.
              </p>
            ) : (
              <div className="space-y-4">
                {profile.portfolioItems.map((item) => (
                  <div
                    key={item.id}
                    className="border rounded-xl p-4 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium">{item.title}</h3>
                        {item.genre && (
                          <Badge variant="outline" className="mt-1">
                            {item.genre}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingPortfolio(item);
                            setPortfolioForm({
                              title: item.title,
                              description: item.description || "",
                              genre: item.genre || "",
                              sampleText: item.sampleText || "",
                            });
                            setPortfolioDialogOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingPortfolioId(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Portfolio Dialog */}
      <Dialog open={portfolioDialogOpen} onOpenChange={setPortfolioDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingPortfolio ? "포트폴리오 수정" : "포트폴리오 추가"}
            </DialogTitle>
            <DialogDescription>
              작업물 정보를 입력하세요
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">제목 *</label>
              <Input
                value={portfolioForm.title}
                onChange={(e) => setPortfolioForm({ ...portfolioForm, title: e.target.value })}
                placeholder="작품명 또는 프로젝트명"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">장르</label>
              <Select
                value={portfolioForm.genre}
                onValueChange={(v) => setPortfolioForm({ ...portfolioForm, genre: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="장르 선택" />
                </SelectTrigger>
                <SelectContent>
                  {GENRES.map((genre) => (
                    <SelectItem key={genre} value={genre}>
                      {genre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">설명</label>
              <Textarea
                value={portfolioForm.description}
                onChange={(e) => setPortfolioForm({ ...portfolioForm, description: e.target.value })}
                placeholder="작업 내용이나 역할을 설명해주세요"
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">샘플 텍스트</label>
              <Textarea
                value={portfolioForm.sampleText}
                onChange={(e) => setPortfolioForm({ ...portfolioForm, sampleText: e.target.value })}
                placeholder="윤문 샘플 (선택)"
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPortfolioDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleSavePortfolio}
              disabled={!portfolioForm.title || isSaving}
            >
              {isSaving ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 포트폴리오 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deletingPortfolioId} onOpenChange={() => setDeletingPortfolioId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>포트폴리오 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 포트폴리오 아이템을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePortfolio}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
