import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/works/[id]/setting-bible/status - 설정집 생성 상태 조회
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

    const work = await db.work.findUnique({
      where: { id },
      select: {
        authorId: true,
        status: true,
        _count: {
          select: { chapters: true },
        },
        settingBible: {
          select: {
            id: true,
            status: true,
            analyzedChapters: true,
            generatedAt: true,
            confirmedAt: true,
            _count: {
              select: {
                characters: true,
                terms: true,
                events: true,
              },
            },
          },
        },
      },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 활성 작업 조회 (가장 최근 것)
    const activeJob = await db.bibleGenerationJob.findFirst({
      where: { workId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        totalBatches: true,
        currentBatchIndex: true,
        analyzedChapters: true,
        errorMessage: true,
        lastError: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
    });

    if (!work.settingBible) {
      return NextResponse.json({
        exists: false,
        workStatus: work.status,
        totalChapters: work._count.chapters,
        job: activeJob ?? null,
      });
    }

    return NextResponse.json({
      exists: true,
      workStatus: work.status,
      bibleStatus: work.settingBible.status,
      totalChapters: work._count.chapters,
      analyzedChapters: work.settingBible.analyzedChapters,
      generatedAt: work.settingBible.generatedAt,
      confirmedAt: work.settingBible.confirmedAt,
      stats: {
        characters: work.settingBible._count.characters,
        terms: work.settingBible._count.terms,
        events: work.settingBible._count.events,
      },
      job: activeJob ?? null,
    });
  } catch (error) {
    console.error("Failed to fetch setting bible status:", error);
    return NextResponse.json(
      { error: "상태 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
