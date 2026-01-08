"use client";

import { ChapterStatus, UserRole } from "@prisma/client";
import { ArrowLeft, Check, ChevronDown, Eye, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getStatusDisplayName, getAvailableNextStatuses } from "@/lib/permissions";

interface Chapter {
  id: string;
  number: number;
  title: string | null;
  originalContent: string;
  translatedContent: string | null;
  editedContent: string | null;
  status: ChapterStatus;
  wordCount: number;
}

interface Work {
  id: string;
  titleKo: string;
  titleOriginal: string;
  author: {
    name: string;
  };
  chapters: Chapter[];
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const workId = params.id as string;

  const [work, setWork] = useState<Work | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const userRole = (session?.user?.role as UserRole) || UserRole.AUTHOR;

  useEffect(() => {
    fetchWork();
  }, [workId]);

  async function fetchWork() {
    try {
      const response = await fetch(`/api/works/${workId}`);
      if (!response.ok) throw new Error("Failed to fetch work");
      const data = await response.json();
      setWork(data);

      // 검토 대기 중인 첫 번째 회차 선택
      const pendingChapter = data.chapters.find(
        (c: Chapter) => c.status === "TRANSLATED" || c.status === "REVIEWING"
      );
      if (pendingChapter) {
        setSelectedChapter(pendingChapter);
        setEditedContent(pendingChapter.editedContent || pendingChapter.translatedContent || "");
      }
    } catch (error) {
      console.error("Error fetching work:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    if (!selectedChapter) return;

    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/works/${workId}/chapters/${selectedChapter.number}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            editedContent,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to save");

      // 업데이트된 데이터 반영
      const updatedChapter = await response.json();
      setWork((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chapters: prev.chapters.map((c) =>
            c.id === updatedChapter.id ? updatedChapter : c
          ),
        };
      });
      setSelectedChapter(updatedChapter);
    } catch (error) {
      console.error("Error saving:", error);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(newStatus: ChapterStatus) {
    if (!selectedChapter) return;

    setIsChangingStatus(true);
    try {
      const response = await fetch(
        `/api/works/${workId}/chapters/${selectedChapter.number}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: newStatus,
            editedContent: editedContent || selectedChapter.translatedContent,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "상태 변경에 실패했습니다.");
        return;
      }

      const updatedChapter = await response.json();
      setWork((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chapters: prev.chapters.map((c) =>
            c.id === updatedChapter.id ? updatedChapter : c
          ),
        };
      });
      setSelectedChapter(updatedChapter);
    } catch (error) {
      console.error("Error changing status:", error);
    } finally {
      setIsChangingStatus(false);
    }
  }

  function selectChapter(chapter: Chapter) {
    setSelectedChapter(chapter);
    setEditedContent(chapter.editedContent || chapter.translatedContent || "");
  }

  const availableStatuses = selectedChapter
    ? getAvailableNextStatuses(userRole, selectedChapter.status)
    : [];

  const getStatusColor = (status: ChapterStatus) => {
    const colors: Record<ChapterStatus, string> = {
      PENDING: "bg-gray-100 text-gray-700",
      TRANSLATING: "bg-blue-100 text-blue-700",
      TRANSLATED: "bg-orange-100 text-orange-700",
      REVIEWING: "bg-purple-100 text-purple-700",
      EDITED: "bg-green-100 text-green-700",
      APPROVED: "bg-emerald-100 text-emerald-700",
    };
    return colors[status];
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!work) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">작품을 찾을 수 없습니다.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/works">작품 목록으로</Link>
        </Button>
      </div>
    );
  }

  const reviewableChapters = work.chapters.filter(
    (c) =>
      c.status === "TRANSLATED" ||
      c.status === "REVIEWING" ||
      c.status === "EDITED" ||
      c.status === "APPROVED"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/works">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{work.titleKo}</h1>
          <p className="text-gray-500">
            {work.titleOriginal} · 작가: {work.author?.name}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Chapter List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">회차 목록</CardTitle>
            <CardDescription>검토 가능한 회차</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto">
              {reviewableChapters.length === 0 ? (
                <p className="p-4 text-center text-gray-500">
                  검토 가능한 회차가 없습니다
                </p>
              ) : (
                reviewableChapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    onClick={() => selectChapter(chapter)}
                    className={`w-full flex items-center justify-between p-4 text-left border-b hover:bg-gray-50 transition-colors ${
                      selectedChapter?.id === chapter.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <div>
                      <p className="font-medium">
                        {chapter.number}화
                        {chapter.title && ` - ${chapter.title}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {chapter.wordCount.toLocaleString()}자
                      </p>
                    </div>
                    <Badge className={getStatusColor(chapter.status)}>
                      {getStatusDisplayName(chapter.status)}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Content Editor */}
        {selectedChapter ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>
                  {selectedChapter.number}화
                  {selectedChapter.title && ` - ${selectedChapter.title}`}
                </CardTitle>
                <CardDescription>
                  현재 상태:{" "}
                  <Badge className={getStatusColor(selectedChapter.status)}>
                    {getStatusDisplayName(selectedChapter.status)}
                  </Badge>
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  저장
                </Button>
                {availableStatuses.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button disabled={isChangingStatus}>
                        {isChangingStatus ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-4 w-4" />
                        )}
                        상태 변경
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {availableStatuses.map((status) => (
                        <DropdownMenuItem
                          key={status}
                          onClick={() => handleStatusChange(status)}
                        >
                          {getStatusDisplayName(status)}으로 변경
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="compare">
                <TabsList className="mb-4">
                  <TabsTrigger value="compare">
                    <Eye className="mr-2 h-4 w-4" />
                    비교 보기
                  </TabsTrigger>
                  <TabsTrigger value="edit">수정하기</TabsTrigger>
                </TabsList>

                <TabsContent value="compare">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="mb-2 font-medium text-gray-700">원문</h4>
                      <div className="h-[500px] overflow-y-auto rounded-lg border bg-gray-50 p-4 text-sm whitespace-pre-wrap">
                        {selectedChapter.originalContent}
                      </div>
                    </div>
                    <div>
                      <h4 className="mb-2 font-medium text-gray-700">번역문</h4>
                      <div className="h-[500px] overflow-y-auto rounded-lg border bg-gray-50 p-4 text-sm whitespace-pre-wrap">
                        {selectedChapter.editedContent ||
                          selectedChapter.translatedContent ||
                          "번역된 내용이 없습니다."}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="edit">
                  <div>
                    <h4 className="mb-2 font-medium text-gray-700">
                      윤문 편집
                    </h4>
                    <Textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="h-[500px] font-mono text-sm"
                      placeholder="번역문을 수정하세요..."
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      {editedContent.length.toLocaleString()}자
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex h-96 items-center justify-center">
              <p className="text-gray-500">회차를 선택하세요</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
