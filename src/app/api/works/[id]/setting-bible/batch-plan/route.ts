import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOptimalBatchPlan } from "@/lib/bible-generator";

// GET /api/works/[id]/setting-bible/batch-plan - 최적 배치 계획 반환
// ?resume=true 시 이미 분석된 회차를 건너뛰고 나머지만 반환
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const resume = searchParams.get("resume") === "true";

    const work = await db.work.findUnique({
      where: { id },
      select: {
        authorId: true,
        settingBible: {
          select: { analyzedChapters: true },
        },
        chapters: {
          select: {
            number: true,
          },
          orderBy: { number: "asc" },
        },
      },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    if (work.chapters.length === 0) {
      return NextResponse.json(
        { error: "분석할 챕터가 없습니다." },
        { status: 400 }
      );
    }

    let chapterNumbers = work.chapters.map((ch) => ch.number);
    let skippedChapters = 0;

    // resume 모드: 이미 분석된 회차 건너뛰기
    if (resume && work.settingBible && work.settingBible.analyzedChapters > 0) {
      const analyzedUpTo = work.settingBible.analyzedChapters;
      const allCount = chapterNumbers.length;
      chapterNumbers = chapterNumbers.filter((n) => n > analyzedUpTo);
      skippedChapters = allCount - chapterNumbers.length;
    }

    if (chapterNumbers.length === 0) {
      return NextResponse.json({
        batches: [],
        totalBatches: 0,
        totalChapters: work.chapters.length,
        skippedChapters,
        resumedFrom: work.settingBible?.analyzedChapters ?? 0,
        alreadyComplete: true,
      });
    }

    const batches = getOptimalBatchPlan(chapterNumbers);

    return NextResponse.json({
      batches,
      totalBatches: batches.length,
      totalChapters: work.chapters.length,
      skippedChapters,
      resumedFrom: skippedChapters > 0 ? (work.settingBible?.analyzedChapters ?? 0) : 0,
    });
  } catch (error) {
    console.error("Failed to compute batch plan:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "배치 계획 생성 실패" },
      { status: 500 }
    );
  }
}
