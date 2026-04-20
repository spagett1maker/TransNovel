import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOptimalBatchPlan } from "@/lib/bible-generator";
import { isQueueEnabled, startBibleGeneration } from "@/lib/queue";

// Vercel 서버리스 함수 타임아웃 확장 (Pro: 최대 300초)
// SQS 큐잉이 대형 작품(200+ 배치)에서 30초 초과할 수 있음
export const maxDuration = 300;

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

    // 설정집이 없으면 생성
    let bibleId = work.settingBible?.id;
    if (!bibleId) {
      const bible = await db.settingBible.create({
        data: { workId: id },
      });
      bibleId = bible.id;
    }

    // 배치 계획 생성
    const chapterNumbers = work.chapters.map((ch) => ch.number);
    const analyzedCount = work.settingBible?.analyzedChapters ?? 0;
    const skippedChapters = 0;

    // force=true: 재분석 요청 시 완료 체크를 건너뛰고 강제 재분석
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;

    // 이미 전체 분석 완료된 경우 건너뛰기 (재분석 시에는 force=true로 우회)
    if (!force && analyzedCount > 0 && analyzedCount >= chapterNumbers.length) {
      return NextResponse.json({
        alreadyComplete: true,
        message: "이미 모든 회차가 분석되었습니다.",
      });
    }

    if (chapterNumbers.length === 0) {
      return NextResponse.json({
        alreadyComplete: true,
        message: "분석할 회차가 없습니다.",
      });
    }

    const batchPlan = getOptimalBatchPlan(chapterNumbers);

    // 고착 작업 자동 정리 (30분 이상 업데이트 없는 IN_PROGRESS 작업)
    const STUCK_JOB_TIMEOUT_MS = 30 * 60 * 1000;
    const stuckCutoff = new Date(Date.now() - STUCK_JOB_TIMEOUT_MS);
    await db.bibleGenerationJob.updateMany({
      where: {
        workId: id,
        status: "IN_PROGRESS",
        updatedAt: { lt: stuckCutoff },
      },
      data: {
        status: "FAILED",
        errorMessage: "작업이 30분 이상 응답하지 않아 자동 실패 처리되었습니다.",
      },
    });

    // 작업 생성 — Serializable 트랜잭션으로 중복 생성 방지
    const job = await db.$transaction(async (tx) => {
      const existingJob = await tx.bibleGenerationJob.findFirst({
        where: {
          workId: id,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
      });

      if (existingJob) {
        return null;
      }

      return tx.bibleGenerationJob.create({
        data: {
          workId: id,
          userId: session.user.id,
          batchPlan: batchPlan,
          totalBatches: batchPlan.length,
          analyzedChapters: 0,
          maxRetries: 5,
        },
      });
    }, { isolationLevel: "Serializable" });

    if (!job) {
      return NextResponse.json(
        { error: "이미 진행 중인 설정집 생성 작업이 있습니다." },
        { status: 409 }
      );
    }

    // 새 생성 시작 시 analyzedChapters 리셋 (배치별 increment로 다시 쌓임)
    await db.settingBible.updateMany({
      where: { workId: id },
      data: { analyzedChapters: 0 },
    });

    // SQS를 통해 전체 배치 fan-out 큐잉
    if (!isQueueEnabled()) {
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorMessage: "SQS 큐가 설정되지 않았습니다." },
      });
      return NextResponse.json(
        { error: "번역 큐가 설정되지 않았습니다. 관리자에게 문의하세요." },
        { status: 503 }
      );
    }

    try {
      await startBibleGeneration(
        job.id,
        id,
        session.user.id,
        session.user.email || undefined,
        batchPlan.length
      );
      console.log("[Bible Generate] SQS fan-out 큐잉 완료:", { jobId: job.id, totalBatches: batchPlan.length });
    } catch (sqsError) {
      console.error("[Bible Generate] SQS 큐잉 실패:", sqsError);
      await db.bibleGenerationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorMessage: sqsError instanceof Error ? sqsError.message : "SQS 큐잉 실패",
        },
      });
      return NextResponse.json(
        { error: "설정집 생성 작업 큐잉에 실패했습니다. 다시 시도해주세요." },
        { status: 500 }
      );
    }

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
