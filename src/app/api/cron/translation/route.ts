import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  translateChapter,
  prependChapterTitle,
  extractTranslatedTitle,
} from "@/lib/gemini/translate";

// Vercel 서버리스 함수 타임아웃 확장
export const maxDuration = 300;

// 매 분 Vercel Cron에서 호출 — PENDING/IN_PROGRESS 번역 작업 처리
export async function GET() {
  try {
    const lockExpiry = new Date(Date.now() - 5 * 60 * 1000);
    const job = await db.activeTranslationJob.findFirst({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: lockExpiry } },
        ],
      },
      orderBy: { startedAt: "asc" },
    });

    if (!job) {
      return NextResponse.json({ message: "처리할 번역 작업 없음" });
    }

    // 낙관적 잠금
    const lockId = `cron-${Date.now()}`;
    const locked = await db.activeTranslationJob.updateMany({
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
      return NextResponse.json({ message: "잠금 획득 실패" });
    }

    // 배치 계획에서 현재 처리할 배치
    const batchPlan = job.batchPlan as number[][] | null;
    if (!batchPlan || job.currentBatchIndex >= batchPlan.length) {
      await db.activeTranslationJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
      return NextResponse.json({ message: "번역 작업 완료", jobId: job.id });
    }

    const chapterNumbers = batchPlan[job.currentBatchIndex];

    // 작품 정보 조회
    const work = await db.work.findUnique({
      where: { id: job.workId },
      select: {
        titleKo: true,
        ageRating: true,
        sourceLanguage: true,
        genres: true,
        synopsis: true,
        glossary: { select: { original: true, translated: true } },
        settingBible: {
          select: {
            translationGuide: true,
            characters: {
              select: {
                nameOriginal: true,
                nameKorean: true,
                role: true,
                speechStyle: true,
                personality: true,
              },
            },
            terms: { select: { original: true, translated: true } },
          },
        },
      },
    });

    if (!work) {
      await db.activeTranslationJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorMessage: "작품을 찾을 수 없습니다.", lockedAt: null, lockedBy: null },
      });
      return NextResponse.json({ error: "작품 없음" }, { status: 404 });
    }

    // TranslationContext 구성
    const glossary = [
      ...work.glossary.map((g) => ({ original: g.original, translated: g.translated })),
      ...(work.settingBible?.terms.map((t) => ({ original: t.original, translated: t.translated })) ?? []),
    ];

    const characters = work.settingBible?.characters.map((c) => ({
      nameOriginal: c.nameOriginal,
      nameKorean: c.nameKorean,
      role: c.role,
      speechStyle: c.speechStyle ?? undefined,
      personality: c.personality ?? undefined,
    })) ?? [];

    const context = {
      titleKo: work.titleKo,
      genres: work.genres,
      ageRating: work.ageRating,
      synopsis: work.synopsis,
      glossary,
      characters,
      translationGuide: work.settingBible?.translationGuide ?? undefined,
    };

    // 해당 배치의 챕터들 번역
    let completedInBatch = 0;
    let failedInBatch = 0;

    for (const chapterNum of chapterNumbers) {
      // 일시정지/취소 요청 확인
      const freshJob = await db.activeTranslationJob.findUnique({
        where: { id: job.id },
        select: { isPauseRequested: true, status: true },
      });
      if (freshJob?.isPauseRequested || freshJob?.status === "CANCELLED") {
        await db.activeTranslationJob.update({
          where: { id: job.id },
          data: { status: "PAUSED", lockedAt: null, lockedBy: null },
        });
        return NextResponse.json({ message: "일시정지됨" });
      }

      const chapter = await db.chapter.findFirst({
        where: { workId: job.workId, number: chapterNum },
        select: { id: true, number: true, title: true, originalContent: true, status: true },
      });

      if (!chapter || chapter.status !== "PENDING") {
        continue;
      }

      try {
        await db.chapter.update({
          where: { id: chapter.id },
          data: { status: "TRANSLATING" },
        });

        // 제목 마커 포함하여 번역
        const contentWithTitle = prependChapterTitle(chapter.originalContent, chapter.title);
        const rawTranslated = await translateChapter(contentWithTitle, context);
        const { translatedTitle, content: translatedBody } = extractTranslatedTitle(rawTranslated);

        await db.chapter.update({
          where: { id: chapter.id },
          data: {
            translatedContent: translatedBody,
            translatedTitle: translatedTitle || undefined,
            status: "TRANSLATED",
          },
        });

        completedInBatch++;
      } catch (err) {
        console.error(`[Cron Translation] 챕터 ${chapterNum} 번역 실패:`, err);
        await db.chapter.update({
          where: { id: chapter.id },
          data: { status: "PENDING" },
        });
        failedInBatch++;
      }
    }

    const nextBatchIndex = job.currentBatchIndex + 1;
    const isComplete = nextBatchIndex >= batchPlan.length;

    await db.activeTranslationJob.update({
      where: { id: job.id },
      data: {
        currentBatchIndex: nextBatchIndex,
        completedChapters: { increment: completedInBatch },
        failedChapters: { increment: failedInBatch },
        status: isComplete ? "COMPLETED" : "IN_PROGRESS",
        completedAt: isComplete ? new Date() : null,
        lockedAt: null,
        lockedBy: null,
      },
    });

    if (isComplete) {
      await db.work.update({
        where: { id: job.workId },
        data: { status: "TRANSLATED" },
      });
    }

    return NextResponse.json({
      jobId: job.id,
      batch: `${nextBatchIndex}/${batchPlan.length}`,
      completed: completedInBatch,
      failed: failedInBatch,
      done: isComplete,
    });
  } catch (error) {
    console.error("[Cron Translation] 오류:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "내부 오류" },
      { status: 500 }
    );
  }
}
