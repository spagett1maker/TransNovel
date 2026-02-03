import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import { processBibleBatch } from "@/lib/bible-batch-processor";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// 병렬 처리할 배치 수 (AI 호출을 병렬로 실행하여 처리 속도 향상)
// 2개 병렬로 DB 쓰기 충돌 최소화하면서 속도 2배 향상
const PARALLEL_BATCH_COUNT = 2;
// 잠금 만료 시간 (10분) - AI 응답 지연 시에도 충분한 여유
const LOCK_STALE_MS = 10 * 60 * 1000;

// 잠금 해제 헬퍼 (에러 무시)
async function releaseLock(jobId: string) {
  try {
    await db.bibleGenerationJob.update({
      where: { id: jobId },
      data: { lockedAt: null, lockedBy: null },
    });
  } catch {
    // 잠금 해제 실패는 무시 (10분 후 자동 만료)
  }
}

// batchPlan에서 특정 범위의 배치만 추출 (메모리 최적화)
function extractBatches(batchPlan: number[][], startIndex: number, count: number): number[][] {
  return batchPlan.slice(startIndex, startIndex + count);
}

// GET /api/cron/bible-generation — Vercel Cron에 의해 매 분 호출
export async function GET(req: Request) {
  // Vercel Cron 인증 검증
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instanceId = randomUUID();
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LOCK_STALE_MS);

  // 잠금 획득한 job ID (예외 발생 시 해제용)
  let lockedJobId: string | null = null;

  try {
    // 원자적 잠금 획득: findFirst + updateMany 대신 한 번에 처리
    // Race condition 방지를 위해 updateMany로 직접 잠금 시도
    const lockResult = await db.bibleGenerationJob.updateMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: staleThreshold } },
        ],
      },
      data: {
        lockedAt: now,
        lockedBy: instanceId,
      },
    });

    if (lockResult.count === 0) {
      return NextResponse.json({ message: "No pending jobs or all locked" });
    }

    // 잠금 획득한 job 조회 (lockedBy로 확인)
    const job = await db.bibleGenerationJob.findFirst({
      where: {
        lockedBy: instanceId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      select: {
        id: true,
        workId: true,
        status: true,
        batchPlan: true, // 필요한 배치만 추출할 예정
        totalBatches: true,
        currentBatchIndex: true,
        analyzedChapters: true,
        retryCount: true,
        maxRetries: true,
      },
    });

    if (!job) {
      // 다른 인스턴스가 먼저 가져갔거나 상태 변경됨
      return NextResponse.json({ message: "Job acquired by another instance" });
    }

    lockedJobId = job.id;

    // PENDING → IN_PROGRESS 전환
    if (job.status === "PENDING") {
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "IN_PROGRESS",
          startedAt: now,
        },
      });
      await db.work.update({
        where: { id: job.workId },
        data: { status: "BIBLE_GENERATING" },
      });
    }

    // 작품 메타데이터 조회 (배치 처리에 필요)
    const work = await db.work.findUnique({
      where: { id: job.workId },
      select: {
        titleKo: true,
        genres: true,
        synopsis: true,
        sourceLanguage: true,
        settingBible: {
          select: { id: true },
        },
      },
    });

    if (!work || !work.settingBible) {
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorMessage: "작품 또는 설정집을 찾을 수 없습니다.",
          lockedAt: null,
          lockedBy: null,
        },
      });
      lockedJobId = null;
      return NextResponse.json({ error: "Work or bible not found" });
    }

    // 현재 처리할 배치만 추출 (메모리 최적화)
    const fullBatchPlan = job.batchPlan as number[][];

    // batchPlan 유효성 검증
    if (!Array.isArray(fullBatchPlan) || fullBatchPlan.length === 0) {
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorMessage: "배치 계획이 비어있거나 유효하지 않습니다.",
          lockedAt: null,
          lockedBy: null,
        },
      });
      lockedJobId = null;
      return NextResponse.json({ error: "Invalid batch plan" });
    }

    const batchesToProcess = extractBatches(
      fullBatchPlan,
      job.currentBatchIndex,
      PARALLEL_BATCH_COUNT
    );

    // 처리할 배치가 없으면 완료 처리
    if (batchesToProcess.length === 0) {
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
      lockedJobId = null;
      return NextResponse.json({ message: "Job already completed", jobId: job.id });
    }

    const workInfo = {
      title: work.titleKo,
      genres: work.genres,
      synopsis: work.synopsis,
      sourceLanguage: work.sourceLanguage,
    };

    let currentIndex = job.currentBatchIndex;
    let analyzedChapters = job.analyzedChapters;
    let retryCount = job.retryCount;

    // 취소 여부 확인 (병렬 처리 전 1회만)
    const freshJob = await db.bibleGenerationJob.findUnique({
      where: { id: job.id },
      select: { status: true },
    });

    if (!freshJob || freshJob.status === "CANCELLED") {
      await releaseLock(job.id);
      lockedJobId = null;
      return NextResponse.json({ message: "Job cancelled" });
    }

    // 배치 병렬 처리 (AI 호출 병목 해소)
    const batchResults = await Promise.allSettled(
      batchesToProcess.map((chapterNumbers, idx) =>
        processBibleBatch(
          job.workId,
          work.settingBible.id,
          chapterNumbers,
          workInfo,
          analyzedChapters
        ).then((result) => ({ idx, result, chapterNumbers }))
      )
    );

    // 결과 처리
    let successCount = 0;
    let lastError: string | null = null;
    let maxAnalyzedChapters = analyzedChapters;

    for (const batchResult of batchResults) {
      if (batchResult.status === "fulfilled") {
        successCount++;
        maxAnalyzedChapters = Math.max(
          maxAnalyzedChapters,
          batchResult.value.result.analyzedChapters
        );
      } else {
        lastError = batchResult.reason instanceof Error
          ? batchResult.reason.message
          : String(batchResult.reason);
      }
    }

    currentIndex += successCount;
    analyzedChapters = maxAnalyzedChapters;
    const processedCount = successCount;

    // 일부 또는 전체 성공 시 진행 상황 업데이트
    if (successCount > 0) {
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: {
          currentBatchIndex: currentIndex,
          analyzedChapters,
          retryCount: 0,
          lastError: null,
          lockedAt: new Date(),
        },
      });
      retryCount = 0;
    }

    // 일부 실패 시 에러 처리 (다음 cron에서 재시도)
    if (lastError && successCount < batchesToProcess.length) {
      retryCount++;

      if (retryCount >= job.maxRetries) {
        await db.bibleGenerationJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            errorMessage: `배치 처리 실패 (${job.maxRetries}회 재시도 후): ${lastError}`,
            lastError,
            retryCount,
            lockedAt: null,
            lockedBy: null,
          },
        });
        lockedJobId = null;
        return NextResponse.json({
          error: "Job failed after max retries",
          jobId: job.id,
          processedBatches: successCount,
        });
      }

      // 성공한 배치가 없으면 재시도 카운트 증가
      if (successCount === 0) {
        await db.bibleGenerationJob.update({
          where: { id: job.id },
          data: {
            retryCount,
            lastError,
            lockedAt: null,
            lockedBy: null,
          },
        });
        lockedJobId = null;
        return NextResponse.json({
          message: `All batches failed, will retry (${retryCount}/${job.maxRetries})`,
          jobId: job.id,
          error: lastError,
        });
      }
    }

    // 완료 체크
    if (currentIndex >= job.totalBatches) {
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
    } else {
      // 잠금 해제
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: {
          lockedAt: null,
          lockedBy: null,
        },
      });
    }
    lockedJobId = null;

    return NextResponse.json({
      message: "OK",
      jobId: job.id,
      processedBatches: processedCount,
      currentBatchIndex: currentIndex,
      totalBatches: job.totalBatches,
      completed: currentIndex >= job.totalBatches,
    });
  } catch (error) {
    console.error("[Cron] Bible generation error:", error);

    if (lockedJobId) {
      await releaseLock(lockedJobId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron execution failed" },
      { status: 500 }
    );
  }
}
