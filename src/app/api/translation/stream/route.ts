import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  translationManager,
  type ProgressEvent,
  type TranslationJobSummary,
} from "@/lib/translation-manager";

export const dynamic = "force-dynamic";

// 폴링 간격 (ms)
const POLL_INTERVAL = 1000;
// Keepalive 간격 (ms)
const KEEPALIVE_INTERVAL = 15000;
// DB 폴링 재시도 설정
const MAX_CONSECUTIVE_POLL_FAILURES = 5;

// DB 쿼리 재시도 래퍼
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 500
): Promise<T | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
    }
  }
  return null;
}

export async function GET(req: Request) {
  console.log("[SSE Stream] GET 요청 수신");
  const session = await getServerSession(authOptions);

  if (!session) {
    console.log("[SSE Stream] 인증 실패");
    return new Response("Unauthorized", { status: 401 });
  }
  console.log("[SSE Stream] 인증 성공:", session.user.email);

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");
  console.log("[SSE Stream] jobId:", jobId);

  if (!jobId) {
    console.log("[SSE Stream] jobId 누락");
    return new Response("Missing jobId", { status: 400 });
  }

  // DB에서 작업 조회 (async)
  const job = await translationManager.getJob(jobId);
  if (!job) {
    console.log("[SSE Stream] 작업을 찾을 수 없음:", jobId);
    return new Response("Job not found", { status: 404 });
  }
  console.log("[SSE Stream] 작업 조회 성공:", { status: job.status, chapters: job.chapters.length });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const timestamp = () => new Date().toISOString();
      console.log(`[${timestamp()}] [SSE Stream] 스트림 시작`);

      let isStreamClosed = false;
      let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
      let pollInterval: ReturnType<typeof setInterval> | null = null;

      // 이전 상태 추적
      let prevState: TranslationJobSummary | null = null;

      // Keepalive 핑 전송
      keepaliveInterval = setInterval(() => {
        if (!isStreamClosed) {
          try {
            controller.enqueue(encoder.encode(`: keepalive\n\n`));
          } catch (error) {
            console.error(`[${timestamp()}] [SSE Stream] Keepalive 전송 실패:`, error);
          }
        }
      }, KEEPALIVE_INTERVAL);

      // 이벤트 전송 헬퍼
      const sendEvent = (event: ProgressEvent) => {
        if (isStreamClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch (error) {
          console.error(`[${timestamp()}] [SSE Stream] 이벤트 전송 실패:`, error);
        }
      };

      // 정리 함수
      const cleanup = () => {
        if (!isStreamClosed) {
          isStreamClosed = true;
          if (keepaliveInterval) {
            clearInterval(keepaliveInterval);
            keepaliveInterval = null;
          }
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          try {
            controller.close();
          } catch {
            // 이미 닫힌 경우 무시
          }
        }
      };

      // 현재 상태 전송 (초기)
      const jobSummary = await translationManager.getJobSummary(jobId);
      if (jobSummary) {
        prevState = jobSummary;
        const currentState: ProgressEvent = {
          jobId,
          type:
            jobSummary.status === "COMPLETED"
              ? "job_completed"
              : jobSummary.status === "FAILED"
                ? "job_failed"
                : "job_started",
          data: {
            status: jobSummary.status,
            workTitle: jobSummary.workTitle,
            completedChapters: jobSummary.completedChapters,
            totalChapters: jobSummary.totalChapters,
            failedChapters: jobSummary.failedChapters,
            currentChapter: jobSummary.currentChapter,
          },
        };
        console.log(`[${timestamp()}] [SSE Stream] 초기 상태 전송:`, currentState.type);
        sendEvent(currentState);

        // 이미 완료된 작업이면 스트림 종료
        if (jobSummary.status === "COMPLETED" || jobSummary.status === "FAILED") {
          console.log(`[${timestamp()}] [SSE Stream] 작업 이미 완료됨, 스트림 종료`);
          cleanup();
          return;
        }
      }

      // DB 폴링으로 상태 변화 감지
      console.log(`[${timestamp()}] [SSE Stream] DB 폴링 시작`);
      let consecutiveFailures = 0;

      pollInterval = setInterval(async () => {
        if (isStreamClosed) return;

        try {
          // 재시도 로직을 적용한 DB 조회
          const currentSummary = await withRetry(
            () => translationManager.getJobSummary(jobId),
            3,
            500
          );

          // 재시도 성공 시 실패 카운터 리셋
          consecutiveFailures = 0;

          if (!currentSummary) {
            // 작업이 삭제됨
            console.log(`[${timestamp()}] [SSE Stream] 작업 삭제됨, 스트림 종료`);
            sendEvent({
              jobId,
              type: "job_failed",
              data: { error: "작업이 삭제되었습니다" },
            });
            cleanup();
            return;
          }

          // 상태 변화 감지 및 이벤트 발송
          if (prevState) {
            // 상태 변경
            if (currentSummary.status !== prevState.status) {
              if (currentSummary.status === "COMPLETED") {
                sendEvent({
                  jobId,
                  type: "job_completed",
                  data: {
                    status: currentSummary.status,
                    completedChapters: currentSummary.completedChapters,
                    totalChapters: currentSummary.totalChapters,
                  },
                });
                cleanup();
                return;
              } else if (currentSummary.status === "FAILED") {
                sendEvent({
                  jobId,
                  type: "job_failed",
                  data: {
                    status: currentSummary.status,
                    error: currentSummary.error,
                  },
                });
                cleanup();
                return;
              } else if (currentSummary.status === "PAUSED") {
                sendEvent({
                  jobId,
                  type: "job_paused",
                  data: {
                    status: currentSummary.status,
                    completedChapters: currentSummary.completedChapters,
                    totalChapters: currentSummary.totalChapters,
                  },
                });
              }
            }

            // 완료된 챕터 수 변경
            if (currentSummary.completedChapters !== prevState.completedChapters) {
              sendEvent({
                jobId,
                type: "chapter_completed",
                data: {
                  completedChapters: currentSummary.completedChapters,
                  totalChapters: currentSummary.totalChapters,
                },
              });
            }

            // 실패한 챕터 수 변경
            if (currentSummary.failedChapters !== prevState.failedChapters) {
              sendEvent({
                jobId,
                type: "chapter_failed",
                data: {
                  failedChapters: currentSummary.failedChapters,
                },
              });
            }

            // 현재 챕터 변경 (새 챕터 시작)
            if (
              currentSummary.currentChapter &&
              (!prevState.currentChapter ||
                currentSummary.currentChapter.number !== prevState.currentChapter.number)
            ) {
              sendEvent({
                jobId,
                type: "chapter_started",
                data: {
                  chapterNumber: currentSummary.currentChapter.number,
                  totalChunks: currentSummary.currentChapter.totalChunks,
                },
              });
            }

            // 청크 진행률 변경
            if (
              currentSummary.currentChapter &&
              prevState.currentChapter &&
              currentSummary.currentChapter.number === prevState.currentChapter.number &&
              currentSummary.currentChapter.currentChunk !== prevState.currentChapter.currentChunk
            ) {
              sendEvent({
                jobId,
                type: "chunk_progress",
                data: {
                  chapterNumber: currentSummary.currentChapter.number,
                  currentChunk: currentSummary.currentChapter.currentChunk,
                  totalChunks: currentSummary.currentChapter.totalChunks,
                },
              });
            }
          }

          prevState = currentSummary;
        } catch (error) {
          consecutiveFailures++;
          console.error(
            `[${timestamp()}] [SSE Stream] 폴링 오류 (${consecutiveFailures}/${MAX_CONSECUTIVE_POLL_FAILURES}):`,
            error
          );

          // 연속 실패가 임계값을 초과하면 스트림 종료
          if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
            console.error(
              `[${timestamp()}] [SSE Stream] 연속 ${MAX_CONSECUTIVE_POLL_FAILURES}회 폴링 실패, 스트림 종료`
            );
            sendEvent({
              jobId,
              type: "job_failed",
              data: {
                error: "서버 연결이 불안정합니다. 페이지를 새로고침해주세요.",
              },
            });
            cleanup();
          }
        }
      }, POLL_INTERVAL);

      // 클라이언트 연결 종료 시 정리
      req.signal.addEventListener("abort", () => {
        console.log(`[${timestamp()}] [SSE Stream] 클라이언트 연결 종료`);
        cleanup();
      });
    },
  });

  console.log("[SSE Stream] 스트림 응답 반환");
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
