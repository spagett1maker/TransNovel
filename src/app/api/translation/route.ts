import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { splitIntoChunks, translateChunks, TranslationError, ChunkTranslationResult } from "@/lib/gemini";
import { translationManager } from "@/lib/translation-manager";

interface TranslationContext {
  titleKo: string;
  genres: string[];
  ageRating: string;
  synopsis: string;
  glossary: Array<{ original: string; translated: string }>;
}

// 백그라운드 번역 처리 함수
async function processTranslation(
  jobId: string,
  chapters: Array<{ id: string; number: number; originalContent: string }>,
  context: TranslationContext
) {
  console.log("[Translation] processTranslation 시작", {
    jobId,
    chaptersCount: chapters.length,
    title: context.titleKo,
  });

  translationManager.startJob(jobId);
  console.log("[Translation] 작업 시작됨:", jobId);

  for (const chapter of chapters) {
    console.log(`[Translation] 챕터 ${chapter.number} 처리 시작`);
    try {
      // 상태 업데이트: 번역 중
      console.log(`[Translation] 챕터 ${chapter.number} DB 상태 업데이트: TRANSLATING`);
      await db.chapter.update({
        where: { id: chapter.id },
        data: { status: "TRANSLATING" },
      });

      // 청크 분할
      const chunks = splitIntoChunks(chapter.originalContent);
      console.log(`[Translation] 챕터 ${chapter.number} 청크 분할 완료:`, chunks.length, "개");

      // 챕터 시작 알림
      translationManager.startChapter(jobId, chapter.number, chunks.length);
      console.log(`[Translation] 챕터 ${chapter.number} 번역 시작 알림 전송`);

      // 청크 번역 (진행 콜백 포함)
      console.log(`[Translation] 챕터 ${chapter.number} translateChunks 호출`);
      const { results, failedChunks } = await translateChunks(
        chunks,
        context,
        (current: number, total: number, result: ChunkTranslationResult) => {
          console.log(`[Translation] 챕터 ${chapter.number} 청크 진행: ${current}/${total}, 성공: ${result.success}`);
          translationManager.updateChunkProgress(
            jobId,
            chapter.number,
            current,
            total
          );

          // 청크 실패 시 에러 보고
          if (!result.success && result.error) {
            console.warn(`[Translation] 챕터 ${chapter.number} 청크 ${result.index} 실패:`, result.error);
            translationManager.reportChunkError(
              jobId,
              chapter.number,
              result.index,
              result.error
            );
          }
        }
      );

      console.log(`[Translation] 챕터 ${chapter.number} translateChunks 완료`, {
        resultsCount: results.length,
        failedCount: failedChunks.length,
      });

      const translatedContent = results.join("\n\n");
      console.log(`[Translation] 챕터 ${chapter.number} 번역 결과 길이:`, translatedContent.length);

      // 번역 결과 저장
      console.log(`[Translation] 챕터 ${chapter.number} DB 저장 시작`);
      await db.chapter.update({
        where: { id: chapter.id },
        data: {
          translatedContent,
          status: "TRANSLATED",
        },
      });
      console.log(`[Translation] 챕터 ${chapter.number} DB 저장 완료`);

      // 챕터 완료 알림 (부분 완료 vs 완전 완료)
      if (failedChunks.length > 0) {
        translationManager.completeChapterPartial(jobId, chapter.number, failedChunks);
        console.warn(
          `[Translation] 챕터 ${chapter.number} 부분 완료 - 실패한 청크: ${failedChunks.length}개`
        );
      } else {
        translationManager.completeChapter(jobId, chapter.number);
        console.log(`[Translation] 챕터 ${chapter.number} 완전 완료`);
      }
    } catch (error) {
      console.error(`[Translation] 챕터 ${chapter.number} 번역 실패:`, error);

      // 에러 메시지 추출
      let errorMessage = "번역 실패";
      if (error instanceof TranslationError) {
        errorMessage = error.message;
        console.error(`[Translation] TranslationError:`, {
          code: (error as TranslationError).code,
          message: error.message,
          retryable: (error as TranslationError).retryable,
        });
      } else if (error instanceof Error) {
        errorMessage = error.message;
        console.error(`[Translation] Error:`, error.message);
      }

      // 상태 되돌리기
      console.log(`[Translation] 챕터 ${chapter.number} DB 상태 되돌리기: PENDING`);
      await db.chapter.update({
        where: { id: chapter.id },
        data: { status: "PENDING" },
      });

      // 챕터 실패 알림
      translationManager.failChapter(jobId, chapter.number, errorMessage);
      console.log(`[Translation] 챕터 ${chapter.number} 실패 알림 전송`);
    }
  }

  // 작업 완료
  console.log("[Translation] 모든 챕터 처리 완료, 작업 종료:", jobId);
  translationManager.completeJob(jobId);
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

    const body = await req.json();
    const { workId, chapterNumbers } = body as {
      workId: string;
      chapterNumbers: number[];
    };
    console.log("[Translation API] 요청 데이터:", { workId, chapterNumbers });

    if (!workId || !chapterNumbers || chapterNumbers.length === 0) {
      console.log("[Translation API] 잘못된 요청: workId 또는 chapterNumbers 누락");
      return NextResponse.json(
        { error: "작품 ID와 회차 번호가 필요합니다." },
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
      return NextResponse.json(
        { error: "번역할 회차가 없습니다." },
        { status: 400 }
      );
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

    // 작업 생성
    const jobId = translationManager.createJob(
      workId,
      chapters.map((ch) => ({ number: ch.number, id: ch.id }))
    );
    console.log("[Translation API] 작업 생성됨:", jobId);

    // 백그라운드에서 번역 실행 (await 하지 않음)
    // 클라이언트가 SSE 연결할 시간을 주기 위해 약간의 딜레이 추가
    console.log("[Translation API] 백그라운드 번역 시작 (500ms 딜레이 후)");
    setTimeout(() => {
      processTranslation(
        jobId,
        chapters.map((ch) => ({
          id: ch.id,
          number: ch.number,
          originalContent: ch.originalContent,
        })),
        context
      ).catch((error) => {
        console.error("[Translation API] 백그라운드 작업 실패:", error);

        let errorMessage = "번역 실패";
        if (error instanceof TranslationError) {
          errorMessage = error.message;
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        translationManager.failJob(jobId, errorMessage);
      });
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
