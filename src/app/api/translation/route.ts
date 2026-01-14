import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { splitIntoChunks, translateChunks, TranslationError, ChunkTranslationResult, TranslationLoggingContext } from "@/lib/gemini";
import { translationManager } from "@/lib/translation-manager";
import { translationLogger } from "@/lib/translation-logger";

interface TranslationContext {
  titleKo: string;
  genres: string[];
  ageRating: string;
  synopsis: string;
  glossary: Array<{ original: string; translated: string }>;
}

// 중간 저장 메타데이터 타입
interface TranslationMeta {
  lastSavedChunk: number;
  totalChunks: number;
  partialResults: string[];
  startedAt: string;
}

// 중간 저장 간격 (N개 청크마다 저장)
const INCREMENTAL_SAVE_INTERVAL = 3;

// 챕터 크기 제한 (안전 마진 포함)
const MAX_CHAPTER_SIZE = 500000; // 50만 자 (약 100KB)
const WARN_CHAPTER_SIZE = 200000; // 20만 자 경고

// ============================================
// 사용자별 Rate Limiting (메모리 기반)
// ============================================
const RATE_LIMIT_REQUESTS = 5; // 윈도우당 최대 요청 수
const RATE_LIMIT_WINDOW_MS = 60000; // 1분 윈도우

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const userRateLimits = new Map<string, RateLimitEntry>();

// 오래된 rate limit 엔트리 정리 (메모리 누수 방지)
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of userRateLimits.entries()) {
    if (entry.resetAt < now) {
      userRateLimits.delete(userId);
    }
  }
}, 60000); // 1분마다 정리

function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = userRateLimits.get(userId);

  if (!entry || entry.resetAt < now) {
    // 새 윈도우 시작
    userRateLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_REQUESTS) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count++;
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

