import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { db } from "@/lib/db";
import { processBibleBatch } from "@/lib/bible-batch-processor";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// cron 1회 호출당 최대 배치 수 (배치당 ~30초, 4×30=120초 < maxDuration 300초, 여유분 180초)
const MAX_BATCHES_PER_INVOCATION = 4;
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
      MAX_BATCHES_PER_INVOCATION
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
    let processedCount = 0;

    // 배치 처리 루프
    for (const chapterNumbers of batchesToProcess) {
      // 취소 여부 확인 (DB에서 최신 상태 재조회)
      const freshJob = await db.bibleGenerationJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      });

      if (!freshJob || freshJob.status === "CANCELLED") {
        break;
      }

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
        retryCount = 0;

        // 진행 상황 업데이트 + 잠금 갱신
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
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        retryCount++;

        if (retryCount >= job.maxRetries) {
          await db.bibleGenerationJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              errorMessage: `배치 ${currentIndex + 1}/${job.totalBatches} 처리 실패 (${job.maxRetries}회 재시도 후): ${errorMsg}`,
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

        // 재시도 남음 → 에러 기록하고 잠금 해제
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
