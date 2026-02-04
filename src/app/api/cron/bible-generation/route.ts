import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import { processBibleBatch } from "@/lib/bible-batch-processor";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// 병렬 처리할 배치 수 (AI 호출을 병렬로 실행하여 처리 속도 향상)
const PARALLEL_BATCH_COUNT = 3;
// 잠금 만료 시간 (10분) - AI 응답 지연 시에도 충분한 여유
const LOCK_STALE_MS = 10 * 60 * 1000;
// 한 번의 Cron 호출에서 처리할 최대 작업 수 (다중 사용자 지원)
const MAX_CONCURRENT_JOBS = 3;

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

// 단일 작업 처리 함수
async function processSingleJob(
  jobId: string,
  instanceId: string
): Promise<{ jobId: string; success: boolean; message: string; processedBatches?: number }> {
  try {
    // 잠금 획득한 job 상세 조회
    const job = await db.bibleGenerationJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        workId: true,
        status: true,
        batchPlan: true,
        totalBatches: true,
        currentBatchIndex: true,
        analyzedChapters: true,
        retryCount: true,
        maxRetries: true,
      },
    });

    if (!job) {
      return { jobId, success: false, message: "Job not found after lock" };
    }

    // PENDING → IN_PROGRESS 전환
    if (job.status === "PENDING") {
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
      await db.work.update({
        where: { id: job.workId },
        data: { status: "BIBLE_GENERATING" },
      });
    }

    // 작품 메타데이터 조회
    const work = await db.work.findUnique({
      where: { id: job.workId },
      select: {
        titleKo: true,
        genres: true,
        synopsis: true,
        sourceLanguage: true,
        settingBible: { select: { id: true } },
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
      return { jobId, success: false, message: "Work or bible not found" };
    }

    const bibleId = work.settingBible.id;
    const fullBatchPlan = job.batchPlan as number[][];

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
      return { jobId, success: false, message: "Invalid batch plan" };
    }

    const batchesToProcess = extractBatches(fullBatchPlan, job.currentBatchIndex, PARALLEL_BATCH_COUNT);

    if (batchesToProcess.length === 0) {
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", completedAt: new Date(), lockedAt: null, lockedBy: null },
      });
      return { jobId, success: true, message: "Job already completed" };
    }

    const workInfo = {
      title: work.titleKo,
      genres: work.genres,
      synopsis: work.synopsis,
      sourceLanguage: work.sourceLanguage,
    };

    // 취소 여부 확인
    const freshJob = await db.bibleGenerationJob.findUnique({
      where: { id: job.id },
      select: { status: true },
    });

    if (!freshJob || freshJob.status === "CANCELLED") {
      await releaseLock(job.id);
      return { jobId, success: false, message: "Job cancelled" };
    }

    // 배치 병렬 처리
    const batchResults = await Promise.allSettled(
      batchesToProcess.map((chapterNumbers) =>
        processBibleBatch(job.workId, bibleId, chapterNumbers, workInfo, job.analyzedChapters)
      )
    );

    // 결과 처리
    let successCount = 0;
    let lastError: string | null = null;
    let maxAnalyzedChapters = job.analyzedChapters;

    for (const batchResult of batchResults) {
      if (batchResult.status === "fulfilled") {
        successCount++;
        maxAnalyzedChapters = Math.max(maxAnalyzedChapters, batchResult.value.analyzedChapters);
      } else {
        lastError = batchResult.reason instanceof Error ? batchResult.reason.message : String(batchResult.reason);
      }
    }

    const currentIndex = job.currentBatchIndex + successCount;
    const analyzedChapters = maxAnalyzedChapters;
    let retryCount = job.retryCount;

    // 일부 또는 전체 성공 시 진행 상황 업데이트
    if (successCount > 0) {
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: { currentBatchIndex: currentIndex, analyzedChapters, retryCount: 0, lastError: null, lockedAt: new Date() },
      });
      retryCount = 0;
    }

    // 일부 실패 시 에러 처리
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
        return { jobId, success: false, message: "Job failed after max retries", processedBatches: successCount };
      }

      if (successCount === 0) {
        await db.bibleGenerationJob.update({
          where: { id: job.id },
          data: { retryCount, lastError, lockedAt: null, lockedBy: null },
        });
        return { jobId, success: false, message: `Will retry (${retryCount}/${job.maxRetries})` };
      }
    }

    // 완료 체크
    if (currentIndex >= job.totalBatches) {
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: { status: "COMPLETED", completedAt: new Date(), lockedAt: null, lockedBy: null },
      });
    } else {
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: { lockedAt: null, lockedBy: null },
      });
    }

    return {
      jobId,
      success: true,
      message: currentIndex >= job.totalBatches ? "completed" : "in_progress",
      processedBatches: successCount,
    };
  } catch (error) {
    await releaseLock(jobId);
    throw error;
  }
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

  const lockedJobIds: string[] = [];

  try {
    // 여러 작업을 동시에 획득 (최대 MAX_CONCURRENT_JOBS개)
    for (let i = 0; i < MAX_CONCURRENT_JOBS; i++) {
      const candidateJob = await db.bibleGenerationJob.findFirst({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS"] },
          OR: [{ lockedAt: null }, { lockedAt: { lt: staleThreshold } }],
          id: { notIn: lockedJobIds }, // 이미 획득한 작업 제외
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });

      if (!candidateJob) break;

      // 원자적 잠금 시도
      const lockResult = await db.bibleGenerationJob.updateMany({
        where: {
          id: candidateJob.id,
          status: { in: ["PENDING", "IN_PROGRESS"] },
          OR: [{ lockedAt: null }, { lockedAt: { lt: staleThreshold } }],
        },
        data: { lockedAt: now, lockedBy: instanceId },
      });

      if (lockResult.count > 0) {
        lockedJobIds.push(candidateJob.id);
      }
    }

    if (lockedJobIds.length === 0) {
      return NextResponse.json({ message: "No pending jobs or all locked" });
    }

    console.log(`[Cron Bible] 작업 ${lockedJobIds.length}개 획득:`, lockedJobIds);

    // 모든 작업 병렬 처리
    const results = await Promise.allSettled(
      lockedJobIds.map((jobId) => processSingleJob(jobId, instanceId))
    );

    // 결과 집계
    const summary = results.map((r, i) => {
      if (r.status === "fulfilled") {
        return r.value;
      } else {
        return { jobId: lockedJobIds[i], success: false, message: String(r.reason) };
      }
    });

    const successCount = summary.filter((s) => s.success).length;

    return NextResponse.json({
      message: "OK",
      totalJobs: lockedJobIds.length,
      successCount,
      results: summary,
    });
  } catch (error) {
    console.error("[Cron] Bible generation error:", error);

    // 모든 잠금 해제
    for (const jobId of lockedJobIds) {
      await releaseLock(jobId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron execution failed" },
      { status: 500 }
    );
  }
}
