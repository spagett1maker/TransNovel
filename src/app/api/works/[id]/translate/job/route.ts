import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// 배치 계획 생성 (챕터 번호 배열을 배치로 분할)
// 설정집과 달리 번역은 챕터 단위로 처리 (1개 챕터 = 1개 배치)
function createBatchPlan(chapterNumbers: number[]): number[][] {
  // 각 챕터를 개별 배치로 처리 (병렬 처리는 Cron에서 담당)
  return chapterNumbers.map(num => [num]);
}

// POST /api/works/[id]/translate/job — 번역 작업 등록
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id: workId } = await params;

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const body = await req.json();
    const { chapterNumbers } = body as { chapterNumbers: number[] };

    if (!chapterNumbers || chapterNumbers.length === 0) {
      return NextResponse.json(
        { error: "번역할 회차를 선택해주세요." },
        { status: 400 }
      );
    }

    // 작품 조회 및 권한 확인
    const work = await db.work.findUnique({
      where: { id: workId },
      select: {
        authorId: true,
        titleKo: true,
        settingBible: {
          select: { status: true },
        },
      },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 설정집 확정 여부 확인
    if (!work.settingBible || work.settingBible.status !== "CONFIRMED") {
      return NextResponse.json(
        { error: "설정집을 먼저 확정해주세요." },
        { status: 400 }
      );
    }

    // 이미 활성 작업이 있는지 확인
    const existingJob = await db.activeTranslationJob.findFirst({
      where: {
        workId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });

    if (existingJob) {
      return NextResponse.json(
        {
          error: "이미 진행 중인 번역 작업이 있습니다.",
          jobId: existingJob.jobId,
        },
        { status: 409 }
      );
    }

    // 번역 대상 챕터 조회 (PENDING, TRANSLATING만)
    const chapters = await db.chapter.findMany({
      where: {
        workId,
        number: { in: chapterNumbers },
        status: { in: ["PENDING", "TRANSLATING"] },
      },
      select: { id: true, number: true },
      orderBy: { number: "asc" },
    });

    if (chapters.length === 0) {
      return NextResponse.json(
        { error: "번역할 회차가 없습니다. 이미 번역되었거나 존재하지 않습니다." },
        { status: 400 }
      );
    }

    // 멈춘 TRANSLATING 챕터를 PENDING으로 리셋
    await db.chapter.updateMany({
      where: {
        workId,
        number: { in: chapterNumbers },
        status: "TRANSLATING",
      },
      data: { status: "PENDING" },
    });

    // 배치 계획 생성
    const validChapterNumbers = chapters.map(ch => ch.number);
    const batchPlan = createBatchPlan(validChapterNumbers);

    // 챕터별 진행 상태 초기화
    const chaptersProgress = chapters.map(ch => ({
      number: ch.number,
      chapterId: ch.id,
      status: "PENDING",
      currentChunk: 0,
      totalChunks: 0,
    }));

    // 작업 생성
    const jobId = `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const job = await db.activeTranslationJob.create({
      data: {
        jobId,
        workId,
        workTitle: work.titleKo,
        userId: session.user.id,
        userEmail: session.user.email || undefined,
        status: "PENDING",
        batchPlan: batchPlan,
        totalBatches: batchPlan.length,
        totalChapters: chapters.length,
        chaptersProgress: chaptersProgress,
        maxRetries: 5,
      },
    });

    return NextResponse.json({
      jobId: job.jobId,
      totalBatches: batchPlan.length,
      totalChapters: chapters.length,
      message: "번역 작업이 등록되었습니다. 곧 시작됩니다.",
    });
  } catch (error) {
    console.error("Failed to create translation job:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "작업 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}

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
