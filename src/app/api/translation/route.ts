import { getServerSession } from "next-auth";
import { after, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { translateChapter, TranslationError, TranslationContext } from "@/lib/gemini";
import { translationManager } from "@/lib/translation-manager";
import { translationLogger } from "@/lib/translation-logger";
import { canTransitionWorkStatus } from "@/lib/work-status";
import { WorkStatus } from "@prisma/client";

// Vercel Pro: 최대 300초 함수 실행 시간
export const maxDuration = 300;

// 챕터 크기 제한 (안전 마진 포함)
const MAX_CHAPTER_SIZE = 500000; // 50만 자 (약 100KB)
const WARN_CHAPTER_SIZE = 200000; // 20만 자 경고

// 병렬 처리 비활성화
// 이유:
// 1. after()는 300초 타임아웃 → 대규모 번역에 Cron 전환 필요
// 2. chaptersProgress 동시 업데이트 시 race condition 발생
// TODO: 설정집처럼 Cron 기반으로 전환 후 병렬 처리 활성화
const PARALLEL_CHAPTER_COUNT = 1; // 순차 처리 (안전)

// ============================================
// 사용자별 Rate Limiting (DB 기반 — 서버리스 인스턴스 간 공유)
// ============================================
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 60000; // 1분 윈도우

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentJobCount = await db.activeTranslationJob.count({
    where: {
      userId,
      startedAt: { gte: windowStart },
    },
  });

  if (recentJobCount >= RATE_LIMIT_REQUESTS) {
    return { allowed: false, retryAfter: 60 };
  }
  return { allowed: true };
}

