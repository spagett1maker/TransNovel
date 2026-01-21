import { NextRequest, NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { translateChapter, TranslationError, TranslationContext } from "@/lib/gemini";
import { translationManager } from "@/lib/translation-manager";

// 로깅 헬퍼
function log(...args: unknown[]) {
  console.log("[Resume API]", ...args);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return NextResponse.json({ error: "작업 ID가 필요합니다." }, { status: 400 });
    }

    log("재개 요청:", jobId);

    // 1. 일시정지된 작업 조회
    const pausedJob = await db.activeTranslationJob.findUnique({
      where: { jobId },
    });

    if (!pausedJob) {
      return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
    }

    if (pausedJob.status !== "PAUSED") {
      return NextResponse.json(
        { error: "일시정지된 작업만 재개할 수 있습니다." },
        { status: 400 }
      );
    }

    // 2. 남은 챕터 번호 조회
    const pendingChapterNumbers = await translationManager.getPendingChapterNumbers(jobId);
    log("남은 챕터:", pendingChapterNumbers);

    if (pendingChapterNumbers.length === 0) {
      // 남은 챕터가 없으면 완료 처리
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

    if (!work.settingBible || work.settingBible.status !== "CONFIRMED") {
      return NextResponse.json(
        { error: "설정집이 확정되지 않았습니다." },
        { status: 400 }
      );
    }

    // 4. 번역할 챕터 조회
    const chapters = await db.chapter.findMany({
      where: {
        workId: pausedJob.workId,
        number: { in: pendingChapterNumbers },
        status: "PENDING",
      },
      orderBy: { number: "asc" },
    });
    log("조회된 챕터:", chapters.length, "개");

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

    // 7. 백그라운드에서 번역 실행
    log("백그라운드 번역 시작 (500ms 딜레이 후)");

    setTimeout(async () => {
      try {
        await processTranslation(
          jobId,
          pausedJob.workId,
          chapters.map((ch) => ({
            id: ch.id,
            number: ch.number,
            originalContent: ch.originalContent,
          })),
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
    }, 500);

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

// 번역 처리 함수 (route.ts와 동일한 로직)
async function processTranslation(
  jobId: string,
  workId: string,
  chapters: { id: string; number: number; originalContent: string }[],
  context: TranslationContext,
  userId: string,
  userEmail?: string
) {
  log("번역 처리 시작:", { jobId, chaptersCount: chapters.length });

  await translationManager.startJob(jobId);

  for (const chapter of chapters) {
    // 일시정지 확인
    if (await translationManager.checkAndPause(jobId)) {
      log("작업이 일시정지됨, 루프 종료");
      return;
    }

    log(`챕터 ${chapter.number} 번역 시작`);
    await translationManager.startChapter(jobId, chapter.number, 1);

    try {
      // 챕터 전체 번역 (청크 분할 없음)
      const translatedContent = await translateChapter(chapter.originalContent, context);

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

      await translationManager.failChapter(jobId, chapter.number, errorMessage);

      // 재시도 불가능한 에러면 중단
      if (error instanceof TranslationError && !error.retryable) {
        await translationManager.failJob(jobId, errorMessage);
        throw error;
      }
    }
  }

  // 모든 챕터 처리 완료
  await translationManager.completeJob(jobId);
  log("번역 처리 완료:", jobId);
}
