import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { processBibleBatch } from "@/lib/bible-batch-processor";

// Vercel 서버리스 함수 타임아웃 확장
export const maxDuration = 300;

// 매 분 Vercel Cron에서 호출 — PENDING/IN_PROGRESS 작업 1건의 다음 배치를 처리
export async function GET() {
  const cronSecret = process.env.CRON_SECRET;
  // CRON_SECRET이 설정되어 있지 않으면 인증 건너뛰기 (Vercel이 자체 보호)

  try {
    // 1. 처리할 작업 찾기 (잠금 안 걸렸거나 잠금 만료된 것)
    const lockExpiry = new Date(Date.now() - 5 * 60 * 1000); // 5분 잠금 만료
    const job = await db.bibleGenerationJob.findFirst({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: lockExpiry } },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    if (!job) {
      return NextResponse.json({ message: "처리할 작업 없음" });
    }

    // 2. 낙관적 잠금
    const lockId = `cron-${Date.now()}`;
    const locked = await db.bibleGenerationJob.updateMany({
      where: {
        id: job.id,
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: lockExpiry } },
        ],
      },
      data: {
        lockedAt: new Date(),
        lockedBy: lockId,
        status: "IN_PROGRESS",
      },
    });

    if (locked.count === 0) {
      return NextResponse.json({ message: "잠금 획득 실패 (다른 워커가 처리 중)" });
    }

    // 3. 배치 계획에서 현재 처리할 배치 가져오기
    const batchPlan = job.batchPlan as number[][];
    if (!batchPlan || job.currentBatchIndex >= batchPlan.length) {
      // 모든 배치 완료
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
      return NextResponse.json({ message: "작업 완료", jobId: job.id });
    }

    const chapterNumbers = batchPlan[job.currentBatchIndex];

    // 4. 작품 정보 조회
    const work = await db.work.findUnique({
      where: { id: job.workId },
      select: {
        titleKo: true,
        genres: true,
        synopsis: true,
        sourceLanguage: true,
        settingBible: {
          select: { id: true, analyzedChapters: true },
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
      return NextResponse.json({ error: "작품 없음" }, { status: 404 });
    }

    // 5. 배치 처리
    try {
      const result = await processBibleBatch(
        job.workId,
        work.settingBible.id,
        chapterNumbers,
        {
          title: work.titleKo,
          genres: work.genres,
          synopsis: work.synopsis,
          sourceLanguage: work.sourceLanguage,
        },
        work.settingBible.analyzedChapters
      );

      const nextBatchIndex = job.currentBatchIndex + 1;
      const isComplete = nextBatchIndex >= batchPlan.length;

      // 6. 진행률 업데이트
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: {
          currentBatchIndex: nextBatchIndex,
          analyzedChapters: result.analyzedChapters,
          status: isComplete ? "COMPLETED" : "IN_PROGRESS",
          completedAt: isComplete ? new Date() : null,
          lastError: null,
          retryCount: 0,
          lockedAt: null,
          lockedBy: null,
        },
      });

      // 완료 시 work 상태 업데이트
      if (isComplete) {
        await db.work.update({
          where: { id: job.workId },
          data: { status: "BIBLE_DRAFT" },
        });
      }

      return NextResponse.json({
        jobId: job.id,
        batch: `${nextBatchIndex}/${batchPlan.length}`,
        analyzedChapters: result.analyzedChapters,
        complete: isComplete,
      });
    } catch (batchError) {
      // 배치 처리 실패 — 재시도 카운트 증가
      const newRetryCount = job.retryCount + 1;
      const isFailed = newRetryCount >= job.maxRetries;

      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: {
          retryCount: newRetryCount,
          lastError: batchError instanceof Error ? batchError.message : "알 수 없는 오류",
          status: isFailed ? "FAILED" : "IN_PROGRESS",
          errorMessage: isFailed
            ? `최대 재시도 횟수(${job.maxRetries})를 초과했습니다.`
            : null,
          lockedAt: null,
          lockedBy: null,
        },
      });

      console.error("[Cron Bible] 배치 처리 실패:", batchError);
      return NextResponse.json({
        error: "배치 처리 실패",
        retry: newRetryCount,
        maxRetries: job.maxRetries,
      }, { status: 500 });
    }
  } catch (error) {
    console.error("[Cron Bible] 오류:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "내부 오류" },
      { status: 500 }
    );
  }
}
