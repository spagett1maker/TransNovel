import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db, dbTransaction } from "@/lib/db";
import {
  analyzeBatch,
  mergeAnalysisResults,
  createEmptyAnalysisResult,
  type BibleAnalysisResult,
} from "@/lib/bible-generator";

const requestSchema = z.object({
  chapterNumbers: z.array(z.number().int().positive()),
});

// POST /api/works/[id]/setting-bible/analyze-batch - 배치 단위 분석
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      include: {
        settingBible: true,
        chapters: {
          select: {
            number: true,
            originalContent: true,
          },
        },
      },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    if (!work.settingBible) {
      return NextResponse.json(
        { error: "설정집을 먼저 생성해주세요." },
        { status: 400 }
      );
    }

    if (work.settingBible.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "이미 확정된 설정집입니다." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { chapterNumbers } = requestSchema.parse(body);

    // 요청된 챕터 가져오기
    const chaptersToAnalyze = work.chapters
      .filter((ch) => chapterNumbers.includes(ch.number))
      .sort((a, b) => a.number - b.number);

    if (chaptersToAnalyze.length === 0) {
      return NextResponse.json(
        { error: "분석할 회차가 없습니다." },
        { status: 400 }
      );
    }

    // AI 분석 실행
    const chapterRange = {
      start: Math.min(...chaptersToAnalyze.map((c) => c.number)),
      end: Math.max(...chaptersToAnalyze.map((c) => c.number)),
    };

    const analysisResult = await analyzeBatch(
      {
        title: work.titleKo,
        genres: work.genres,
        synopsis: work.synopsis,
        sourceLanguage: work.sourceLanguage,
      },
      chaptersToAnalyze,
      chapterRange
    );

    // 기존 데이터와 병합
    const existingData = await db.settingBible.findUnique({
      where: { workId: id },
      include: {
        characters: true,
        terms: true,
        events: true,
      },
    });

    // 기존 데이터를 BibleAnalysisResult 형식으로 변환
    const existingResult: BibleAnalysisResult = existingData
      ? {
          characters: existingData.characters.map((c) => ({
            nameOriginal: c.nameOriginal,
            nameKorean: c.nameKorean,
            nameHanja: c.nameHanja || undefined,
            titles: c.titles,
            aliases: c.aliases,
            personality: c.personality || undefined,
            speechStyle: c.speechStyle || undefined,
            role: c.role,
            description: c.description || undefined,
            relationships: c.relationships as Record<string, string> | undefined,
            firstAppearance: c.firstAppearance || undefined,
          })),
          terms: existingData.terms.map((t) => ({
            original: t.original,
            translated: t.translated,
            category: t.category,
            note: t.note || undefined,
            context: t.context || undefined,
            firstAppearance: t.firstAppearance || undefined,
          })),
          events: existingData.events.map((e) => ({
            title: e.title,
            description: e.description,
            chapterStart: e.chapterStart,
            chapterEnd: e.chapterEnd || undefined,
            eventType: e.eventType,
            importance: e.importance,
            isForeshadowing: e.isForeshadowing,
            foreshadowNote: e.foreshadowNote || undefined,
            involvedCharacters: e.involvedCharacterIds,
          })),
          translationNotes: existingData.translationGuide || "",
        }
      : createEmptyAnalysisResult();

    const mergedResult = mergeAnalysisResults(existingResult, analysisResult);

    // DB 업데이트 (트랜잭션 - 30초 타임아웃)
    await dbTransaction(async (tx) => {
      // 기존 데이터 삭제
      await tx.character.deleteMany({ where: { bibleId: work.settingBible!.id } });
      await tx.settingTerm.deleteMany({ where: { bibleId: work.settingBible!.id } });
      await tx.timelineEvent.deleteMany({ where: { bibleId: work.settingBible!.id } });

      // 새 데이터 삽입
      if (mergedResult.characters.length > 0) {
        await tx.character.createMany({
          data: mergedResult.characters.map((c, index) => ({
            bibleId: work.settingBible!.id,
            nameOriginal: c.nameOriginal,
            nameKorean: c.nameKorean,
            nameHanja: c.nameHanja,
            titles: c.titles,
            aliases: c.aliases,
            personality: c.personality,
            speechStyle: c.speechStyle,
            role: c.role,
            description: c.description,
            relationships: c.relationships,
            firstAppearance: c.firstAppearance,
            sortOrder: index,
          })),
        });
      }

      if (mergedResult.terms.length > 0) {
        await tx.settingTerm.createMany({
          data: mergedResult.terms.map((t) => ({
            bibleId: work.settingBible!.id,
            original: t.original,
            translated: t.translated,
            category: t.category,
            note: t.note,
            context: t.context,
            firstAppearance: t.firstAppearance,
          })),
        });
      }

      if (mergedResult.events.length > 0) {
        await tx.timelineEvent.createMany({
          data: mergedResult.events.map((e) => ({
            bibleId: work.settingBible!.id,
            title: e.title,
            description: e.description,
            chapterStart: e.chapterStart,
            chapterEnd: e.chapterEnd,
            eventType: e.eventType,
            importance: e.importance,
            isForeshadowing: e.isForeshadowing,
            foreshadowNote: e.foreshadowNote,
            involvedCharacterIds: e.involvedCharacters,
          })),
        });
      }

      // 설정집 메타데이터 업데이트
      const newAnalyzedChapters = Math.max(
        work.settingBible!.analyzedChapters,
        chapterRange.end
      );

      await tx.settingBible.update({
        where: { id: work.settingBible!.id },
        data: {
          status: "DRAFT",
          analyzedChapters: newAnalyzedChapters,
          translationGuide: mergedResult.translationNotes,
          generatedAt: new Date(),
        },
      });

      // 작품 상태 업데이트
      await tx.work.update({
        where: { id },
        data: { status: "BIBLE_DRAFT" },
      });
    });

    return NextResponse.json({
      success: true,
      analyzedChapters: chapterRange.end,
      stats: {
        characters: mergedResult.characters.length,
        terms: mergedResult.terms.length,
        events: mergedResult.events.length,
      },
    });
  } catch (error) {
    console.error("Failed to analyze batch:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "분석에 실패했습니다." },
      { status: 500 }
    );
  }
}
