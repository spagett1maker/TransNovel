import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { processBibleBatch } from "@/lib/bible-batch-processor";

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

    const body = await req.json();
    const { chapterNumbers } = requestSchema.parse(body);

    const result = await processBibleBatch(
      id,
      work.settingBible.id,
      chapterNumbers,
      {
        title: work.titleKo,
        genres: work.genres,
        synopsis: work.synopsis,
        sourceLanguage: work.sourceLanguage,
      },
      work.settingBible.analyzedChapters
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Failed to analyze batch:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "분석에 실패했습니다." },
      { status: 500 }
    );
  }
}
