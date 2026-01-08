"use client";

import { ArrowLeft, Languages, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { TranslationProgress } from "@/components/translation/progress-monitor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

interface Chapter {
  id: string;
  number: number;
  title: string | null;
  status: string;
  wordCount: number;
}

export default function TranslatePage() {
  const params = useParams();
  const workId = params.id as string;

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const fetchChapters = useCallback(async () => {
    try {
      const response = await fetch(`/api/works/${workId}/chapters`);
      if (response.ok) {
        const data = await response.json();
        setChapters(data);
      }
    } catch (error) {
      console.error("Failed to fetch chapters:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  const pendingChapters = chapters.filter((c) => c.status === "PENDING");

  const toggleChapter = (number: number) => {
    setSelectedChapters((prev) =>
      prev.includes(number)
        ? prev.filter((n) => n !== number)
        : [...prev, number]
    );
  };

  const selectAll = () => {
    if (selectedChapters.length === pendingChapters.length) {
      setSelectedChapters([]);
    } else {
      setSelectedChapters(pendingChapters.map((c) => c.number));
    }
  };

  const handleTranslate = async () => {
    if (selectedChapters.length === 0) {
      toast.error("번역할 회차를 선택해주세요.");
      return;
    }

    setIsStarting(true);

    try {
      const response = await fetch("/api/translation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workId,
          chapterNumbers: selectedChapters.sort((a, b) => a - b),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "번역 시작에 실패했습니다.");
      }

      // 작업 ID 설정 (SSE 연결 시작)
      setActiveJobId(data.jobId);
      toast.success("번역이 시작되었습니다!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "번역 시작에 실패했습니다."
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleTranslationComplete = useCallback(() => {
    setActiveJobId(null);
    setSelectedChapters([]);
    fetchChapters();
    toast.success("모든 번역이 완료되었습니다!");
  }, [fetchChapters]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Badge variant="outline">대기</Badge>;
      case "TRANSLATING":
        return (
          <Badge className="bg-yellow-100 text-yellow-700">번역중</Badge>
        );
      case "TRANSLATED":
        return <Badge className="bg-blue-100 text-blue-700">번역완료</Badge>;
      case "REVIEWING":
        return <Badge className="bg-purple-100 text-purple-700">검토중</Badge>;
      case "EDITED":
        return <Badge className="bg-green-100 text-green-700">윤문완료</Badge>;
      case "APPROVED":
        return <Badge className="bg-emerald-100 text-emerald-700">승인</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/works/${workId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">AI 번역</h1>
          <p className="text-gray-500">Gemini AI를 사용한 자동 번역</p>
        </div>
      </div>

      {/* 번역 진행 모니터 */}
      {activeJobId && (
        <TranslationProgress
          jobId={activeJobId}
          onComplete={handleTranslationComplete}
        />
      )}

      {/* Warning */}
      {!activeJobId && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-4">
            <p className="text-sm text-yellow-800">
              <strong>참고:</strong> 번역 전에 용어집을 먼저 등록하면 더 정확한
              번역이 가능합니다.{" "}
              <Link
                href={`/works/${workId}/glossary`}
                className="underline hover:no-underline"
              >
                용어집 관리하기
              </Link>
            </p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" />
            <p className="mt-2 text-gray-500">회차 목록 불러오는 중...</p>
          </CardContent>
        </Card>
      ) : pendingChapters.length === 0 && !activeJobId ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Languages className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-lg font-medium">
              번역 대기 중인 회차가 없습니다
            </h3>
            <p className="mt-2 text-gray-500">
              {chapters.length === 0
                ? "먼저 회차를 업로드해주세요."
                : "모든 회차가 이미 번역되었습니다."}
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link href={`/works/${workId}/chapters`}>회차 업로드</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        !activeJobId && (
          <>
            {/* Chapter Selection */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>회차 선택</CardTitle>
                  <CardDescription>
                    번역할 회차를 선택하세요 (대기 상태만 선택 가능)
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {selectedChapters.length === pendingChapters.length
                    ? "전체 해제"
                    : "전체 선택"}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] space-y-2 overflow-y-auto">
                  {chapters.map((chapter) => {
                    const isPending = chapter.status === "PENDING";
                    const isSelected = selectedChapters.includes(chapter.number);

                    return (
                      <div
                        key={chapter.id}
                        className={`flex items-center gap-4 rounded-lg border p-3 ${
                          isPending
                            ? "cursor-pointer hover:bg-gray-50"
                            : "opacity-50"
                        }`}
                        onClick={() => isPending && toggleChapter(chapter.number)}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={!isPending}
                          onCheckedChange={() =>
                            isPending && toggleChapter(chapter.number)
                          }
                        />
                        <div className="flex-1">
                          <span className="font-medium">{chapter.number}화</span>
                          {chapter.title && (
                            <span className="ml-2 text-gray-500">
                              {chapter.title}
                            </span>
                          )}
                        </div>
                        <span className="text-sm text-gray-500">
                          {chapter.wordCount.toLocaleString()}자
                        </span>
                        {getStatusBadge(chapter.status)}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {selectedChapters.length}개 회차 선택됨
              </p>
              <Button
                onClick={handleTranslate}
                disabled={isStarting || selectedChapters.length === 0}
              >
                {isStarting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    시작 중...
                  </>
                ) : (
                  <>
                    <Languages className="mr-2 h-4 w-4" />
                    {selectedChapters.length}개 회차 번역 시작
                  </>
                )}
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
}
