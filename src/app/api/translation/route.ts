import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { splitIntoChunks, translateChunks } from "@/lib/gemini";
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
  translationManager.startJob(jobId);

  for (const chapter of chapters) {
    try {
      // 상태 업데이트: 번역 중
      await db.chapter.update({
        where: { id: chapter.id },
        data: { status: "TRANSLATING" },
      });

      // 청크 분할
      const chunks = splitIntoChunks(chapter.originalContent);

      // 챕터 시작 알림
      translationManager.startChapter(jobId, chapter.number, chunks.length);

      // 청크 번역 (진행 콜백 포함)
      const translatedChunks = await translateChunks(
        chunks,
        context,
        (current, total) => {
          translationManager.updateChunkProgress(
            jobId,
            chapter.number,
            current,
            total
          );
        }
      );

      const translatedContent = translatedChunks.join("\n\n");

      // 번역 결과 저장
      await db.chapter.update({
        where: { id: chapter.id },
        data: {
          translatedContent,
          status: "TRANSLATED",
        },
      });

      // 챕터 완료 알림
      translationManager.completeChapter(jobId, chapter.number);
    } catch (error) {
      console.error(`Failed to translate chapter ${chapter.number}:`, error);

      // 상태 되돌리기
      await db.chapter.update({
        where: { id: chapter.id },
        data: { status: "PENDING" },
      });

      // 챕터 실패 알림
      translationManager.failChapter(
        jobId,
        chapter.number,
        error instanceof Error ? error.message : "번역 실패"
      );
    }
  }

  // 작업 완료
  translationManager.completeJob(jobId);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workId, chapterNumbers } = body as {
      workId: string;
      chapterNumbers: number[];
    };

    if (!workId || !chapterNumbers || chapterNumbers.length === 0) {
      return NextResponse.json(
        { error: "작품 ID와 회차 번호가 필요합니다." },
        { status: 400 }
      );
    }

    // 작품과 용어집 조회
    const work = await db.work.findUnique({
      where: { id: workId },
      include: {
        glossary: true,
      },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 번역할 챕터 조회
    const chapters = await db.chapter.findMany({
      where: {
        workId,
        number: { in: chapterNumbers },
        status: "PENDING",
      },
      orderBy: { number: "asc" },
    });

    if (chapters.length === 0) {
      return NextResponse.json(
        { error: "번역할 회차가 없습니다." },
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
    };

    // 작업 생성
    const jobId = translationManager.createJob(
      workId,
      chapters.map((ch) => ({ number: ch.number, id: ch.id }))
    );

    // 백그라운드에서 번역 실행 (await 하지 않음)
    processTranslation(
      jobId,
      chapters.map((ch) => ({
        id: ch.id,
        number: ch.number,
        originalContent: ch.originalContent,
      })),
      context
    ).catch((error) => {
      console.error("Translation job failed:", error);
      translationManager.failJob(
        jobId,
        error instanceof Error ? error.message : "번역 실패"
      );
    });

    // 즉시 jobId 반환
    return NextResponse.json({
      jobId,
      status: "STARTED",
      totalChapters: chapters.length,
      message: "번역이 시작되었습니다.",
    });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "번역 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
