import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db, dbTransaction } from "@/lib/db";
import {
  analyzeBatch,
} from "@/lib/bible-generator";

// Vercel 서버리스 함수 타임아웃 확장 (Pro: 최대 300초)
export const maxDuration = 300;

const requestSchema = z.object({
  chapterNumbers: z.array(z.number().int().nonnegative()),
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
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    // 작품 메타 + 설정집만 조회 (챕터 본문은 별도 조회)
    const work = await db.work.findUnique({
      where: { id },
      include: {
        settingBible: true,
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

    // 필요한 챕터만 조회 (전체 챕터 로딩 방지)
    const chaptersToAnalyze = await db.chapter.findMany({
      where: {
        workId: id,
        number: { in: chapterNumbers },
      },
      select: {
        number: true,
        originalContent: true,
      },
      orderBy: { number: "asc" },
    });

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

    const bibleId = work.settingBible!.id;
    const UPDATE_BATCH_SIZE = 50;

    // DB 업데이트: bulk fetch → partition → bulk write (N+1 방지)
    // 대규모 설정집(수천 엔티티)의 bulk 연산에 120초 타임아웃 필요
    const txResult = await dbTransaction(async (tx) => {
      // ── 캐릭터 bulk upsert ──
      const existingChars = await tx.character.findMany({
        where: { bibleId },
      });
      const charMap = new Map(existingChars.map((c) => [c.nameOriginal, c]));
      let maxSortOrder = existingChars.reduce((max, c) => Math.max(max, c.sortOrder), -1);

      const charsToUpdate: Array<{ id: string; data: Parameters<typeof tx.character.update>[0]["data"] }> = [];
      const charsToCreate: Prisma.CharacterCreateManyInput[] = [];

      for (const c of analysisResult.characters) {
        if (!c.nameOriginal) continue;
        const existing = charMap.get(c.nameOriginal);
        if (existing) {
          charsToUpdate.push({
            id: existing.id,
            data: {
              nameKorean: c.nameKorean || existing.nameKorean,
              nameHanja: c.nameHanja ?? existing.nameHanja,
              titles: [...new Set([...existing.titles, ...c.titles])],
              aliases: [...new Set([...existing.aliases, ...c.aliases])],
              personality: c.personality ?? existing.personality,
              speechStyle: c.speechStyle ?? existing.speechStyle,
              role: c.role || existing.role,
              description: c.description ?? existing.description,
              relationships: c.relationships ?? (existing.relationships as Record<string, string> | undefined),
              firstAppearance: existing.firstAppearance ?? c.firstAppearance,
            },
          });
        } else {
          maxSortOrder++;
          charsToCreate.push({
            bibleId,
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
            sortOrder: maxSortOrder,
          });
        }
      }

      if (charsToCreate.length > 0) {
        await tx.character.createMany({ data: charsToCreate, skipDuplicates: true });
      }
      for (let i = 0; i < charsToUpdate.length; i += UPDATE_BATCH_SIZE) {
        await Promise.all(
          charsToUpdate.slice(i, i + UPDATE_BATCH_SIZE).map(({ id, data }) =>
            tx.character.update({ where: { id }, data })
          )
        );
      }

      // ── 용어 bulk upsert ──
      const existingTerms = await tx.settingTerm.findMany({
        where: { bibleId },
      });
      const termMap = new Map(existingTerms.map((t) => [t.original, t]));

      const termsToUpdate: Array<{ id: string; data: Parameters<typeof tx.settingTerm.update>[0]["data"] }> = [];
      const termsToCreate: Prisma.SettingTermCreateManyInput[] = [];

      for (const t of analysisResult.terms) {
        if (!t.original) continue;
        const existing = termMap.get(t.original);
        if (existing) {
          termsToUpdate.push({
            id: existing.id,
            data: {
              translated: t.translated || existing.translated,
              category: t.category || existing.category,
              note: t.note ?? existing.note,
              context: t.context ?? existing.context,
              firstAppearance: existing.firstAppearance ?? t.firstAppearance,
            },
          });
        } else {
          termsToCreate.push({
            bibleId,
            original: t.original,
            translated: t.translated,
            category: t.category,
            note: t.note,
            context: t.context,
            firstAppearance: t.firstAppearance,
          });
        }
      }

      if (termsToCreate.length > 0) {
        await tx.settingTerm.createMany({ data: termsToCreate, skipDuplicates: true });
      }
      for (let i = 0; i < termsToUpdate.length; i += UPDATE_BATCH_SIZE) {
        await Promise.all(
          termsToUpdate.slice(i, i + UPDATE_BATCH_SIZE).map(({ id, data }) =>
            tx.settingTerm.update({ where: { id }, data })
          )
        );
      }

      // ── 이벤트 bulk upsert ──
      const existingEvents = await tx.timelineEvent.findMany({
        where: { bibleId },
      });
      const eventMap = new Map(existingEvents.map((e) => [`${e.title}_${e.chapterStart}`, e]));

      const eventsToUpdate: Array<{ id: string; data: Parameters<typeof tx.timelineEvent.update>[0]["data"] }> = [];
      const eventsToCreate: Prisma.TimelineEventCreateManyInput[] = [];

      for (const e of analysisResult.events) {
        if (!e.title || !e.description) continue;
        const key = `${e.title}_${e.chapterStart}`;
        const existing = eventMap.get(key);
        if (existing) {
          eventsToUpdate.push({
            id: existing.id,
            data: {
              description: e.description || existing.description,
              chapterEnd: e.chapterEnd ?? existing.chapterEnd,
              eventType: e.eventType || existing.eventType,
              importance: e.importance || existing.importance,
              isForeshadowing: e.isForeshadowing,
              foreshadowNote: e.foreshadowNote ?? existing.foreshadowNote,
              involvedCharacterIds: [...new Set([
                ...existing.involvedCharacterIds,
                ...e.involvedCharacters,
              ])],
            },
          });
        } else {
          eventsToCreate.push({
            bibleId,
            title: e.title,
            description: e.description,
            chapterStart: e.chapterStart,
            chapterEnd: e.chapterEnd,
            eventType: e.eventType,
            importance: e.importance,
            isForeshadowing: e.isForeshadowing,
            foreshadowNote: e.foreshadowNote,
            involvedCharacterIds: e.involvedCharacters,
          });
        }
      }

      if (eventsToCreate.length > 0) {
        await tx.timelineEvent.createMany({ data: eventsToCreate, skipDuplicates: true });
      }
      for (let i = 0; i < eventsToUpdate.length; i += UPDATE_BATCH_SIZE) {
        await Promise.all(
          eventsToUpdate.slice(i, i + UPDATE_BATCH_SIZE).map(({ id, data }) =>
            tx.timelineEvent.update({ where: { id }, data })
          )
        );
      }

      // 설정집 메타데이터 업데이트
      const newAnalyzedChapters = Math.max(
        work.settingBible!.analyzedChapters,
        chapterRange.end
      );

      await tx.settingBible.update({
        where: { id: bibleId },
        data: {
          status: "DRAFT",
          analyzedChapters: newAnalyzedChapters,
          ...(analysisResult.translationNotes
            ? { translationGuide: analysisResult.translationNotes }
            : {}),
          generatedAt: new Date(),
        },
      });

      await tx.work.update({
        where: { id },
        data: { status: "BIBLE_DRAFT" },
      });

      // 트랜잭션 내에서 카운트 계산 (별도 COUNT 쿼리 불필요)
      return {
        charCount: existingChars.length + charsToCreate.length,
        termCount: existingTerms.length + termsToCreate.length,
        eventCount: existingEvents.length + eventsToCreate.length,
        analyzedChapters: newAnalyzedChapters,
      };
    }, { timeout: 120000 });

    return NextResponse.json({
      success: true,
      analyzedChapters: txResult.analyzedChapters,
      stats: {
        characters: txResult.charCount,
        terms: txResult.termCount,
        events: txResult.eventCount,
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
