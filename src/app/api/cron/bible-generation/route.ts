import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import { processBibleBatch } from "@/lib/bible-batch-processor";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// cron 1회 호출당 최대 배치 수 (배치당 ~40초, 6×40=240초 < maxDuration 300초)
const MAX_BATCHES_PER_INVOCATION = 6;
// 잠금 만료 시간 (5분)
const LOCK_STALE_MS = 5 * 60 * 1000;

// 잠금 해제 헬퍼 (에러 무시)
async function releaseLock(jobId: string) {
  try {
    await db.bibleGenerationJob.update({
      where: { id: jobId },
      data: { lockedAt: null, lockedBy: null },
    });
  } catch {
    // 잠금 해제 실패는 무시 (5분 후 자동 만료)
  }
}

// GET /api/cron/bible-generation — Vercel Cron에 의해 매 분 호출
export async function GET(req: Request) {
  // Vercel Cron 인증 검증
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  console.log("[Cron] Auth debug:", {
    hasAuthHeader: !!authHeader,
    authHeaderPrefix: authHeader?.substring(0, 15),
    hasCronSecret: !!process.env.CRON_SECRET,
    cronSecretLength: process.env.CRON_SECRET?.length,
    match: authHeader === expected,
  });
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instanceId = randomUUID();
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LOCK_STALE_MS);

  // 잠금 획득한 job ID (예외 발생 시 해제용)
  let lockedJobId: string | null = null;

  try {
    // 처리할 작업 찾기: PENDING 또는 IN_PROGRESS이고 잠금 안 된(또는 만료된) 작업
    const job = await db.bibleGenerationJob.findFirst({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: staleThreshold } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    if (!job) {
      return NextResponse.json({ message: "No pending jobs" });
    }

    // 낙관적 잠금 획득
    const lockResult = await db.bibleGenerationJob.updateMany({
      where: {
        id: job.id,
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
      return NextResponse.json({ message: "Job already locked by another instance" });
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
      include: { settingBible: true },
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
      lockedJobId = null; // 이미 해제됨
      return NextResponse.json({ error: "Work or bible not found" });
    }

    const batchPlan = job.batchPlan as number[][];
    const workInfo = {
      title: work.titleKo,
      genres: work.genres,
      synopsis: work.synopsis,
      sourceLanguage: work.sourceLanguage,
    };

    let currentIndex = job.currentBatchIndex;
    let analyzedChapters = job.analyzedChapters;
    let retryCount = job.retryCount; // 로컬 변수로 추적
    let processedCount = 0;

    // 배치 처리 루프
    for (let i = 0; i < MAX_BATCHES_PER_INVOCATION && currentIndex < batchPlan.length; i++) {
      // 취소 여부 확인 (DB에서 최신 상태 재조회)
      const freshJob = await db.bibleGenerationJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      });

      if (!freshJob || freshJob.status === "CANCELLED") {
        break;
      }

      const chapterNumbers = batchPlan[currentIndex];

      try {
        const result = await processBibleBatch(
          job.workId,
          work.settingBible.id,
          chapterNumbers,
          workInfo,
          analyzedChapters
        );

        analyzedChapters = result.analyzedChapters;
        currentIndex++;
        processedCount++;
        retryCount = 0; // 성공 시 리셋

        // 진행 상황 업데이트 + 잠금 갱신 + 재시도 카운트 리셋
        await db.bibleGenerationJob.update({
          where: { id: job.id },
          data: {
            currentBatchIndex: currentIndex,
            analyzedChapters,
            retryCount: 0,
            lastError: null,
            lockedAt: new Date(), // 잠금 갱신
          },
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        retryCount++;

        if (retryCount >= job.maxRetries) {
          // 최대 재시도 초과 → 실패
          await db.bibleGenerationJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              errorMessage: `배치 ${currentIndex + 1}/${batchPlan.length} 처리 실패 (${job.maxRetries}회 재시도 후): ${errorMsg}`,
              lastError: errorMsg,
              retryCount,
              lockedAt: null,
              lockedBy: null,
            },
          });
          lockedJobId = null;
          return NextResponse.json({
            error: "Job failed after max retries",
            jobId: job.id,
            failedBatch: currentIndex,
          });
        }

        // 재시도 남음 → 에러 기록하고 잠금 해제 (다음 cron이 재시도)
        await db.bibleGenerationJob.update({
          where: { id: job.id },
          data: {
            retryCount,
            lastError: errorMsg,
            lockedAt: null,
            lockedBy: null,
          },
        });
        lockedJobId = null;
        return NextResponse.json({
          message: `Batch failed, will retry (${retryCount}/${job.maxRetries})`,
          jobId: job.id,
          error: errorMsg,
        });
      }
    }

    // 완료 체크
    if (currentIndex >= batchPlan.length) {
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
      // 잠금 해제 (다음 cron 호출에서 계속)
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
      totalBatches: batchPlan.length,
      completed: currentIndex >= batchPlan.length,
    });
  } catch (error) {
    console.error("[Cron] Bible generation error:", error);

    // 예외 발생 시 잠금 해제
    if (lockedJobId) {
      await releaseLock(lockedJobId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron execution failed" },
      { status: 500 }
    );
  }
}