// 챕터 크기 검증
function validateChapterSizes(
  chapters: Array<{ number: number; originalContent: string }>
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const chapter of chapters) {
    const size = chapter.originalContent.length;
    if (size > MAX_CHAPTER_SIZE) {
      errors.push(`${chapter.number}화: ${(size / 10000).toFixed(1)}만 자 (최대 ${MAX_CHAPTER_SIZE / 10000}만 자 초과)`);
    } else if (size > WARN_CHAPTER_SIZE) {
      warnings.push(`${chapter.number}화: ${(size / 10000).toFixed(1)}만 자 (처리 시간이 길어질 수 있음)`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// 타임스탬프 로그 헬퍼
function log(prefix: string, message: string, data?: object) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] ${prefix} ${message}`, JSON.stringify(data));
  } else {
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }
}

// 백그라운드 번역 처리 함수 (서버 측 챕터 전체 번역)
// 메모리 최적화: originalContent를 루프 내에서 한 건씩 DB에서 로드
async function processTranslation(
  jobId: string,
  workId: string,
  chapters: Array<{ id: string; number: number }>,
  context: TranslationContext,
  userId: string,
  userEmail?: string
) {
  const jobStartTime = Date.now();

  log("[Translation]", "==================== processTranslation 시작 (챕터 전체 번역) ====================");
  log("[Translation]", "작업 정보", {
    jobId,
    chaptersCount: chapters.length,
    title: context.titleKo,
    chapterNumbers: chapters.map(c => c.number),
  });

  // 로거에 작업 시작 기록
  await translationLogger.logJobStart(
    jobId,
    workId,
    context.titleKo,
    chapters.length,
    userId,
    userEmail
  );

  await translationManager.startJob(jobId);
  log("[Translation]", "작업 시작됨", { jobId });

  // 작품 상태를 TRANSLATING으로 업데이트 (상태 전이 검증)
  try {
    const currentWork = await db.work.findUnique({
      where: { id: workId },
      select: { status: true },
    });
    if (currentWork && canTransitionWorkStatus(currentWork.status as WorkStatus, "TRANSLATING" as WorkStatus)) {
      await db.work.update({
        where: { id: workId },
        data: { status: "TRANSLATING" },
      });
      log("[Translation]", "작품 상태 업데이트: TRANSLATING");
    } else {
      log("[Translation]", "작품 상태 전이 불가, 현재 상태 유지", { current: currentWork?.status });
    }
  } catch (e) {
    log("[Translation]", "작품 상태 업데이트 실패 (무시)", { error: String(e) });
  }

  // 실패한 챕터 번호 추적
  const failedChapterNums: number[] = [];

  // 단일 챕터 번역 처리 함수
  async function translateSingleChapter(
    chapter: { id: string; number: number },
    chapterIndex: number
  ): Promise<{ success: boolean; chapterNumber: number; duration: number }> {
    const chapterStartTime = Date.now();

    log("[Translation]", `========== 챕터 ${chapter.number} 시작 (${chapterIndex + 1}/${chapters.length}) ==========`);

    // 메모리 최적화: 챕터 원문을 한 건씩 DB에서 로드
    const chapterData = await db.chapter.findUnique({
      where: { id: chapter.id },
      select: { originalContent: true },
    });
    if (!chapterData) {
      log("[Translation]", `챕터 ${chapter.number} DB에서 찾을 수 없음, 스킵`);
      await translationManager.completeChapter(jobId, chapter.number);
      return { success: true, chapterNumber: chapter.number, duration: Date.now() - chapterStartTime };
    }

    log("[Translation]", `챕터 ${chapter.number} 처리 시작`, {
      contentLength: chapterData.originalContent.length
    });

    // 중복 번역 방지: PENDING 상태인 경우에만 TRANSLATING으로 변경 (atomic update)
    const updateResult = await db.chapter.updateMany({
      where: {
        id: chapter.id,
        status: "PENDING",
      },
      data: { status: "TRANSLATING" },
    });

    // 업데이트된 행이 없으면 다른 작업이 이미 번역 중
    if (updateResult.count === 0) {
      log("[Translation]", `챕터 ${chapter.number} 이미 다른 작업에서 처리 중, 스킵`);
      await translationManager.completeChapter(jobId, chapter.number);
      return { success: true, chapterNumber: chapter.number, duration: Date.now() - chapterStartTime };
    }

    // 챕터 시작 알림 (청크 없이 챕터 단위로만 추적)
    await translationManager.startChapter(jobId, chapter.number, 1);
    await translationLogger.logChapterStart(jobId, workId, chapter.id, chapter.number, 1, { userId, userEmail });

    // 챕터 번역 (대형 챕터는 자동 청크 분할)
    log("[Translation]", `챕터 ${chapter.number} 번역 API 호출`);
    const translatedContent = await translateChapter(
      chapterData.originalContent,
      context,
      5, // maxRetries
      // 대형 챕터 청크 진행률 콜백
      async (currentChunk, totalChunks) => {
        log("[Translation]", `챕터 ${chapter.number} 청크 진행: ${currentChunk}/${totalChunks}`);
        await translationManager.updateChunkProgress(jobId, chapter.number, currentChunk, totalChunks);
      }
    );

    log("[Translation]", `챕터 ${chapter.number} 번역 완료`, {
      originalLength: chapterData.originalContent.length,
      translatedLength: translatedContent.length,
    });

    // 번역 결과 저장
    await db.chapter.update({
      where: { id: chapter.id },
      data: {
        translatedContent,
        status: "TRANSLATED",
        translationMeta: Prisma.JsonNull,
      },
    });

    // 챕터 완료 알림
    const chapterDuration = Date.now() - chapterStartTime;
    await translationManager.completeChapter(jobId, chapter.number);
    await translationLogger.logChapterComplete(jobId, chapter.number, chapterDuration, 0, { userId, userEmail });

    log("[Translation]", `========== 챕터 ${chapter.number} 완료 (${chapterDuration}ms) ==========`);

    return { success: true, chapterNumber: chapter.number, duration: chapterDuration };
  }

  // 병렬 배치 처리
  for (let batchStart = 0; batchStart < chapters.length; batchStart += PARALLEL_CHAPTER_COUNT) {
    // 일시정지 요청 확인 (배치 시작 전)
    if (await translationManager.checkAndPause(jobId)) {
      log("[Translation]", "작업이 일시정지됨, 루프 종료");
      return;
    }

    // 현재 배치에서 처리할 챕터들
    const batchChapters = chapters.slice(batchStart, batchStart + PARALLEL_CHAPTER_COUNT);
    log("[Translation]", `배치 시작: ${batchStart + 1}~${batchStart + batchChapters.length}/${chapters.length} (${batchChapters.length}개 병렬 처리)`);

    // 배치 간 딜레이 (첫 배치 제외)
    if (batchStart > 0) {
      const batchDelay = 2000; // 배치 간 2초 딜레이
      log("[Translation]", `배치 간 딜레이: ${batchDelay}ms`);
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }

    // 병렬로 챕터 번역 실행
    const batchResults = await Promise.allSettled(
      batchChapters.map((chapter, idx) =>
        translateSingleChapter(chapter, batchStart + idx)
      )
    );

    // 결과 처리
    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      const chapter = batchChapters[i];

      if (result.status === "rejected") {
        const error = result.reason;
        log("[Translation]", `========== 챕터 ${chapter.number} 실패 ==========`);
        log("[Translation]", `에러 상세`, {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        // 에러 메시지 추출
        let errorMessage = "번역 실패";
        let errorCode = "UNKNOWN";
        if (error instanceof TranslationError) {
          errorMessage = error.message;
          errorCode = error.code;
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        // 상태 되돌리기 (TRANSLATING인 경우에만)
        await db.chapter.updateMany({
          where: {
            id: chapter.id,
            status: "TRANSLATING",
          },
          data: { status: "PENDING" },
        });

        // 챕터 실패 알림 및 로깅
        await translationManager.failChapter(jobId, chapter.number, errorMessage);
        failedChapterNums.push(chapter.number);

        await translationLogger.logChapterFailed(jobId, chapter.number, errorCode, errorMessage, {
          userId,
          userEmail,
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    log("[Translation]", `배치 완료: ${batchStart + 1}~${batchStart + batchChapters.length}/${chapters.length}`);
  }

  // 작업 완료
  const jobDuration = Date.now() - jobStartTime;
  const completedChapters = chapters.length - failedChapterNums.length;
  const hasFailed = failedChapterNums.length > 0;
  const allFailed = failedChapterNums.length === chapters.length;
  const jobStatus = allFailed ? "FAILED" : hasFailed ? "FAILED" : "COMPLETED";

  log("[Translation]", "==================== 모든 챕터 처리 완료 ====================");
  log("[Translation]", "작업 종료", {
    jobId,
    totalChapters: chapters.length,
    completedChapters,
    failedChapters: failedChapterNums.length,
    failedChapterNums,
    jobStatus,
    durationMs: jobDuration,
  });

  // 로거에 작업 완료 기록
  await translationLogger.logJobComplete(jobId, completedChapters, failedChapterNums.length, jobDuration, { userId, userEmail });

  // 작업 히스토리 저장
  await translationLogger.saveJobHistory({
    jobId,
    workId,
    workTitle: context.titleKo,
    userId,
    userEmail,
    status: jobStatus,
    totalChapters: chapters.length,
    completedChapters,
    failedChapters: failedChapterNums.length,
    failedChapterNums,
    startedAt: new Date(jobStartTime),
    completedAt: new Date(),
    durationMs: jobDuration,
  });

  // 실패한 챕터가 있으면 FAILED, 없으면 COMPLETED
  if (hasFailed) {
    const errorMsg = allFailed
      ? `전체 ${chapters.length}개 회차 번역 실패`
      : `${failedChapterNums.length}개 회차 번역 실패 (${failedChapterNums.join(", ")}화)`;
    await translationManager.failJob(jobId, errorMsg);
  } else {
    await translationManager.completeJob(jobId);
  }

  // 작품의 전체 챕터 상태를 확인하여 Work.status 업데이트
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
      // 모든 챕터가 번역 완료 → TRANSLATED (윤문가 대기) — 상태 전이 검증
      const workForStatus = await db.work.findUnique({
        where: { id: workId },
        select: { status: true },
      });
      if (workForStatus && canTransitionWorkStatus(workForStatus.status as WorkStatus, "TRANSLATED" as WorkStatus)) {
        await db.work.update({
          where: { id: workId },
          data: { status: "TRANSLATED" },
        });
        log("[Translation]", "작품 상태 업데이트: TRANSLATED (모든 회차 번역 완료)");
      } else {
        log("[Translation]", "TRANSLATED 전이 불가, 현재 상태 유지", { current: workForStatus?.status });
      }

      // 자동 공고 초안 생성: 이미 공고가 없으면 DRAFT로 생성 (작가가 검토 후 발행)
      const existingListing = await db.projectListing.findFirst({
        where: { workId },
      });
      if (!existingListing) {
        const work = await db.work.findUnique({
          where: { id: workId },
          select: { titleKo: true, authorId: true, synopsis: true, totalChapters: true },
        });
        if (work) {
          // 챕터 0(프롤로그) 존재 여부 확인
          const hasChapter0 = await db.chapter.findUnique({
            where: { workId_number: { workId, number: 0 } },
            select: { id: true },
          });
          await db.projectListing.create({
            data: {
              workId,
              authorId: work.authorId,
              title: `[윤문 요청] ${work.titleKo}`,
              description: work.synopsis || `${work.titleKo} 작품의 윤문을 요청합니다.`,
              status: "DRAFT",
              chapterStart: hasChapter0 ? 0 : 1,
              chapterEnd: work.totalChapters || totalCount,
            },
          });
          log("[Translation]", `자동 공고 초안 생성 완료: ${work.titleKo}`);
        }
      } else {
        log("[Translation]", "자동 공고 생성 스킵: 이미 공고 존재", {
          existingListingId: existingListing.id,
          existingStatus: existingListing.status,
        });
      }
    } else if (totalCount > 0 && translatedCount < totalCount) {
      // 부분 번역 또는 전체 실패: TRANSLATING → BIBLE_CONFIRMED으로 복원
      // status가 이미 바뀌었을 수 있으므로 현재 상태 확인 후 복원
      const currentWork = await db.work.findUnique({
        where: { id: workId },
        select: { status: true },
      });
      if (currentWork && canTransitionWorkStatus(currentWork.status as WorkStatus, "BIBLE_CONFIRMED" as WorkStatus)) {
        await db.work.update({
          where: { id: workId },
          data: { status: "BIBLE_CONFIRMED" },
        });
        log("[Translation]", "작품 상태 복원: BIBLE_CONFIRMED (부분 번역 완료)", {
          total: totalCount,
          translated: translatedCount,
          remaining: totalCount - translatedCount,
        });
      }
    }
  } catch (e) {
    log("[Translation]", "작품 상태 업데이트 실패 (무시)", { error: String(e) });
  }
}

export async function POST(req: Request) {
  console.log("[Translation API] POST 요청 수신");
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      console.log("[Translation API] 인증 실패: 세션 없음");
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }
    console.log("[Translation API] 인증 성공:", session.user.email);

    // Rate Limiting 체크
    const rateLimit = await checkRateLimit(session.user.id);
    if (!rateLimit.allowed) {
      console.log("[Translation API] Rate limit 초과:", session.user.id);
      return NextResponse.json(
        { error: `요청이 너무 많습니다. ${rateLimit.retryAfter}초 후 다시 시도해주세요.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { workId, chapterNumbers, force } = body as {
      workId: string;
      chapterNumbers: number[];
      force?: boolean; // 기존 작업 강제 취소 후 시작
    };
    console.log("[Translation API] 요청 데이터:", { workId, chapterNumbers, force });

    if (!workId || !chapterNumbers || chapterNumbers.length === 0) {
      console.log("[Translation API] 잘못된 요청: workId 또는 chapterNumbers 누락");
      return NextResponse.json(
        { error: "작품 ID와 회차 번호가 필요합니다." },
        { status: 400 }
      );
    }

    // 챕터 번호 검증 (보안)
    const MAX_CHAPTERS_PER_REQUEST = 2000; // 실제 처리는 순차적이므로 큰 제한 불필요
    const MAX_CHAPTER_NUMBER = 10000;

    if (chapterNumbers.length > MAX_CHAPTERS_PER_REQUEST) {
      return NextResponse.json(
        { error: `한 번에 최대 ${MAX_CHAPTERS_PER_REQUEST}개 챕터까지 선택할 수 있습니다.` },
        { status: 400 }
      );
    }

    const invalidChapters = chapterNumbers.filter(
      (n) => !Number.isInteger(n) || n < 0 || n > MAX_CHAPTER_NUMBER
    );
    if (invalidChapters.length > 0) {
      return NextResponse.json(
        { error: `잘못된 챕터 번호가 포함되어 있습니다: ${invalidChapters.slice(0, 5).join(", ")}${invalidChapters.length > 5 ? "..." : ""}` },
        { status: 400 }
      );
    }

    // 작품과 용어집, 설정집 조회
    console.log("[Translation API] 작품 조회:", workId);
    const work = await db.work.findUnique({
      where: { id: workId },
      include: {
        glossary: true,
        settingBible: {
          include: {
            characters: true,
            terms: true,
          },
        },
      },
    });

    if (!work || work.authorId !== session.user.id) {
      console.log("[Translation API] 권한 없음:", { workExists: !!work, authorId: work?.authorId, userId: session.user.id });
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    console.log("[Translation API] 작품 조회 성공:", work.titleKo);

    // Work 상태 검증: TRANSLATING으로 전이 가능한 상태인지 확인
    if (!canTransitionWorkStatus(work.status as WorkStatus, "TRANSLATING" as WorkStatus)) {
      return NextResponse.json(
        {
          error: `현재 작품 상태(${work.status})에서는 번역을 시작할 수 없습니다.`,
          code: "INVALID_WORK_STATUS",
        },
        { status: 400 }
      );
    }

    // 설정집 확정 검증
    if (!work.settingBible || work.settingBible.status !== "CONFIRMED") {
      console.log("[Translation API] 설정집 미확정:", {
        hasBible: !!work.settingBible,
        status: work.settingBible?.status
      });
      return NextResponse.json(
        {
          error: "설정집을 먼저 확정해주세요.",
          code: "BIBLE_NOT_CONFIRMED",
          redirectUrl: `/works/${workId}/setting-bible`,
        },
        { status: 400 }
      );
    }

    // 중복 작업 방지: 원자적 슬롯 예약 (DB 기반)
    const reserved = await translationManager.reserveJobSlot(workId, force);
    if (!reserved) {
      console.log("[Translation API] 이미 진행 중인 작업 있음");
      return NextResponse.json({
        error: "이 작품에 대해 이미 번역 작업이 진행 중입니다. 강제로 새 작업을 시작하려면 '기존 작업 취소 후 시작' 옵션을 사용하세요.",
      }, { status: 409 });
    }

    // 번역할 챕터 조회 (PENDING + 멈춘 TRANSLATING 챕터 포함)
    console.log("[Translation API] 챕터 조회:", chapterNumbers);
    const chapters = await db.chapter.findMany({
      where: {
        workId,
        number: { in: chapterNumbers },
        status: { in: ["PENDING", "TRANSLATING"] },
      },
      select: { id: true, number: true, status: true, originalContent: true },
      orderBy: { number: "asc" },
    });
    console.log("[Translation API] 조회된 챕터:", chapters.length, "개");

    // 멈춘 TRANSLATING 챕터를 PENDING으로 리셋
    const stuckTranslating = chapters.filter((ch) => ch.status === "TRANSLATING");
    if (stuckTranslating.length > 0) {
      console.log("[Translation API] 멈춘 TRANSLATING 챕터 리셋:", stuckTranslating.map((ch) => ch.number));
      await db.chapter.updateMany({
        where: {
          id: { in: stuckTranslating.map((ch) => ch.id) },
          status: "TRANSLATING",
        },
        data: { status: "PENDING" },
      });
    }

    if (chapters.length === 0) {
      console.log("[Translation API] 번역할 회차 없음");
      translationManager.releaseJobSlot(workId);

      // 요청한 챕터의 실제 상태를 조회하여 구체적 에러 메시지 제공
      const requestedChapters = await db.chapter.findMany({
        where: { workId, number: { in: chapterNumbers } },
        select: { number: true, status: true },
        orderBy: { number: "asc" },
      });

      const statusDetails = requestedChapters.map(
        (ch) => `${ch.number}화: ${ch.status}`
      );
      const missingNumbers = chapterNumbers.filter(
        (n) => !requestedChapters.find((ch) => ch.number === n)
      );

      return NextResponse.json(
        {
          error: "번역할 회차가 없습니다. 선택한 회차가 이미 번역되었거나 존재하지 않습니다.",
          details: [
            ...statusDetails,
            ...missingNumbers.map((n) => `${n}화: 존재하지 않음`),
          ],
        },
        { status: 400 }
      );
    }

    // 챕터 크기 검증
    const sizeValidation = validateChapterSizes(
      chapters.map((ch) => ({ number: ch.number, originalContent: ch.originalContent }))
    );

    if (!sizeValidation.valid) {
      console.log("[Translation API] 챕터 크기 초과:", sizeValidation.errors);
      translationManager.releaseJobSlot(workId);
      return NextResponse.json(
        {
          error: "일부 회차가 너무 큽니다. 분할 후 다시 시도해주세요.",
          details: sizeValidation.errors,
        },
        { status: 400 }
      );
    }

    if (sizeValidation.warnings.length > 0) {
      console.log("[Translation API] 챕터 크기 경고:", sizeValidation.warnings);
    }

    // 번역 컨텍스트 생성 (설정집 데이터 포함)
    console.log("[Translation API] 번역 컨텍스트 생성");
    const context: TranslationContext = {
      titleKo: work.titleKo,
      genres: work.genres,
      ageRating: work.ageRating,
      synopsis: work.synopsis,
      glossary: work.glossary.map((g) => ({
        original: g.original,
        translated: g.translated,
      })),
      // 설정집에서 인물 정보 추가
      characters: work.settingBible?.characters.map((c) => ({
        nameOriginal: c.nameOriginal,
        nameKorean: c.nameKorean,
        role: c.role,
        speechStyle: c.speechStyle || undefined,
        personality: c.personality || undefined,
      })),
      // 설정집의 번역 가이드 추가
      translationGuide: work.settingBible?.translationGuide || undefined,
    };
    console.log("[Translation API] 컨텍스트:", {
      titleKo: context.titleKo,
      genres: context.genres,
      glossaryCount: context.glossary?.length || 0,
      charactersCount: context.characters?.length || 0,
      hasTranslationGuide: !!context.translationGuide,
    });

    // 사용자 정보
    const userId = session.user.id;
    const userEmail = session.user.email || undefined;

    // 작업 생성 (DB에 저장)
    const jobId = await translationManager.createJob(
      workId,
      work.titleKo,
      chapters.map((ch) => ({ number: ch.number, id: ch.id })),
      userId,
      userEmail
    );
    console.log("[Translation API] 작업 생성됨:", jobId);

    // 백그라운드에서 번역 실행 (after()로 응답 후 실행 보장)
    // 메모리 최적화: closure에 originalContent를 포함하지 않음
    const chapterMeta = chapters.map((ch) => ({ id: ch.id, number: ch.number }));
    console.log("[Translation API] 백그라운드 번역 예약 (after)");

    after(async () => {
      try {
        await processTranslation(
          jobId,
          workId,
          chapterMeta,
          context,
          userId,
          userEmail
        );
      } catch (error) {
        console.error("[Translation API] 백그라운드 작업 실패:", error);

        let errorMessage = "번역 실패";
        let errorCode = "UNKNOWN";
        if (error instanceof TranslationError) {
          errorMessage = error.message;
          errorCode = error.code;
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        // 에러 로깅 및 상태 업데이트 (각각 try-catch로 보호)
        try {
          await translationLogger.logJobFailed(jobId, errorCode, errorMessage, {
            userId,
            userEmail,
            workId,
            errorStack: error instanceof Error ? error.stack : undefined,
          });
        } catch (logError) {
          console.error("[Translation API] 실패 로깅 중 오류:", logError);
        }

        try {
          await translationLogger.saveJobHistory({
            jobId,
            workId,
            workTitle: work.titleKo,
            userId,
            userEmail,
            status: "FAILED",
            totalChapters: chapterMeta.length,
            completedChapters: 0,
            failedChapters: chapterMeta.length,
            errorMessage,
            failedChapterNums: chapterMeta.map(ch => ch.number),
            startedAt: new Date(),
            completedAt: new Date(),
          });
        } catch (historyError) {
          console.error("[Translation API] 히스토리 저장 중 오류:", historyError);
        }

        try {
          await translationManager.failJob(jobId, errorMessage);
        } catch (failError) {
          console.error("[Translation API] 작업 실패 처리 중 오류:", failError);
        }
      }
    });

    // 즉시 jobId 반환
    console.log("[Translation API] 응답 반환:", { jobId, totalChapters: chapters.length });
    return NextResponse.json({
      jobId,
      status: "STARTED",
      totalChapters: chapters.length,
      message: "번역이 시작되었습니다.",
    });
  } catch (error) {
    console.error("[Translation API] 오류 발생:", error);
    return NextResponse.json(
      { error: "번역 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
