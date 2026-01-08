"use client";

import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface ChapterProgress {
  number: number;
  status: "PENDING" | "TRANSLATING" | "COMPLETED" | "FAILED";
  currentChunk: number;
  totalChunks: number;
  error?: string;
}

interface ProgressEvent {
  jobId: string;
  type:
    | "job_started"
    | "chapter_started"
    | "chunk_progress"
    | "chapter_completed"
    | "chapter_failed"
    | "job_completed"
    | "job_failed";
  data: {
    status?: string;
    completedChapters?: number;
    totalChapters?: number;
    chapterNumber?: number;
    currentChunk?: number;
    totalChunks?: number;
    error?: string;
    chapters?: ChapterProgress[];
  };
}

interface TranslationProgressProps {
  jobId: string;
  onComplete: () => void;
}

export function TranslationProgress({
  jobId,
  onComplete,
}: TranslationProgressProps) {
  const [chapters, setChapters] = useState<ChapterProgress[]>([]);
  const [completedChapters, setCompletedChapters] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const [status, setStatus] = useState<string>("PENDING");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(
      `/api/translation/stream?jobId=${jobId}`
    );

    eventSource.onmessage = (event) => {
      try {
        const data: ProgressEvent = JSON.parse(event.data);

        switch (data.type) {
          case "job_started":
            setStatus("IN_PROGRESS");
            if (data.data.totalChapters) {
              setTotalChapters(data.data.totalChapters);
            }
            if (data.data.chapters) {
              setChapters(data.data.chapters);
            }
            break;

          case "chapter_started":
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? {
                      ...ch,
                      status: "TRANSLATING",
                      totalChunks: data.data.totalChunks || 0,
                      currentChunk: 0,
                    }
                  : ch
              )
            );
            break;

          case "chunk_progress":
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? {
                      ...ch,
                      currentChunk: data.data.currentChunk || 0,
                      totalChunks: data.data.totalChunks || 0,
                    }
                  : ch
              )
            );
            break;

          case "chapter_completed":
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? { ...ch, status: "COMPLETED" }
                  : ch
              )
            );
            setCompletedChapters(data.data.completedChapters || 0);
            break;

          case "chapter_failed":
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? { ...ch, status: "FAILED", error: data.data.error }
                  : ch
              )
            );
            break;

          case "job_completed":
            setStatus("COMPLETED");
            setCompletedChapters(data.data.completedChapters || 0);
            setTimeout(() => {
              eventSource.close();
              onComplete();
            }, 1000);
            break;

          case "job_failed":
            setStatus("FAILED");
            setError(data.data.error || "알 수 없는 오류가 발생했습니다.");
            eventSource.close();
            break;
        }
      } catch (e) {
        console.error("Failed to parse SSE event:", e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [jobId, onComplete]);

  const overallProgress =
    totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0;

  const currentChapter = chapters.find((ch) => ch.status === "TRANSLATING");
  const chunkProgress =
    currentChapter && currentChapter.totalChunks > 0
      ? (currentChapter.currentChunk / currentChapter.totalChunks) * 100
      : 0;

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {status === "COMPLETED" ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : status === "FAILED" ? (
            <XCircle className="h-5 w-5 text-red-500" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          )}
          번역 진행 상황
        </CardTitle>
        <CardDescription>
          {status === "COMPLETED"
            ? "번역이 완료되었습니다!"
            : status === "FAILED"
              ? "번역 중 오류가 발생했습니다."
              : "번역이 진행 중입니다..."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 전체 진행률 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">전체 진행률</span>
            <span>
              {completedChapters} / {totalChapters} 회차
            </span>
          </div>
          <Progress value={overallProgress} className="h-3" />
        </div>

        {/* 현재 챕터 진행률 */}
        {currentChapter && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                {currentChapter.number}화 번역 중...
              </span>
              <span className="text-gray-500">
                청크 {currentChapter.currentChunk} / {currentChapter.totalChunks}
              </span>
            </div>
            <Progress value={chunkProgress} className="h-2" />
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className="rounded-md bg-red-100 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 챕터별 상태 */}
        <div className="space-y-2">
          <span className="text-sm font-medium">회차별 상태</span>
          <div className="flex flex-wrap gap-2">
            {chapters.map((chapter) => (
              <Badge
                key={chapter.number}
                variant={
                  chapter.status === "COMPLETED"
                    ? "success"
                    : chapter.status === "TRANSLATING"
                      ? "progress"
                      : chapter.status === "FAILED"
                        ? "destructive"
                        : "pending"
                }
              >
                {chapter.status === "COMPLETED" && (
                  <CheckCircle className="mr-1 h-3 w-3" />
                )}
                {chapter.status === "TRANSLATING" && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                )}
                {chapter.status === "FAILED" && (
                  <XCircle className="mr-1 h-3 w-3" />
                )}
                {chapter.number}화
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
