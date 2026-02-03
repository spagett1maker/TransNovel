import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import {
  translateChapter,
  TranslationError,
  TranslationContext,
  translateLargeChapterIncrementally,
  LARGE_CHAPTER_THRESHOLD,
  LargeChapterProgress,
} from "@/lib/gemini";
import { canTransitionWorkStatus } from "@/lib/work-status";
import { WorkStatus } from "@prisma/client";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// 병렬 처리할 챕터 수 (AI 호출을 병렬로 실행하여 처리 속도 향상)
// Gemini Rate Limit: 1500 RPM → 10개/분은 0.7%만 사용
// 평균 2000자 챕터 기준: 10개 × ~25초 = 병렬로 ~30초, maxDuration 300초 내 여유
// 5000회차 기준: 5000 ÷ 10 = 500분 ≈ 8시간
const PARALLEL_CHAPTER_COUNT = 10;
// 잠금 만료 시간 (10분) - AI 응답 지연 시에도 충분한 여유
const LOCK_STALE_MS = 10 * 60 * 1000;

// 타임스탬프 로그 헬퍼
function log(prefix: string, message: string, data?: object) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${prefix} ${message}`, JSON.stringify(data));
  } else {
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }
}

// 잠금 해제 헬퍼 (에러 무시)
async function releaseLock(jobId: string) {
  try {
    await db.activeTranslationJob.update({
      where: { jobId },
      data: { lockedAt: null, lockedBy: null },
    });
  } catch {
    // 잠금 해제 실패는 무시 (10분 후 자동 만료)
  }
}

// 단일 챕터 번역 처리 결과
interface ChapterTranslationResult {
  success: boolean;
  chapterNumber: number;
  partial?: boolean;  // 대형 챕터가 부분 완료된 경우 true
  error?: string;
}

// 단일 챕터 번역 처리
async function translateSingleChapter(
  chapterId: string,
  chapterNumber: number,
  context: TranslationContext
): Promise<ChapterTranslationResult> {
  const chapterStartTime = Date.now();
  log("[Cron Translation]", `챕터 ${chapterNumber} 번역 시작`);

  try {
    // 챕터 원문 및 기존 진행 상태 로드
    const chapter = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { originalContent: true, status: true, translationMeta: true },
    });

    if (!chapter) {
      log("[Cron Translation]", `챕터 ${chapterNumber} DB에서 찾을 수 없음`);
      return { success: false, chapterNumber, error: "챕터를 찾을 수 없습니다" };
    }

    // 이미 번역된 챕터는 스킵
    if (chapter.status === "TRANSLATED" || chapter.status === "EDITED" || chapter.status === "APPROVED") {
      log("[Cron Translation]", `챕터 ${chapterNumber} 이미 번역됨, 스킵`);
      return { success: true, chapterNumber };
    }

    const contentLength = chapter.originalContent.length;

    // 중복 번역 방지: PENDING/TRANSLATING 상태인 경우에만 처리
    const updateResult = await db.chapter.updateMany({
      where: {
        id: chapterId,
        status: { in: ["PENDING", "TRANSLATING"] },
      },
      data: { status: "TRANSLATING" },
    });

    if (updateResult.count === 0) {
      log("[Cron Translation]", `챕터 ${chapterNumber} 이미 다른 작업에서 처리 중`);
      return { success: true, chapterNumber };
    }

    // ========== 대형 챕터 점진적 처리 (설정집 패턴) ==========
    if (contentLength > LARGE_CHAPTER_THRESHOLD) {
      log("[Cron Translation]", `대형 챕터 점진적 처리 시작`, {
        chapterNumber,
        contentLength,
        threshold: LARGE_CHAPTER_THRESHOLD,
      });

      // 기존 진행 상태 파싱
      const existingProgress = chapter.translationMeta as LargeChapterProgress | null;
      if (existingProgress?.isLargeChapter) {
        log("[Cron Translation]", `기존 진행 상태 복원`, {
          processedChunks: existingProgress.processedChunks,
          totalChunks: existingProgress.totalChunks,
        });
      }

      // 점진적 번역 실행 (Cron당 3청크)
      const result = await translateLargeChapterIncrementally(
        chapter.originalContent,
        context,
        existingProgress,
        5 // maxRetries
      );

      if (result.complete) {
        // 모든 청크 완료 → 최종 저장
        await db.chapter.update({
          where: { id: chapterId },
          data: {
            translatedContent: result.translatedContent,
            status: "TRANSLATED",
            translationMeta: Prisma.JsonNull, // 진행 상태 클리어
          },
        });

        const duration = Date.now() - chapterStartTime;
        log("[Cron Translation]", `대형 챕터 ${chapterNumber} 번역 완료`, { duration });

        return { success: true, chapterNumber };
      } else {
        // 아직 남은 청크가 있음 → 진행 상태 저장
        await db.chapter.update({
          where: { id: chapterId },
          data: {
            translationMeta: result.progress as unknown as Prisma.JsonObject,
          },
        });

        log("[Cron Translation]", `대형 챕터 ${chapterNumber} 부분 완료`, {
          processedChunks: result.progress?.processedChunks,
          totalChunks: result.progress?.totalChunks,
        });

        // partial: true → 이 챕터는 다음 Cron에서 계속 처리 필요
        return { success: true, chapterNumber, partial: true };
      }
    }

    // ========== 일반 챕터 (한 번에 처리) ==========
    const translatedContent = await translateChapter(
      chapter.originalContent,
      context,
      5 // maxRetries
    );

    // 번역 결과 저장
    await db.chapter.update({
      where: { id: chapterId },
      data: {
        translatedContent,
        status: "TRANSLATED",
        translationMeta: Prisma.JsonNull,
      },
    });

    const duration = Date.now() - chapterStartTime;
    log("[Cron Translation]", `챕터 ${chapterNumber} 번역 완료`, { duration });

    return { success: true, chapterNumber };

  } catch (error) {
    const errorMessage = error instanceof TranslationError
      ? error.message
      : error instanceof Error
        ? error.message
        : "알 수 없는 오류";

    log("[Cron Translation]", `챕터 ${chapterNumber} 번역 실패`, { error: errorMessage });

    // 상태 되돌리기
    await db.chapter.updateMany({
      where: { id: chapterId, status: "TRANSLATING" },
      data: { status: "PENDING" },
    });

    return { success: false, chapterNumber, error: errorMessage };
  }
}

// GET /api/cron/translation — Vercel Cron에 의해 매 분 호출
export async function GET(req: Request) {
  // Vercel Cron 인증 검증
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instanceId = randomUUID();
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LOCK_STALE_MS);

  let lockedJobId: string | null = null;

  try {
    // 먼저 잠금 가능한 작업 하나를 조회
    const candidateJob = await db.activeTranslationJob.findFirst({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: staleThreshold } },
        ],
      },
      select: { jobId: true },
      orderBy: { startedAt: "asc" }, // 오래된 작업 우선
    });

    if (!candidateJob) {
      return NextResponse.json({ message: "No pending jobs or all locked" });
    }

    // 해당 작업에 대해서만 원자적 잠금 시도
    const lockResult = await db.activeTranslationJob.updateMany({
      where: {
        jobId: candidateJob.jobId,
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
      // 다른 인스턴스가 먼저 잠금을 획득함
      return NextResponse.json({ message: "Job acquired by another instance" });
    }

    // 잠금 획득한 job 상세 조회
    const job = await db.activeTranslationJob.findUnique({
      where: { jobId: candidateJob.jobId },
      select: {
        id: true,
        jobId: true,
        workId: true,
        status: true,
        batchPlan: true,
        totalBatches: true,
        currentBatchIndex: true,
        completedChapters: true,
        failedChapters: true,
        failedChapterNums: true,
        retryCount: true,
        maxRetries: true,
        autoRetryCount: true,
        maxAutoRetries: true,
      },
    });

    if (!job) {
      return NextResponse.json({ message: "Job not found after lock" });
    }

    lockedJobId = job.jobId;
    log("[Cron Translation]", "작업 획득", { jobId: job.jobId, currentBatch: job.currentBatchIndex, totalBatches: job.totalBatches });

    // batchPlan 유효성 검증
    const batchPlan = job.batchPlan as number[][] | null;
    if (!batchPlan || !Array.isArray(batchPlan) || batchPlan.length === 0) {
      await db.activeTranslationJob.update({
        where: { jobId: job.jobId },
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

    // PENDING → IN_PROGRESS 전환
    if (job.status === "PENDING") {
      await db.activeTranslationJob.update({
        where: { jobId: job.jobId },
        data: { status: "IN_PROGRESS", startedAt: now },
      });
      // Work 상태 업데이트
      try {
        const work = await db.work.findUnique({
          where: { id: job.workId },
          select: { status: true },
        });
        if (work && canTransitionWorkStatus(work.status as WorkStatus, "TRANSLATING" as WorkStatus)) {
          await db.work.update({
            where: { id: job.workId },
            data: { status: "TRANSLATING" },
          });
        }
      } catch {
        // 상태 업데이트 실패 무시
      }
    }

    // 작품 및 설정집 정보 조회 (컨텍스트 구성)
    const work = await db.work.findUnique({
      where: { id: job.workId },
      include: {
        glossary: true,
        settingBible: {
          include: {
            characters: true,
          },
        },
      },
    });

    if (!work) {
      await db.activeTranslationJob.update({
        where: { jobId: job.jobId },
        data: {
          status: "FAILED",
          errorMessage: "작품을 찾을 수 없습니다.",
          lockedAt: null,
          lockedBy: null,
        },
      });
      lockedJobId = null;
      return NextResponse.json({ error: "Work not found" });
    }

    // 번역 컨텍스트 생성
    const context: TranslationContext = {
      titleKo: work.titleKo,
      genres: work.genres,
      ageRating: work.ageRating,
      synopsis: work.synopsis,
      glossary: work.glossary.map((g) => ({
        original: g.original,
        translated: g.translated,
      })),
      characters: work.settingBible?.characters.map((c) => ({
        nameOriginal: c.nameOriginal,
        nameKorean: c.nameKorean,
        role: c.role,
        speechStyle: c.speechStyle || undefined,
        personality: c.personality || undefined,
      })),
      translationGuide: work.settingBible?.translationGuide || undefined,
    };

    // ========== 대형 챕터 우선 처리 (설정집 패턴) ==========
    // TRANSLATING 상태이면서 translationMeta에 isLargeChapter가 있는 챕터를 찾아 우선 처리
    const partialChapters = await db.chapter.findMany({
      where: {
        workId: job.workId,
        status: "TRANSLATING",
        translationMeta: { not: Prisma.JsonNull },
      },
      select: { id: true, number: true, translationMeta: true },
      take: PARALLEL_CHAPTER_COUNT, // 한 번에 처리할 최대 수
    });

    // partial 챕터 중 실제로 대형 챕터 진행 중인 것만 필터링
    const largeChaptersInProgress = partialChapters.filter(ch => {
      const meta = ch.translationMeta as LargeChapterProgress | null;
      return meta?.isLargeChapter === true;
    });

    if (largeChaptersInProgress.length > 0) {
      log("[Cron Translation]", `대형 챕터 우선 처리`, {
        count: largeChaptersInProgress.length,
        chapters: largeChaptersInProgress.map(c => c.number),
      });

      // 대형 챕터만 처리 (새 챕터는 다음 Cron에서)
      const partialResults = await Promise.allSettled(
        largeChaptersInProgress.map(ch =>
          translateSingleChapter(ch.id, ch.number, context)
        )
      );

      let completedCount = 0;
      let stillPartialCount = 0;

      for (const result of partialResults) {
        if (result.status === "fulfilled") {
          if (result.value.success && !result.value.partial) {
            completedCount++;
          } else if (result.value.partial) {
            stillPartialCount++;
          }
        }
      }

      log("[Cron Translation]", `대형 챕터 처리 결과`, {
        completedCount,
        stillPartialCount,
      });

      // 진행 상황 업데이트
      if (completedCount > 0) {
        await db.activeTranslationJob.update({
          where: { jobId: job.jobId },
          data: {
            completedChapters: job.completedChapters + completedCount,
            lockedAt: new Date(),
          },
        });
      }

      // 잠금 해제
      await db.activeTranslationJob.update({
        where: { jobId: job.jobId },
        data: { lockedAt: null, lockedBy: null },
      });
      lockedJobId = null;

      return NextResponse.json({
        message: "Large chapters processed",
        jobId: job.jobId,
        completedLargeChapters: completedCount,
        stillInProgress: stillPartialCount,
      });
    }

    // ========== 일반 배치 처리 ==========
    // 현재 처리할 배치 추출
    const batchesToProcess = batchPlan.slice(
      job.currentBatchIndex,
      job.currentBatchIndex + PARALLEL_CHAPTER_COUNT
    );

    if (batchesToProcess.length === 0) {
      // 모든 배치 처리 완료
      await db.activeTranslationJob.update({
        where: { jobId: job.jobId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
      lockedJobId = null;

      // Work 상태 업데이트
      await updateWorkStatusAfterCompletion(job.workId);

      return NextResponse.json({ message: "Job completed", jobId: job.jobId });
    }

    // 취소 여부 확인
    const freshJob = await db.activeTranslationJob.findUnique({
      where: { jobId: job.jobId },
      select: { status: true },
    });

    if (!freshJob || freshJob.status === "CANCELLED") {
      await releaseLock(job.jobId);
      lockedJobId = null;
      return NextResponse.json({ message: "Job cancelled" });
    }

    // 일시정지 확인
    const pauseCheck = await db.activeTranslationJob.findUnique({
      where: { jobId: job.jobId },
      select: { isPauseRequested: true },
    });

    if (pauseCheck?.isPauseRequested) {
      await db.activeTranslationJob.update({
        where: { jobId: job.jobId },
        data: {
          status: "PAUSED",
          isPauseRequested: false,
          lockedAt: null,
          lockedBy: null,
        },
      });
      lockedJobId = null;
      return NextResponse.json({ message: "Job paused" });
    }

    // 챕터 ID 조회 (배치의 챕터 번호로)
    const chapterNumbers = batchesToProcess.flat();
    const chapters = await db.chapter.findMany({
      where: {
        workId: job.workId,
        number: { in: chapterNumbers },
      },
      select: { id: true, number: true },
    });

    const chapterMap = new Map(chapters.map(c => [c.number, c.id]));

    // 배치 병렬 처리
    log("[Cron Translation]", `배치 처리 시작`, {
      currentBatch: job.currentBatchIndex,
      chaptersToProcess: chapterNumbers,
    });

    const batchResults = await Promise.allSettled(
      chapterNumbers.map(chapterNum => {
        const chapterId = chapterMap.get(chapterNum);
        if (!chapterId) {
          return Promise.resolve<ChapterTranslationResult>({
            success: false,
            chapterNumber: chapterNum,
            error: "챕터를 찾을 수 없음",
          });
        }
        return translateSingleChapter(chapterId, chapterNum, context);
      })
    );

    // 결과 처리
    let successCount = 0;     // 완전히 완료된 챕터
    let partialCount = 0;     // 대형 챕터 부분 완료 (다음 Cron에서 계속)
    let failCount = 0;
    let lastError: string | null = null;
    const newFailedChapters: number[] = [...(job.failedChapterNums || [])];

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        if (result.value.success) {
          if (result.value.partial) {
            // 대형 챕터 부분 완료 - 다음 Cron에서 계속 처리
            partialCount++;
          } else {
            // 완전히 완료
            successCount++;
          }
        } else {
          failCount++;
          lastError = result.value.error || "알 수 없는 오류";
          if (!newFailedChapters.includes(result.value.chapterNumber)) {
            newFailedChapters.push(result.value.chapterNumber);
          }
        }
      } else {
        failCount++;
        lastError = result.reason instanceof Error ? result.reason.message : String(result.reason);
      }
    }

    // 배치 인덱스는 모든 챕터(partial 포함)에 대해 전진
    // partial 챕터는 다음 Cron에서 대형 챕터 우선 처리 로직에 의해 계속 처리됨
    const newCurrentBatchIndex = job.currentBatchIndex + batchesToProcess.length;
    // 완료 카운트는 완전히 완료된 챕터만
    const newCompletedChapters = job.completedChapters + successCount;
    const newFailedChaptersCount = job.failedChapters + failCount;

    log("[Cron Translation]", `배치 처리 완료`, {
      successCount,
      partialCount,
      failCount,
      newCurrentBatchIndex,
      totalBatches: job.totalBatches,
    });

    // 진행 상황 업데이트
    if (successCount > 0 || failCount > 0) {
      await db.activeTranslationJob.update({
        where: { jobId: job.jobId },
        data: {
          currentBatchIndex: newCurrentBatchIndex,
          completedChapters: newCompletedChapters,
          failedChapters: newFailedChaptersCount,
          failedChapterNums: newFailedChapters,
          retryCount: failCount > 0 && successCount === 0 ? job.retryCount + 1 : 0,
          lastError: lastError,
          lockedAt: new Date(),
        },
      });
    }

    // 전체 실패 시 재시도 횟수 체크
    if (successCount === 0 && failCount > 0) {
      if (job.retryCount + 1 >= job.maxRetries) {
        await db.activeTranslationJob.update({
          where: { jobId: job.jobId },
          data: {
            status: "FAILED",
            errorMessage: `배치 처리 실패 (${job.maxRetries}회 재시도 후): ${lastError}`,
            lockedAt: null,
            lockedBy: null,
          },
        });
        lockedJobId = null;
        return NextResponse.json({
          error: "Job failed after max retries",
          jobId: job.jobId,
        });
      }
    }

    // 완료 체크
    if (newCurrentBatchIndex >= job.totalBatches) {
      // ========== 자동 실패 복구 (PRD 3.6) ==========
      // 실패한 챕터가 있고 자동 재시도 횟수가 남아있으면 재시도
      const autoRetryCount = job.autoRetryCount ?? 0;
      const maxAutoRetries = job.maxAutoRetries ?? 2;

      if (newFailedChapters.length > 0 && autoRetryCount < maxAutoRetries) {
        log("[Cron Translation]", `자동 실패 복구 시작`, {
          failedChapters: newFailedChapters,
          autoRetryCount: autoRetryCount + 1,
          maxAutoRetries,
        });

        // 실패한 챕터들로 새 배치 계획 생성
        const retryBatchPlan = newFailedChapters.map(num => [num]);

        await db.activeTranslationJob.update({
          where: { jobId: job.jobId },
          data: {
            // 배치 계획을 실패 챕터로 재설정
            batchPlan: retryBatchPlan,
            totalBatches: retryBatchPlan.length,
            currentBatchIndex: 0,
            // 실패 기록 초기화 (재시도니까)
            failedChapterNums: [],
            failedChapters: 0,
            // 자동 재시도 카운트 증가
            autoRetryCount: autoRetryCount + 1,
            lastError: null,
            lockedAt: null,
            lockedBy: null,
          },
        });
        lockedJobId = null;

        return NextResponse.json({
          message: "Auto-retry started for failed chapters",
          jobId: job.jobId,
          retryingChapters: newFailedChapters,
          autoRetryCount: autoRetryCount + 1,
        });
      }

      // 자동 재시도 소진 또는 실패 챕터 없음 → 완료 처리
      await db.activeTranslationJob.update({
        where: { jobId: job.jobId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
      lockedJobId = null;

      // Work 상태 업데이트
      await updateWorkStatusAfterCompletion(job.workId);

      const finalMessage = newFailedChapters.length > 0
        ? `Job completed with ${newFailedChapters.length} failed chapters (after ${autoRetryCount} auto-retries)`
        : "Job completed successfully";

      return NextResponse.json({
        message: finalMessage,
        jobId: job.jobId,
        completedChapters: newCompletedChapters,
        failedChapters: newFailedChapters.length,
        autoRetriesUsed: autoRetryCount,
      });
    }

    // 잠금 해제
    await db.activeTranslationJob.update({
      where: { jobId: job.jobId },
      data: {
        lockedAt: null,
        lockedBy: null,
      },
    });
    lockedJobId = null;

    return NextResponse.json({
      message: "OK",
      jobId: job.jobId,
      processedChapters: successCount + failCount,
      currentBatchIndex: newCurrentBatchIndex,
      totalBatches: job.totalBatches,
    });

  } catch (error) {
    console.error("[Cron Translation] Error:", error);

    if (lockedJobId) {
      await releaseLock(lockedJobId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron execution failed" },
      { status: 500 }
    );
  }
}

// 작업 완료 후 Work 상태 업데이트
async function updateWorkStatusAfterCompletion(workId: string) {
  try {
    const allChapters = await db.chapter.findMany({
      where: { workId },
      select: { status: true },
    });

    const totalCount = allChapters.length;
    const translatedCount = allChapters.filter(
      (ch) => ch.status === "TRANSLATED" || ch.status === "EDITED" || ch.status === "APPROVED"
    ).length;

    if (totalCount > 0 && translatedCount === totalCount) {
      // 모든 챕터 번역 완료
      const work = await db.work.findUnique({
        where: { id: workId },
        select: { status: true },
      });
      if (work && canTransitionWorkStatus(work.status as WorkStatus, "TRANSLATED" as WorkStatus)) {
        await db.work.update({
          where: { id: workId },
          data: { status: "TRANSLATED" },
        });
        log("[Cron Translation]", "작품 상태 업데이트: TRANSLATED");

        // 자동 공고 초안 생성
        await createDraftListing(workId);
      }
    } else if (totalCount > 0) {
      // 부분 번역 완료 - BIBLE_CONFIRMED으로 복원
      const work = await db.work.findUnique({
        where: { id: workId },
        select: { status: true },
      });
      if (work && canTransitionWorkStatus(work.status as WorkStatus, "BIBLE_CONFIRMED" as WorkStatus)) {
        await db.work.update({
          where: { id: workId },
          data: { status: "BIBLE_CONFIRMED" },
        });
        log("[Cron Translation]", "작품 상태 복원: BIBLE_CONFIRMED");
      }
    }
  } catch (error) {
    log("[Cron Translation]", "Work 상태 업데이트 실패", { error: String(error) });
  }
}

// 자동 공고 초안 생성
async function createDraftListing(workId: string) {
  try {
    const existingListing = await db.projectListing.findFirst({
      where: { workId },
    });

    if (existingListing) {
      log("[Cron Translation]", "공고 이미 존재, 스킵");
      return;
    }

    const work = await db.work.findUnique({
      where: { id: workId },
      select: { titleKo: true, authorId: true, synopsis: true, totalChapters: true },
    });

    if (!work) return;

    const hasChapter0 = await db.chapter.findUnique({
      where: { workId_number: { workId, number: 0 } },
      select: { id: true },
    });

    const totalChapters = await db.chapter.count({ where: { workId } });

    await db.projectListing.create({
      data: {
        workId,
        authorId: work.authorId,
        title: `[윤문 요청] ${work.titleKo}`,
        description: work.synopsis || `${work.titleKo} 작품의 윤문을 요청합니다.`,
        status: "DRAFT",
        chapterStart: hasChapter0 ? 0 : 1,
        chapterEnd: work.totalChapters || totalChapters,
      },
    });

    log("[Cron Translation]", `자동 공고 초안 생성 완료: ${work.titleKo}`);
  } catch (error) {
    log("[Cron Translation]", "공고 생성 실패", { error: String(error) });
  }
}
