import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  translationManager,
  type ProgressEvent,
} from "@/lib/translation-manager";

export const dynamic = "force-dynamic";

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

  const job = translationManager.getJob(jobId);
  if (!job) {
    console.log("[SSE Stream] 작업을 찾을 수 없음:", jobId);
    return new Response("Job not found", { status: 404 });
  }
  console.log("[SSE Stream] 작업 조회 성공:", { status: job.status, chapters: job.chapters.length });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      console.log("[SSE Stream] 스트림 시작");
      // 현재 상태 전송
      const currentState: ProgressEvent = {
        jobId,
        type:
          job.status === "COMPLETED"
            ? "job_completed"
            : job.status === "FAILED"
              ? "job_failed"
              : "job_started",
        data: {
          status: job.status,
          completedChapters: job.completedChapters,
          totalChapters: job.totalChapters,
          chapters: job.chapters,
        },
      };
      console.log("[SSE Stream] 초기 상태 전송:", currentState.type);
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(currentState)}\n\n`)
      );

      // 이미 완료된 작업이면 스트림 종료
      if (job.status === "COMPLETED" || job.status === "FAILED") {
        console.log("[SSE Stream] 작업 이미 완료됨, 스트림 종료");
        controller.close();
        return;
      }

      // 진행 이벤트 구독
      console.log("[SSE Stream] 이벤트 구독 시작");
      const unsubscribe = translationManager.subscribe(
        jobId,
        (event: ProgressEvent) => {
          try {
            console.log("[SSE Stream] 이벤트 수신:", event.type);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );

            // 완료 또는 실패 시 스트림 종료
            if (
              event.type === "job_completed" ||
              event.type === "job_failed"
            ) {
              console.log("[SSE Stream] 작업 종료 이벤트, 스트림 닫기");
              setTimeout(() => {
                unsubscribe();
                controller.close();
              }, 100);
            }
          } catch (error) {
            // 스트림이 이미 닫힌 경우
            console.error("[SSE Stream] 이벤트 전송 오류:", error);
            unsubscribe();
          }
        }
      );

      // 클라이언트 연결 종료 시 정리
      req.signal.addEventListener("abort", () => {
        console.log("[SSE Stream] 클라이언트 연결 종료");
        unsubscribe();
        try {
          controller.close();
        } catch {
          // 이미 닫힌 경우 무시
        }
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
