import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// DELETE /api/works/[id]/translate/job — 진행 중인 작업 취소
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id: workId } = await params;

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id: workId },
      select: { authorId: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const activeJob = await db.activeTranslationJob.findFirst({
      where: {
        workId,
        status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
      },
    });

    if (!activeJob) {
      return NextResponse.json(
        { error: "취소할 작업이 없습니다." },
        { status: 404 }
      );
    }

    await db.activeTranslationJob.update({
      where: { jobId: activeJob.jobId },
      data: {
        status: "CANCELLED",
        lockedAt: null,
        lockedBy: null,
      },
    });

    // 작품 상태 복원
    await db.work.update({
      where: { id: workId },
      data: { status: "BIBLE_CONFIRMED" },
    });

    return NextResponse.json({ success: true, jobId: activeJob.jobId });
  } catch (error) {
    console.error("Failed to cancel translation job:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "작업 취소에 실패했습니다." },
      { status: 500 }
    );
  }
}

// GET /api/works/[id]/translate/job — 현재 작업 상태 조회
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id: workId } = await params;

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id: workId },
      select: { authorId: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 활성 작업 조회
    const activeJob = await db.activeTranslationJob.findFirst({
      where: {
        workId,
        status: { in: ["PENDING", "IN_PROGRESS", "PAUSED"] },
      },
      select: {
        jobId: true,
        status: true,
        totalBatches: true,
        currentBatchIndex: true,
        totalChapters: true,
        completedChapters: true,
        failedChapters: true,
        failedChapterNums: true,
        errorMessage: true,
        lastError: true,
        startedAt: true,
        updatedAt: true,
      },
    });

    // 최근 완료/실패 작업 조회
    const recentJob = await db.activeTranslationJob.findFirst({
      where: {
        workId,
        status: { in: ["COMPLETED", "FAILED", "CANCELLED"] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        jobId: true,
        status: true,
        totalChapters: true,
        completedChapters: true,
        failedChapters: true,
        failedChapterNums: true,
        errorMessage: true,
        completedAt: true,
      },
    });

    return NextResponse.json({
      activeJob: activeJob || null,
      recentJob: recentJob || null,
    });
  } catch (error) {
    console.error("Failed to get translation job:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "작업 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
