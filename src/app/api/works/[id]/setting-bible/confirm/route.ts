import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db, dbTransaction } from "@/lib/db";

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
        settingBible: {
          include: {
            terms: true,
          },
        },
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

    if (work.settingBible.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "이미 확정된 설정집입니다." },
        { status: 400 }
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

    // 1. 설정집 확정 및 인물/용어 확정 처리 (30초 타임아웃)
    await dbTransaction(async (tx) => {
      await tx.settingBible.update({
        where: { id: work.settingBible!.id },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedBy: session.user.id,
        },
      });

      await tx.character.updateMany({
        where: { bibleId: work.settingBible!.id },
        data: { isConfirmed: true },
      });

      await tx.settingTerm.updateMany({
        where: { bibleId: work.settingBible!.id },
        data: { isConfirmed: true },
      });

      await tx.work.update({
        where: { id },
        data: { status: "BIBLE_CONFIRMED" },
      });
    });

    // 2. 용어집 동기화 (트랜잭션 외부에서 배치 처리)
    // 기존 용어집에서 설정집과 중복되는 항목 삭제 후 새로 생성
    const terms = work.settingBible!.terms;

    if (terms.length > 0) {
      // 기존 용어 중 설정집에 있는 것들 삭제
      const originals = terms.map((t) => t.original);
      await db.glossaryItem.deleteMany({
        where: {
          workId: id,
          original: { in: originals },
        },
      });

      // 새 용어들 일괄 생성
      await db.glossaryItem.createMany({
        data: terms.map((term) => ({
          workId: id,
          original: term.original,
          translated: term.translated,
          category: categoryMap[term.category] || "other",
          note: term.note,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: "설정집이 확정되었습니다. 이제 번역을 시작할 수 있습니다.",
      syncedTerms: work.settingBible.terms.length,
    });
  } catch (error) {
    console.error("Failed to confirm setting bible:", error);
    return NextResponse.json(
      { error: "설정집 확정에 실패했습니다." },
      { status: 500 }
    );
  }
}