// 백그라운드 번역 처리 함수
async function processTranslation(
  jobId: string,
  workId: string,
  chapters: Array<{ id: string; number: number; originalContent: string }>,
  context: TranslationContext,
  userId: string,
  userEmail?: string
) {
  const jobStartTime = Date.now();

  log("[Translation]", "==================== processTranslation 시작 ====================");
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

  // 실패한 챕터 번호 추적
  const failedChapterNums: number[] = [];

  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
    const chapter = chapters[chapterIndex];

    // 일시정지 요청 확인
    if (await translationManager.checkAndPause(jobId)) {
      log("[Translation]", "작업이 일시정지됨, 루프 종료");
      return; // 루프 종료
    }

    log("[Translation]", `========== 루프 시작: chapterIndex=${chapterIndex}, chapterNumber=${chapter.number} ==========`);

    // Rate limit 방지: 첫 번째 챕터가 아니면 챕터 간 딜레이 추가
    if (chapterIndex > 0) {
      const chapterDelay = 2000; // 챕터 간 2초 딜레이
      log("[Translation]", `챕터 간 딜레이 시작: ${chapterDelay}ms`);
      await new Promise(resolve => setTimeout(resolve, chapterDelay));
      log("[Translation]", "챕터 간 딜레이 완료");
    }

    log("[Translation]", `챕터 ${chapter.number} 처리 시작`, {
      chapterIndex,
      total: chapters.length,
      contentLength: chapter.originalContent.length
    });
    try {
      // 중복 번역 방지: PENDING 상태인 경우에만 TRANSLATING으로 변경 (atomic update)
      log("[Translation]", `챕터 ${chapter.number} DB 상태 업데이트 시작: TRANSLATING (atomic)`);
      const updateResult = await db.chapter.updateMany({
        where: {
          id: chapter.id,
          status: "PENDING", // 이 조건으로 중복 번역 방지
        },
        data: { status: "TRANSLATING" },
      });

      // 업데이트된 행이 없으면 다른 작업이 이미 번역 중
      if (updateResult.count === 0) {
        log("[Translation]", `챕터 ${chapter.number} 이미 다른 작업에서 처리 중, 스킵`);
        await translationManager.completeChapter(jobId, chapter.number); // 완료로 처리하고 스킵
        continue;
      }
      log("[Translation]", `챕터 ${chapter.number} DB 상태 업데이트 완료 (locked)`);

      // 청크 분할
      log("[Translation]", `챕터 ${chapter.number} 청크 분할 시작`);
      const chunks = splitIntoChunks(chapter.originalContent);
      log("[Translation]", `챕터 ${chapter.number} 청크 분할 완료`, {
        chunksCount: chunks.length,
        chunkLengths: chunks.map(c => c.length)
      });

      // 기존 중간 저장 데이터 확인 (이어서 번역 지원)
      const existingChapter = await db.chapter.findUnique({
        where: { id: chapter.id },
        select: { translationMeta: true },
      });
      const existingMeta = existingChapter?.translationMeta as TranslationMeta | null;

      // 중간 저장 상태 초기화
      let partialResults: string[] = [];
      let startFromChunk = 0;

      // 이전 진행 상태가 있으면 이어서 번역
      if (existingMeta && existingMeta.totalChunks === chunks.length && existingMeta.partialResults.length > 0) {
        partialResults = existingMeta.partialResults;
        startFromChunk = existingMeta.lastSavedChunk;
        log("[Translation]", `챕터 ${chapter.number} 이전 진행 상태 발견, 이어서 번역`, {
          startFromChunk,
          existingResults: partialResults.length,
        });
      }

      // 챕터 시작 알림 및 로깅
      log("[Translation]", `챕터 ${chapter.number} 번역 시작 알림 전송`);
      await translationManager.startChapter(jobId, chapter.number, chunks.length);
      await translationLogger.logChapterStart(jobId, workId, chapter.id, chapter.number, chunks.length, { userId, userEmail });

      // 시작 청크가 있으면 진행률 업데이트
      if (startFromChunk > 0) {
        await translationManager.updateChunkProgress(jobId, chapter.number, startFromChunk, chunks.length);
      }

      // 청크 번역 (진행 콜백 + 중간 저장 포함)
      log("[Translation]", `챕터 ${chapter.number} translateChunks 호출 시작`);
      const failedChunks: number[] = [];
      let lastSavePoint = startFromChunk;

      const { results, failedChunks: apiFailedChunks } = await translateChunks(
        chunks,
        context,
        async (current: number, total: number, result: ChunkTranslationResult, accumulatedResults: string[]) => {
          log("[Translation]", `챕터 ${chapter.number} 청크 콜백`, {
            current,
            total,
            success: result.success,
            chapterIndex,
          });
          await translationManager.updateChunkProgress(
            jobId,
            chapter.number,
            current,
            total
          );

          // 청크 실패 시 에러 보고
          if (!result.success && result.error) {
            log("[Translation]", `챕터 ${chapter.number} 청크 ${result.index} 실패`, { error: result.error });
            await translationManager.reportChunkError(
              jobId,
              chapter.number,
              result.index,
              result.error
            );
            failedChunks.push(result.index);
          }

          // 중간 저장: N개 청크마다 DB에 저장
          if (current > 0 && current % INCREMENTAL_SAVE_INTERVAL === 0 && current > lastSavePoint) {
            lastSavePoint = current;
            log("[Translation]", `챕터 ${chapter.number} 중간 저장`, { current, total, resultsCount: accumulatedResults.length });

            try {
              // 현재까지의 번역 결과와 메타데이터 함께 저장
              const meta: TranslationMeta = {
                lastSavedChunk: current,
                totalChunks: total,
                partialResults: [...partialResults, ...accumulatedResults], // 기존 결과 + 새 결과
                startedAt: existingMeta?.startedAt || new Date().toISOString(),
              };

              await db.chapter.update({
                where: { id: chapter.id },
                data: { translationMeta: meta as unknown as Prisma.InputJsonValue },
              });
              log("[Translation]", `챕터 ${chapter.number} 중간 저장 완료`, { savedChunks: meta.partialResults.length });
            } catch (saveError) {
              log("[Translation]", `챕터 ${chapter.number} 중간 저장 실패 (무시하고 계속)`, {
                error: saveError instanceof Error ? saveError.message : String(saveError),
              });
            }
          }
        },
        startFromChunk, // 시작 청크 인덱스 전달
        // 로깅 컨텍스트 전달
        {
          jobId,
          workId,
          chapterId: chapter.id,
          chapterNum: chapter.number,
          userId,
          userEmail,
        } as TranslationLoggingContext
      );

      // 기존 결과와 새 결과 병합
      const allResults = [...partialResults, ...results];

      log("[Translation]", `챕터 ${chapter.number} translateChunks 완료`, {
        resultsCount: allResults.length,
        failedCount: apiFailedChunks.length,
        chapterIndex,
      });

      const translatedContent = allResults.join("\n\n");
      log("[Translation]", `챕터 ${chapter.number} 번역 결과`, {
        length: translatedContent.length,
        chapterIndex
      });

      // 번역 결과 저장 (translationMeta 클리어)
      log("[Translation]", `챕터 ${chapter.number} DB 저장 시작`);
      await db.chapter.update({
        where: { id: chapter.id },
        data: {
          translatedContent,
          status: "TRANSLATED",
          translationMeta: Prisma.JsonNull, // 완료 시 메타데이터 클리어
        },
      });
      log("[Translation]", `챕터 ${chapter.number} DB 저장 완료`);

      // 챕터 완료 알림 (부분 완료 vs 완전 완료)
      const chapterDuration = Date.now() - jobStartTime;
      if (failedChunks.length > 0) {
        log("[Translation]", `챕터 ${chapter.number} 부분 완료`, { failedChunks, chapterIndex });
        await translationManager.completeChapterPartial(jobId, chapter.number, failedChunks);
        await translationLogger.logChapterComplete(jobId, chapter.number, chapterDuration, failedChunks.length, { userId, userEmail });
      } else {
        log("[Translation]", `챕터 ${chapter.number} 완전 완료`, { chapterIndex });
        await translationManager.completeChapter(jobId, chapter.number);
        await translationLogger.logChapterComplete(jobId, chapter.number, chapterDuration, 0, { userId, userEmail });
      }

      log("[Translation]", `========== 루프 종료: chapterIndex=${chapterIndex} 성공 ==========`);
    } catch (error) {
      log("[Translation]", `========== 루프 에러: chapterIndex=${chapterIndex} ==========`);
      log("[Translation]", `챕터 ${chapter.number} 번역 실패`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        chapterIndex,
      });

      // 에러 메시지 추출
      let errorMessage = "번역 실패";
      if (error instanceof TranslationError) {
        errorMessage = error.message;
        log("[Translation]", "TranslationError 상세", {
          code: (error as TranslationError).code,
          message: error.message,
          retryable: (error as TranslationError).retryable,
        });
      } else if (error instanceof Error) {
        errorMessage = error.message;
        log("[Translation]", "Error 상세", { message: error.message, stack: error.stack });
      }

      // 상태 되돌리기 (TRANSLATING인 경우에만 - 우리가 락을 잡은 경우)
      log("[Translation]", `챕터 ${chapter.number} DB 상태 되돌리기: PENDING`);
      await db.chapter.updateMany({
        where: {
          id: chapter.id,
          status: "TRANSLATING", // 우리가 설정한 상태인 경우에만 되돌림
        },
        data: { status: "PENDING" },
      });

      // 챕터 실패 알림 및 로깅
      await translationManager.failChapter(jobId, chapter.number, errorMessage);
      failedChapterNums.push(chapter.number);

      const errorCode = error instanceof TranslationError ? error.code : "UNKNOWN";
      await translationLogger.logChapterFailed(jobId, chapter.number, errorCode, errorMessage, {
        userId,
        userEmail,
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      log("[Translation]", `챕터 ${chapter.number} 실패 알림 전송 완료`);
    }
  }

  // 작업 완료
  const jobDuration = Date.now() - jobStartTime;
  const completedChapters = chapters.length - failedChapterNums.length;

  log("[Translation]", "==================== 모든 챕터 처리 완료 ====================");
  log("[Translation]", "작업 종료", { jobId, totalChapters: chapters.length, completedChapters, failedChapters: failedChapterNums.length });

  // 로거에 작업 완료 기록
  await translationLogger.logJobComplete(jobId, completedChapters, failedChapterNums.length, jobDuration, { userId, userEmail });

  // 작업 히스토리 저장
  await translationLogger.saveJobHistory({
    jobId,
    workId,
    workTitle: context.titleKo,
    userId,
    userEmail,
    status: failedChapterNums.length === chapters.length ? "FAILED" : "COMPLETED",
    totalChapters: chapters.length,
    completedChapters,
    failedChapters: failedChapterNums.length,
    failedChapterNums,
    startedAt: new Date(jobStartTime),
    completedAt: new Date(),
    durationMs: jobDuration,
  });

  await translationManager.completeJob(jobId);
}

