"use client";

import { AlertTriangle, CheckCircle, Loader2, XCircle } from "lucide-react";
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

interface ChunkError {
  index: number;
  error: string;
}

interface ChapterProgress {
  number: number;
  status: "PENDING" | "TRANSLATING" | "COMPLETED" | "PARTIAL" | "FAILED";
  currentChunk: number;
  totalChunks: number;
  error?: string;
  failedChunks?: ChunkError[];
}

interface ProgressEvent {
  jobId: string;
  type:
    | "job_started"
    | "chapter_started"
    | "chunk_progress"
    | "chunk_error"
    | "chapter_completed"
    | "chapter_partial"
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
    chunkIndex?: number;
    failedChunks?: number[];
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
    console.log("[ProgressMonitor] SSE 연결 시작:", jobId);
    const eventSource = new EventSource(
      `/api/translation/stream?jobId=${jobId}`
    );

    eventSource.onopen = () => {
      console.log("[ProgressMonitor] SSE 연결 성공");
    };

    eventSource.onmessage = (event) => {
      console.log("[ProgressMonitor] 이벤트 수신:", event.data.substring(0, 100));
      try {
        const data: ProgressEvent = JSON.parse(event.data);
        console.log("[ProgressMonitor] 파싱된 이벤트:", data.type);

        switch (data.type) {
          case "job_started":
            console.log("[ProgressMonitor] 작업 시작됨", data.data);
            setStatus("IN_PROGRESS");
            if (data.data.totalChapters) {
              setTotalChapters(data.data.totalChapters);
            }
            if (data.data.chapters) {
              setChapters(data.data.chapters);
            }
            break;

          case "chapter_started":
            console.log("[ProgressMonitor] 챕터 시작:", data.data.chapterNumber);
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
            console.log("[ProgressMonitor] 청크 진행:", data.data.chapterNumber, data.data.currentChunk, "/", data.data.totalChunks);
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

          case "chunk_error":
            console.log("[ProgressMonitor] 청크 에러:", data.data.chapterNumber, data.data.chunkIndex);
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? {
                      ...ch,
                      failedChunks: [
                        ...(ch.failedChunks || []),
                        { index: data.data.chunkIndex || 0, error: data.data.error || "" },
                      ],
                    }
                  : ch
              )
            );
            break;

          case "chapter_completed":
            console.log("[ProgressMonitor] 챕터 완료:", data.data.chapterNumber);
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? { ...ch, status: "COMPLETED" }
                  : ch
              )
            );
            setCompletedChapters(data.data.completedChapters || 0);
            break;

          case "chapter_partial":
            console.log("[ProgressMonitor] 챕터 부분완료:", data.data.chapterNumber);
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? {
                      ...ch,
                      status: "PARTIAL",
                      failedChunks: (data.data.failedChunks || []).map((idx) => ({
                        index: idx,
                        error: "번역 실패",
                      })),
                    }
                  : ch
              )
            );
            setCompletedChapters(data.data.completedChapters || 0);
            break;

          case "chapter_failed":
            console.log("[ProgressMonitor] 챕터 실패:", data.data.chapterNumber, data.data.error);
            setChapters((prev) =>
              prev.map((ch) =>
                ch.number === data.data.chapterNumber
                  ? { ...ch, status: "FAILED", error: data.data.error }
                  : ch
              )
            );
            break;

          case "job_completed":
            console.log("[ProgressMonitor] 작업 완료");
            setStatus("COMPLETED");
            setCompletedChapters(data.data.completedChapters || 0);
            setTimeout(() => {
              eventSource.close();
              onComplete();
            }, 1000);
            break;

          case "job_failed":
            console.log("[ProgressMonitor] 작업 실패:", data.data.error);
            setStatus("FAILED");
            setError(data.data.error || "알 수 없는 오류가 발생했습니다.");
            eventSource.close();
            break;
        }
      } catch (e) {
        console.error("Failed to parse SSE event:", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("[ProgressMonitor] SSE 에러:", err);
      console.log("[ProgressMonitor] readyState:", eventSource.readyState);
      // readyState: 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("[ProgressMonitor] SSE 연결 종료됨");
      }
    };

    return () => {
      console.log("[ProgressMonitor] SSE 연결 정리");
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
                    : chapter.status === "PARTIAL"
                      ? "warning"
                      : chapter.status === "TRANSLATING"
                        ? "progress"
                        : chapter.status === "FAILED"
                          ? "destructive"
                          : "pending"
                }
                title={
                  chapter.status === "FAILED" && chapter.error
                    ? chapter.error
                    : chapter.status === "PARTIAL" && chapter.failedChunks
                      ? `${chapter.failedChunks.length}개 청크 번역 실패`
                      : undefined
                }
              >
                {chapter.status === "COMPLETED" && (
                  <CheckCircle className="mr-1 h-3 w-3" />
                )}
                {chapter.status === "PARTIAL" && (
                  <AlertTriangle className="mr-1 h-3 w-3" />
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

        {/* 실패한 청크가 있는 챕터 상세 정보 */}
        {chapters.some((ch) => ch.status === "PARTIAL" || ch.status === "FAILED") && (
          <div className="space-y-2">
            <span className="text-sm font-medium text-red-700">오류 상세</span>
            <div className="space-y-2">
              {chapters
                .filter((ch) => ch.status === "PARTIAL" || ch.status === "FAILED")
                .map((chapter) => (
                  <div
                    key={chapter.number}
                    className="rounded-md bg-red-50 p-3 text-sm"
                  >
                    <div className="font-medium text-red-800">
                      {chapter.number}화
                      {chapter.status === "PARTIAL" && " (부분 번역)"}
                      {chapter.status === "FAILED" && " (실패)"}
                    </div>
                    {chapter.error && (
                      <p className="mt-1 text-red-700">{chapter.error}</p>
                    )}
                    {chapter.failedChunks && chapter.failedChunks.length > 0 && (
                      <p className="mt-1 text-red-600 text-xs">
                        실패한 청크: {chapter.failedChunks.map((f) => `#${f.index + 1}`).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
