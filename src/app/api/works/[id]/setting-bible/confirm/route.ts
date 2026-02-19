import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db, dbTransaction } from "@/lib/db";

// Vercel 서버리스 함수 타임아웃 확장 (용어집 동기화에 120초+ 소요 가능)
export const maxDuration = 300;

// POST /api/works/[id]/setting-bible/confirm - 설정집 확정 및 용어집 동기화
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
        { error: "설정집이 없습니다." },
        { status: 404 }
      );
    }

    // 카테고리 변환 맵
    const categoryMap: Record<string, string> = {
      CHARACTER: "character",
      PLACE: "place",
      ORGANIZATION: "organization",
      RANK_TITLE: "other",
      SKILL_TECHNIQUE: "skill",
      ITEM: "item",
      OTHER: "other",
    };

    const bibleId = work.settingBible!.id;
    const GLOSSARY_CHUNK_SIZE = 500;

    // 설정집 확정 + 용어집 동기화를 단일 트랜잭션으로 처리 (120초 타임아웃)
    const syncedTerms = await dbTransaction(async (tx) => {
      await tx.settingBible.update({
        where: { id: bibleId },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedBy: session.user.id,
        },
      });

      await tx.character.updateMany({
        where: { bibleId },
        data: { isConfirmed: true },
      });

      await tx.settingTerm.updateMany({
        where: { bibleId },
        data: { isConfirmed: true },
      });

      await tx.work.update({
        where: { id },
        data: { status: "BIBLE_CONFIRMED" },
      });

      // 용어집 동기화: cursor 기반 청크 처리 (5000+ 용어 대응)
      let totalSynced = 0;
      let cursor: string | undefined;

      while (true) {
        const terms = await tx.settingTerm.findMany({
          where: { bibleId },
          orderBy: { id: "asc" },
          take: GLOSSARY_CHUNK_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          select: {
            id: true,
            original: true,
            translated: true,
            category: true,
            note: true,
          },
        });

        if (terms.length === 0) break;

        cursor = terms[terms.length - 1].id;

        const originals = terms.map((t) => t.original);
        await tx.glossaryItem.deleteMany({
          where: {
            workId: id,
            original: { in: originals },
          },
        });

        await tx.glossaryItem.createMany({
          data: terms.map((term) => ({
            workId: id,
            original: term.original,
            translated: term.translated,
            category: categoryMap[term.category] || "other",
            note: term.note,
          })),
          skipDuplicates: true,
        });

        totalSynced += terms.length;

        if (terms.length < GLOSSARY_CHUNK_SIZE) break;
      }

      return totalSynced;
    }, { timeout: 120000 });

    return NextResponse.json({
      success: true,
      message: "설정집이 확정되었습니다. 이제 번역을 시작할 수 있습니다.",
      syncedTerms,
    });
  } catch (error) {
    console.error("Failed to confirm setting bible:", error);
    return NextResponse.json(
      { error: "설정집 확정에 실패했습니다." },
      { status: 500 }
    );
  }
}