export async function POST(req: Request) {
  console.log("[Translation API] POST 요청 수신");
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      console.log("[Translation API] 인증 실패: 세션 없음");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log("[Translation API] 인증 성공:", session.user.email);

    // Rate Limiting 체크
    const rateLimit = checkRateLimit(session.user.id);
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
    const MAX_CHAPTERS_PER_REQUEST = 100;
    const MAX_CHAPTER_NUMBER = 10000;

    if (chapterNumbers.length > MAX_CHAPTERS_PER_REQUEST) {
      return NextResponse.json(
        { error: `한 번에 최대 ${MAX_CHAPTERS_PER_REQUEST}개 챕터만 번역할 수 있습니다.` },
        { status: 400 }
      );
    }

    const invalidChapters = chapterNumbers.filter(
      (n) => !Number.isInteger(n) || n <= 0 || n > MAX_CHAPTER_NUMBER
    );
    if (invalidChapters.length > 0) {
      return NextResponse.json(
        { error: `잘못된 챕터 번호가 포함되어 있습니다: ${invalidChapters.slice(0, 5).join(", ")}${invalidChapters.length > 5 ? "..." : ""}` },
        { status: 400 }
      );
    }

    // 작품과 용어집 조회
    console.log("[Translation API] 작품 조회:", workId);
    const work = await db.work.findUnique({
      where: { id: workId },
      include: {
        glossary: true,
      },
    });

    if (!work || work.authorId !== session.user.id) {
      console.log("[Translation API] 권한 없음:", { workExists: !!work, authorId: work?.authorId, userId: session.user.id });
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    console.log("[Translation API] 작품 조회 성공:", work.titleKo);

    // 중복 작업 방지: 원자적 슬롯 예약 (DB 기반)
    const reserved = await translationManager.reserveJobSlot(workId, force);
    if (!reserved) {
      console.log("[Translation API] 이미 진행 중인 작업 있음");
      return NextResponse.json({
        error: "이 작품에 대해 이미 번역 작업이 진행 중입니다. 강제로 새 작업을 시작하려면 '기존 작업 취소 후 시작' 옵션을 사용하세요.",
      }, { status: 409 });
    }

    // 번역할 챕터 조회
    console.log("[Translation API] 챕터 조회:", chapterNumbers);
    const chapters = await db.chapter.findMany({
      where: {
        workId,
        number: { in: chapterNumbers },
        status: "PENDING",
      },
      orderBy: { number: "asc" },
    });
    console.log("[Translation API] 조회된 챕터:", chapters.length, "개");

    if (chapters.length === 0) {
      console.log("[Translation API] 번역할 회차 없음");
      // 슬롯 예약 해제 (DB 기반에서는 필요 없지만 호환성 유지)
      translationManager.releaseJobSlot(workId);
      return NextResponse.json(
        { error: "번역할 회차가 없습니다." },
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

    // 번역 컨텍스트 생성
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
    };
    console.log("[Translation API] 컨텍스트:", {
      titleKo: context.titleKo,
      genres: context.genres,
      glossaryCount: context.glossary.length,
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

    // 백그라운드에서 번역 실행 (await 하지 않음)
    // 클라이언트가 SSE 연결할 시간을 주기 위해 약간의 딜레이 추가
    console.log("[Translation API] 백그라운드 번역 시작 (500ms 딜레이 후)");

    setTimeout(async () => {
      try {
        await processTranslation(
          jobId,
          workId,
          chapters.map((ch) => ({
            id: ch.id,
            number: ch.number,
            originalContent: ch.originalContent,
          })),
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
            totalChapters: chapters.length,
            completedChapters: 0,
            failedChapters: chapters.length,
            errorMessage,
            failedChapterNums: chapters.map(ch => ch.number),
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
    }, 500); // 500ms 딜레이

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
