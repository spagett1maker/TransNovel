import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workId = searchParams.get("workId");

    if (!workId) {
      return NextResponse.json(
        { error: "작품 ID가 필요합니다." },
        { status: 400 }
      );
    }

    // 작품, 용어집, 설정집 조회
    const work = await db.work.findUnique({
      where: { id: workId },
      include: {
        glossary: true,
        settingBible: {
          include: {
            characters: true,
          },
        },
      },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    return NextResponse.json({
      titleKo: work.titleKo,
      genres: work.genres,
      ageRating: work.ageRating,
      synopsis: work.synopsis,
      glossary: work.glossary.map((g) => ({
        original: g.original,
        translated: g.translated,
        note: g.note,
      })),
      // 설정집 데이터
      characters: work.settingBible?.characters.map((c) => ({
        nameOriginal: c.nameOriginal,
        nameKorean: c.nameKorean,
        role: c.role,
        speechStyle: c.speechStyle,
        personality: c.personality,
      })),
      translationGuide: work.settingBible?.translationGuide,
      bibleStatus: work.settingBible?.status,
    });
  } catch (error) {
    console.error("[Translation Context API] 오류:", error);
    return NextResponse.json(
      { error: "컨텍스트 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
