import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  translationManager,
  type ProgressEvent,
} from "@/lib/translation-manager";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return new Response("Missing jobId", { status: 400 });
  }

  const job = translationManager.getJob(jobId);
  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
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
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(currentState)}\n\n`)
      );

      // 이미 완료된 작업이면 스트림 종료
      if (job.status === "COMPLETED" || job.status === "FAILED") {
        controller.close();
        return;
      }

      // 진행 이벤트 구독
      const unsubscribe = translationManager.subscribe(
        jobId,
        (event: ProgressEvent) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );

            // 완료 또는 실패 시 스트림 종료
            if (
              event.type === "job_completed" ||
              event.type === "job_failed"
            ) {
              setTimeout(() => {
                unsubscribe();
                controller.close();
              }, 100);
            }
          } catch {
            // 스트림이 이미 닫힌 경우
            unsubscribe();
          }
        }
      );

      // 클라이언트 연결 종료 시 정리
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          // 이미 닫힌 경우 무시
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
