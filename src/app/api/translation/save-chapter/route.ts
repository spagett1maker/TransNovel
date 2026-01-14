import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { chapterId, translatedContent, workId } = body as {
      chapterId: string;
      translatedContent: string;
      workId: string;
    };

    if (!chapterId || !translatedContent || !workId) {
      return NextResponse.json(
        { error: "챕터 ID, 번역 내용, 작품 ID가 필요합니다." },
        { status: 400 }
      );
    }

    // 권한 확인
    const work = await db.work.findUnique({
      where: { id: workId },
      select: { authorId: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 챕터가 해당 작품에 속하는지 확인
    const chapter = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { workId: true, number: true },
    });

    if (!chapter || chapter.workId !== workId) {
      return NextResponse.json(
        { error: "챕터를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 번역 결과 저장
    await db.chapter.update({
      where: { id: chapterId },
      data: {
        translatedContent,
        status: "TRANSLATED",
        translationMeta: Prisma.JsonNull, // 메타데이터 클리어
      },
    });

    return NextResponse.json({
      success: true,
      chapterId,
      chapterNumber: chapter.number,
    });
  } catch (error) {
    console.error("[Save Chapter API] 오류:", error);
    return NextResponse.json(
      { error: "챕터 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
