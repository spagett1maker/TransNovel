import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOptimalBatchPlan } from "@/lib/bible-generator";

// GET /api/works/[id]/setting-bible/batch-plan - 최적 배치 계획 반환
export async function GET(
  _req: Request,
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
      select: {
        authorId: true,
        chapters: {
          select: {
            number: true,
            originalContent: true,
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

    // 각 챕터의 콘텐츠 길이 기반으로 최적 배치 계획 생성
    const chapterInfos = work.chapters.map((ch) => ({
      number: ch.number,
      contentLength: ch.originalContent.length,
    }));

    const batches = getOptimalBatchPlan(chapterInfos);

    return NextResponse.json({
      batches,
      totalBatches: batches.length,
      totalChapters: work.chapters.length,
    });
  } catch (error) {
    console.error("Failed to compute batch plan:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "배치 계획 생성 실패" },
      { status: 500 }
    );
  }
}
