import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { analyzeBatch } from "@/lib/bible-generator";

const UPDATE_BATCH_SIZE = 20;

interface WorkInfo {
  title: string;
  genres: string[];
  synopsis: string;
  sourceLanguage: string;
}

interface ProcessBatchResult {
  analyzedChapters: number;
  stats: {
    characters: number;
    terms: number;
    events: number;
  };
}

/**
 * 단일 배치의 챕터를 AI 분석하고 DB에 저장하는 공유 함수.
 * analyze-batch API 라우트와 cron 워커 양쪽에서 사용.
 */
export async function processBibleBatch(
  workId: string,
  bibleId: string,
  chapterNumbers: number[],
  workInfo: WorkInfo,
  currentAnalyzedChapters: number
): Promise<ProcessBatchResult> {
  // 필요한 챕터만 조회
  const chaptersToAnalyze = await db.chapter.findMany({
    where: {
      workId,
      number: { in: chapterNumbers },
    },
    select: {
      number: true,
      originalContent: true,
    },
    orderBy: { number: "asc" },
  });

  if (chaptersToAnalyze.length === 0) {
    throw new Error("분석할 회차가 없습니다.");
  }

  // AI 분석 실행
  const chapterRange = {
    start: Math.min(...chaptersToAnalyze.map((c) => c.number)),
    end: Math.max(...chaptersToAnalyze.map((c) => c.number)),
  };

  const analysisResult = await analyzeBatch(
    workInfo,
    chaptersToAnalyze,
    chapterRange
  );

  // ── 1. 캐릭터 처리 ──
  const existingChars = await db.character.findMany({
    where: { bibleId },
    select: {
      id: true,
      nameOriginal: true,
      nameKorean: true,
      nameHanja: true,
      titles: true,
      aliases: true,
      personality: true,
      speechStyle: true,
      role: true,
      description: true,
      relationships: true,
      firstAppearance: true,
      sortOrder: true,
    },
  });
  const charMap = new Map(existingChars.map((c) => [c.nameOriginal, c]));
  let maxSortOrder = existingChars.reduce((max, c) => Math.max(max, c.sortOrder), -1);

  const charsToUpdate: Array<{ id: string; data: Prisma.CharacterUpdateInput }> = [];
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
    await db.character.createMany({ data: charsToCreate, skipDuplicates: true });
  }
  for (let i = 0; i < charsToUpdate.length; i += UPDATE_BATCH_SIZE) {
    await Promise.all(
      charsToUpdate.slice(i, i + UPDATE_BATCH_SIZE).map(({ id, data }) =>
        db.character.update({ where: { id }, data })
      )
    );
  }

  // ── 2. 용어 처리 ──
  const existingTerms = await db.settingTerm.findMany({
    where: { bibleId },
    select: {
      id: true,
      original: true,
      translated: true,
      category: true,
      note: true,
      context: true,
      firstAppearance: true,
    },
  });
  const termMap = new Map(existingTerms.map((t) => [t.original, t]));

  const termsToUpdate: Array<{ id: string; data: Prisma.SettingTermUpdateInput }> = [];
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
    await db.settingTerm.createMany({ data: termsToCreate, skipDuplicates: true });
  }
  for (let i = 0; i < termsToUpdate.length; i += UPDATE_BATCH_SIZE) {
    await Promise.all(
      termsToUpdate.slice(i, i + UPDATE_BATCH_SIZE).map(({ id, data }) =>
        db.settingTerm.update({ where: { id }, data })
      )
    );
  }

  // ── 3. 이벤트 처리 ──
  const existingEvents = await db.timelineEvent.findMany({
    where: { bibleId },
    select: {
      id: true,
      title: true,
      description: true,
      chapterStart: true,
      chapterEnd: true,
      eventType: true,
      importance: true,
      isForeshadowing: true,
      foreshadowNote: true,
      involvedCharacterIds: true,
    },
  });
  const eventMap = new Map(existingEvents.map((e) => [`${e.title}_${e.chapterStart}`, e]));

  const eventsToUpdate: Array<{ id: string; data: Prisma.TimelineEventUpdateInput }> = [];
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
    await db.timelineEvent.createMany({ data: eventsToCreate, skipDuplicates: true });
  }
  for (let i = 0; i < eventsToUpdate.length; i += UPDATE_BATCH_SIZE) {
    await Promise.all(
      eventsToUpdate.slice(i, i + UPDATE_BATCH_SIZE).map(({ id, data }) =>
        db.timelineEvent.update({ where: { id }, data })
      )
    );
  }

  // ── 4. 메타데이터 업데이트 ──
  const newAnalyzedChapters = Math.max(currentAnalyzedChapters, chapterRange.end);

  await db.settingBible.update({
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

  await db.work.update({
    where: { id: workId },
    data: { status: "BIBLE_DRAFT" },
  });

  return {
    analyzedChapters: newAnalyzedChapters,
    stats: {
      characters: existingChars.length + charsToCreate.length,
      terms: existingTerms.length + termsToCreate.length,
      events: existingEvents.length + eventsToCreate.length,
    },
  };
}
