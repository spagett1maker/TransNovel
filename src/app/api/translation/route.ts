import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { TranslationContext } from "@/lib/gemini";
import { translationManager } from "@/lib/translation-manager";
import { canTransitionWorkStatus } from "@/lib/work-status";
import { WorkStatus } from "@prisma/client";
import { enqueueBatchTranslation } from "@/lib/queue";
import { translationRequestSchema } from "@/lib/validations/translation";

// 챕터 크기 제한 (안전 마진 포함)
const MAX_CHAPTER_SIZE = 500000; // 50만 자 (약 100KB)
const WARN_CHAPTER_SIZE = 200000; // 20만 자 경고

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
    const parsed = translationRequestSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      console.log("[Translation API] 검증 실패:", firstError.message);
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      );
    }

    const { workId, chapterNumbers, force } = parsed.data;
    console.log("[Translation API] 요청 데이터:", { workId, chaptersCount: chapterNumbers.length, force });

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

    // 작업 생성 (DB에 저장) — Serializable 트랜잭션으로 중복 방지
    const jobId = await translationManager.createJob(
      workId,
      work.titleKo,
      chapters.map((ch) => ({ number: ch.number, id: ch.id })),
      userId,
      userEmail,
      force
    );

    if (!jobId) {
      console.log("[Translation API] 이미 진행 중인 작업 있음");
      return NextResponse.json({
        error: "이 작품에 대해 이미 번역 작업이 진행 중입니다. 강제로 새 작업을 시작하려면 '기존 작업 취소 후 시작' 옵션을 사용하세요.",
      }, { status: 409 });
    }
    console.log("[Translation API] 작업 생성됨:", jobId);

    // SQS를 통한 챕터별 분산 처리
    const chapterMeta = chapters.map((ch) => ({ id: ch.id, number: ch.number }));

    try {
      await enqueueBatchTranslation(jobId, workId, chapterMeta, userId, userEmail);
      await translationManager.startJob(jobId);

      console.log("[Translation API] SQS 큐잉 완료:", {
        jobId,
        chaptersCount: chapterMeta.length,
      });
    } catch (sqsError) {
      console.error("[Translation API] SQS 큐잉 실패:", sqsError);

      const errorMessage = sqsError instanceof Error
        ? sqsError.message
        : "SQS 큐잉 실패";

      await translationManager.failJob(jobId, errorMessage);

      return NextResponse.json(
        { error: "번역 작업 큐잉에 실패했습니다. 다시 시도해주세요." },
        { status: 500 }
      );
    }

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
