import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOptimalBatchPlan } from "@/lib/bible-generator";

// POST /api/works/[id]/setting-bible/generate — 설정집 생성 작업 등록
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
      select: {
        authorId: true,
        settingBible: {
          select: { id: true, status: true, analyzedChapters: true },
        },
        chapters: {
          select: { number: true },
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

    // 이미 활성 작업이 있는지 확인
    const existingJob = await db.bibleGenerationJob.findFirst({
      where: {
        workId: id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });

    if (existingJob) {
      return NextResponse.json(
        {
          error: "이미 진행 중인 설정집 생성 작업이 있습니다.",
          jobId: existingJob.id,
        },
        { status: 409 }
      );
    }

    // 설정집이 없으면 생성
    let bibleId = work.settingBible?.id;
    if (!bibleId) {
      const bible = await db.settingBible.create({
        data: { workId: id },
      });
      bibleId = bible.id;
    }

    if (work.settingBible?.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "이미 확정된 설정집입니다." },
        { status: 400 }
      );
    }

    // 배치 계획 생성 (resume: 이미 분석된 챕터 건너뛰기)
    let chapterNumbers = work.chapters.map((ch) => ch.number);
    let skippedChapters = 0;
    const analyzedUpTo = work.settingBible?.analyzedChapters ?? 0;

    if (analyzedUpTo > 0) {
      const allCount = chapterNumbers.length;
      chapterNumbers = chapterNumbers.filter((n) => n > analyzedUpTo);
      skippedChapters = allCount - chapterNumbers.length;
    }

    if (chapterNumbers.length === 0) {
      return NextResponse.json({
        alreadyComplete: true,
        message: "이미 모든 회차가 분석되었습니다.",
      });
    }

    const batchPlan = getOptimalBatchPlan(chapterNumbers);

    // 작업 생성
    const job = await db.bibleGenerationJob.create({
      data: {
        workId: id,
        userId: session.user.id,
        batchPlan: batchPlan,
        totalBatches: batchPlan.length,
        analyzedChapters: analyzedUpTo,
      },
    });

    return NextResponse.json({
      jobId: job.id,
      totalBatches: batchPlan.length,
      totalChapters: chapterNumbers.length,
      skippedChapters,
    });
  } catch (error) {
    console.error("Failed to create bible generation job:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "작업 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/works/[id]/setting-bible/generate — 진행 중인 작업 취소
export async function DELETE(
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
      select: { authorId: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const activeJob = await db.bibleGenerationJob.findFirst({
      where: {
        workId: id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });

    if (!activeJob) {
      return NextResponse.json(
        { error: "취소할 작업이 없습니다." },
        { status: 404 }
      );
    }

    await db.bibleGenerationJob.update({
      where: { id: activeJob.id },
      data: {
        status: "CANCELLED",
        lockedAt: null,
        lockedBy: null,
      },
    });

    // 이미 분석된 내용이 있으면 BIBLE_DRAFT, 없으면 REGISTERED
    const bible = await db.settingBible.findUnique({
      where: { workId: id },
      select: { analyzedChapters: true },
    });

    await db.work.update({
      where: { id },
      data: {
        status: bible && bible.analyzedChapters > 0 ? "BIBLE_DRAFT" : "REGISTERED",
      },
    });

    return NextResponse.json({ success: true, jobId: activeJob.id });
  } catch (error) {
    console.error("Failed to cancel bible generation job:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "작업 취소에 실패했습니다." },
      { status: 500 }
    );
  }
}
