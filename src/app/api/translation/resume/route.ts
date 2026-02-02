import { after, NextRequest, NextResponse } from "next/server";
import { Prisma, WorkStatus } from "@prisma/client";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translateChapter, TranslationError, TranslationContext } from "@/lib/gemini";
import { translationManager } from "@/lib/translation-manager";
import { translationLogger } from "@/lib/translation-logger";
import { canTransitionWorkStatus } from "@/lib/work-status";

// 로깅 헬퍼
function log(...args: unknown[]) {
  console.log("[Resume API]", ...args);
}

// JSON에서 ChapterProgress 배열로 안전하게 변환
function parseChaptersProgress(json: Prisma.JsonValue | null): Array<{ number: number; status: string }> {
  if (!json || !Array.isArray(json)) return [];
  return json as unknown as Array<{ number: number; status: string }>;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { jobId, retryFailed } = body as { jobId: string; retryFailed?: boolean };

    if (!jobId) {
      return NextResponse.json({ error: "작업 ID가 필요합니다." }, { status: 400 });
    }

    log("재개 요청:", jobId, retryFailed ? "(실패 챕터 재시도)" : "");

    // 1. 작업 조회
    const existingJob = await db.activeTranslationJob.findUnique({
      where: { jobId },
    });

    if (!existingJob) {
      return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
    }

    if (existingJob.userId !== session.user.id) {
      return NextResponse.json(
        { error: "본인의 작업만 재개할 수 있습니다." },
        { status: 403 }
      );
    }

    // FAILED 작업의 실패 챕터 재시도
    if (retryFailed && existingJob.status === "FAILED") {
      return await handleRetryFailed(existingJob, session.user.id);
    }

    if (existingJob.status !== "PAUSED") {
      return NextResponse.json(
        { error: "일시정지된 작업만 재개할 수 있습니다. 실패한 작업은 retryFailed: true 옵션을 사용하세요." },
        { status: 400 }
      );
    }

    // 기존 PAUSED 재개 로직
    const pausedJob = existingJob;

    // 2. 남은 챕터 번호 조회
    const pendingChapterNumbers = await translationManager.getPendingChapterNumbers(jobId);
    log("남은 챕터:", pendingChapterNumbers);

    if (pendingChapterNumbers.length === 0) {
      await db.activeTranslationJob.update({
        where: { jobId },
        data: { status: "COMPLETED" },
      });
      return NextResponse.json({ error: "재개할 챕터가 없습니다." }, { status: 400 });
    }

    // 3. 작품 및 설정집 조회
    const work = await db.work.findUnique({
      where: { id: pausedJob.workId },
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
      return NextResponse.json({ error: "작품을 찾을 수 없습니다." }, { status: 404 });
    }

    // 설정집 확정 재검증 (일시정지 중 설정집이 변경되었을 수 있음)
    if (!work.settingBible || work.settingBible.status !== "CONFIRMED") {
      return NextResponse.json(
        { error: "설정집이 확정되지 않았습니다. 설정집을 다시 확인해주세요." },
        { status: 400 }
      );
    }

    // Work 상태 전이 검증: TRANSLATING으로 전환 가능한지 확인
    if (!canTransitionWorkStatus(work.status as WorkStatus, "TRANSLATING" as WorkStatus)) {
      return NextResponse.json(
        { error: `현재 작품 상태(${work.status})에서는 번역을 재개할 수 없습니다.` },
        { status: 400 }
      );
    }

    // 4. 번역할 챕터 조회 (PENDING + 멈춘 TRANSLATING 포함)
    const chapters = await db.chapter.findMany({
      where: {
        workId: pausedJob.workId,
        number: { in: pendingChapterNumbers },
        status: { in: ["PENDING", "TRANSLATING"] },
      },
      select: { id: true, number: true, status: true },
      orderBy: { number: "asc" },
    });
    log("조회된 챕터:", chapters.length, "개");

    // 멈춘 TRANSLATING 챕터를 PENDING으로 리셋
    const stuckTranslating = chapters.filter((ch) => ch.status === "TRANSLATING");
    if (stuckTranslating.length > 0) {
      log("멈춘 TRANSLATING 챕터 리셋:", stuckTranslating.map((ch) => ch.number));
      await db.chapter.updateMany({
        where: {
          id: { in: stuckTranslating.map((ch) => ch.id) },
          status: "TRANSLATING",
        },
        data: { status: "PENDING" },
      });
    }

    if (chapters.length === 0) {
      // DB 상태와 작업 상태가 다른 경우 (이미 번역됨)
      await db.activeTranslationJob.update({
        where: { jobId },
        data: { status: "COMPLETED" },
      });
      return NextResponse.json({ error: "번역할 챕터가 없습니다." }, { status: 400 });
    }

    // 5. 기존 작업 상태를 IN_PROGRESS로 변경 (새 작업 생성 대신 기존 작업 재사용)
    await db.activeTranslationJob.update({
      where: { jobId },
      data: {
        status: "IN_PROGRESS",
        isPauseRequested: false,
      },
    });

    // 6. 번역 컨텍스트 생성
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

    // 7. 백그라운드에서 번역 실행 (after()로 응답 후 실행 보장)
    log("백그라운드 번역 예약 (after)");

    // 메모리 최적화: closure에 originalContent를 포함하지 않음
    const chapterMeta = chapters.map((ch) => ({ id: ch.id, number: ch.number }));

    after(async () => {
      try {
        await processTranslation(
          jobId,
          pausedJob.workId,
          chapterMeta,
          context,
          pausedJob.userId,
          pausedJob.userEmail || undefined
        );
      } catch (error) {
        console.error("[Resume API] 백그라운드 작업 실패:", error);
        await translationManager.failJob(
          jobId,
          error instanceof Error ? error.message : "알 수 없는 오류"
        );
      }
    });

    log("재개 성공:", jobId);

    return NextResponse.json({
      success: true,
      jobId,
      totalChapters: chapters.length,
      message: `${chapters.length}개 챕터 번역을 재개합니다.`,
    });
  } catch (error) {
    console.error("[Resume API] 오류:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

// FAILED 작업의 실패 챕터만 재시도하는 핸들러
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRetryFailed(failedJob: any, userId: string) {
  const workId = failedJob.workId;

  // 실패한 챕터 번호 추출
  const chapters = parseChaptersProgress(failedJob.chaptersProgress);
  const failedChapterNums = chapters
    .filter((ch) => ch.status === "FAILED")
    .map((ch) => ch.number);

  if (failedChapterNums.length === 0) {
    return NextResponse.json({ error: "재시도할 실패 챕터가 없습니다." }, { status: 400 });
  }

  log("실패 챕터 재시도:", failedChapterNums);

  // 작품 및 설정집 조회
  const work = await db.work.findUnique({
    where: { id: workId },
    include: {
      glossary: true,
      settingBible: { include: { characters: true } },
    },
  });

  if (!work) {
    return NextResponse.json({ error: "작품을 찾을 수 없습니다." }, { status: 404 });
  }

  if (!work.settingBible || work.settingBible.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "설정집이 확정되지 않았습니다." },
      { status: 400 }
    );
  }

  if (!canTransitionWorkStatus(work.status as WorkStatus, "TRANSLATING" as WorkStatus)) {
    return NextResponse.json(
      { error: `현재 작품 상태(${work.status})에서는 번역을 재시도할 수 없습니다.` },
      { status: 400 }
    );
  }

  // 실패한 챕터 조회 (PENDING 상태여야 함 — 이전 실패 시 PENDING으로 복원됨)
  const retryChapters = await db.chapter.findMany({
    where: {
      workId,
      number: { in: failedChapterNums },
      status: { in: ["PENDING", "TRANSLATING"] },
    },
    select: { id: true, number: true, status: true },
    orderBy: { number: "asc" },
  });

  // 멈춘 TRANSLATING 챕터를 PENDING으로 리셋
  const stuck = retryChapters.filter((ch) => ch.status === "TRANSLATING");
  if (stuck.length > 0) {
    await db.chapter.updateMany({
      where: { id: { in: stuck.map((ch) => ch.id) }, status: "TRANSLATING" },
      data: { status: "PENDING" },
    });
  }

  if (retryChapters.length === 0) {
    return NextResponse.json(
      { error: "재시도할 수 있는 챕터가 없습니다 (이미 번역되었을 수 있음)." },
      { status: 400 }
    );
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

  // 새 작업 생성 (기존 실패 작업은 그대로 유지)
  const newJobId = await translationManager.createJob(
    workId,
    work.titleKo,
    retryChapters.map((ch) => ({ number: ch.number, id: ch.id })),
    userId,
    failedJob.userEmail || undefined
  );

  const chapterMeta = retryChapters.map((ch) => ({ id: ch.id, number: ch.number }));

  after(async () => {
    try {
      await processTranslation(
        newJobId,
        workId,
        chapterMeta,
        context,
        userId,
        failedJob.userEmail || undefined
      );
    } catch (error) {
      console.error("[Resume API] 실패 챕터 재시도 중 오류:", error);
      await translationManager.failJob(
        newJobId,
        error instanceof Error ? error.message : "알 수 없는 오류"
      );
    }
  });

  log("실패 챕터 재시도 시작:", newJobId);

  return NextResponse.json({
    success: true,
    jobId: newJobId,
    totalChapters: retryChapters.length,
    retryChapterNumbers: retryChapters.map((ch) => ch.number),
    message: `${retryChapters.length}개 실패 챕터를 재시도합니다.`,
  });
}

// 번역 처리 함수 (route.ts와 동일한 로직)
// 메모리 최적화: originalContent를 루프 내에서 한 건씩 DB에서 로드
async function processTranslation(
  jobId: string,
  workId: string,
  chapters: { id: string; number: number }[],
  context: TranslationContext,
  userId: string,
  userEmail?: string
) {
  log("번역 처리 시작:", { jobId, chaptersCount: chapters.length });

  await translationManager.startJob(jobId);

  const failedChapterNums: number[] = [];

  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
    const chapter = chapters[chapterIndex];

    // 일시정지 확인
    if (await translationManager.checkAndPause(jobId)) {
      log("작업이 일시정지됨, 루프 종료");
      return;
    }

    // 챕터 간 딜레이 (API 안정성)
    if (chapterIndex > 0) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 메모리 최적화: 챕터 원문을 한 건씩 DB에서 로드
    const chapterData = await db.chapter.findUnique({
      where: { id: chapter.id },
      select: { originalContent: true },
    });
    if (!chapterData) {
      log(`챕터 ${chapter.number} DB에서 찾을 수 없음, 스킵`);
      await translationManager.completeChapter(jobId, chapter.number);
      continue;
    }

    log(`챕터 ${chapter.number} 번역 시작`);

    try {
      // 중복 번역 방지: PENDING 상태인 경우에만 TRANSLATING으로 변경 (atomic update)
      const updateResult = await db.chapter.updateMany({
        where: {
          id: chapter.id,
          status: "PENDING",
        },
        data: { status: "TRANSLATING" },
      });

      if (updateResult.count === 0) {
        log(`챕터 ${chapter.number} 이미 다른 작업에서 처리 중, 스킵`);
        await translationManager.completeChapter(jobId, chapter.number);
        continue;
      }

      await translationManager.startChapter(jobId, chapter.number, 1);

      // 챕터 전체 번역 (대형 챕터는 자동 청크 분할)
      const translatedContent = await translateChapter(
        chapterData.originalContent,
        context,
        5,
        async (currentChunk, totalChunks) => {
          log(`챕터 ${chapter.number} 청크 진행: ${currentChunk}/${totalChunks}`);
          await translationManager.updateChunkProgress(jobId, chapter.number, currentChunk, totalChunks);
        }
      );

      // 번역 결과 저장
      await db.chapter.update({
        where: { id: chapter.id },
        data: {
          translatedContent,
          status: "TRANSLATED",
        },
      });

      await translationManager.completeChapter(jobId, chapter.number);
      log(`챕터 ${chapter.number} 번역 완료`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
      log(`챕터 ${chapter.number} 번역 실패:`, errorMessage);

      // 상태 되돌리기 (TRANSLATING인 경우에만)
      await db.chapter.updateMany({
        where: {
          id: chapter.id,
          status: "TRANSLATING",
        },
        data: { status: "PENDING" },
      });

      await translationManager.failChapter(jobId, chapter.number, errorMessage);
      failedChapterNums.push(chapter.number);

      // 재시도 불가능한 에러면 중단
      if (error instanceof TranslationError && !error.retryable) {
        await translationManager.failJob(jobId, errorMessage);
        throw error;
      }
    }
  }

  // 작업 완료 처리
  const hasFailed = failedChapterNums.length > 0;

  if (hasFailed) {
    const allFailed = failedChapterNums.length === chapters.length;
    const errorMsg = allFailed
      ? `전체 ${chapters.length}개 회차 번역 실패`
      : `${failedChapterNums.length}개 회차 번역 실패 (${failedChapterNums.join(", ")}화)`;
    await translationManager.failJob(jobId, errorMsg);
  } else {
    await translationManager.completeJob(jobId);
  }
  log("번역 처리 완료:", jobId);

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
      // 상태 전이 검증 후 업데이트
      const workForStatus = await db.work.findUnique({
        where: { id: workId },
        select: { status: true },
      });
      if (workForStatus && canTransitionWorkStatus(workForStatus.status as WorkStatus, "TRANSLATED" as WorkStatus)) {
        await db.work.update({
          where: { id: workId },
          data: { status: "TRANSLATED" },
        });
        log("작품 상태 업데이트: TRANSLATED (모든 회차 번역 완료)");
      } else {
        log("TRANSLATED 전이 불가, 현재 상태 유지", workForStatus?.status);
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
          log("자동 공고 초안 생성 완료:", work.titleKo);
        }
      } else {
        log("자동 공고 생성 스킵: 이미 공고 존재", existingListing.id);
      }
    } else if (totalCount > 0 && translatedCount < totalCount) {
      // 부분 번역 또는 전체 실패: TRANSLATING → BIBLE_CONFIRMED으로 복원
      const currentWork = await db.work.findUnique({
        where: { id: workId },
        select: { status: true },
      });
      if (currentWork && canTransitionWorkStatus(currentWork.status as WorkStatus, "BIBLE_CONFIRMED" as WorkStatus)) {
        await db.work.update({
          where: { id: workId },
          data: { status: "BIBLE_CONFIRMED" },
        });
        log("작품 상태 복원: BIBLE_CONFIRMED (부분 번역 완료)");
      }
    }
  } catch (e) {
    log("작품 상태 업데이트 실패 (무시):", e);
  }
}
