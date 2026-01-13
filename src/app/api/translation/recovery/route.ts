import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// 멈춘 번역 감지를 위한 타임아웃 (10분)
const STUCK_TIMEOUT_MS = 10 * 60 * 1000;

interface TranslationMeta {
  lastSavedChunk: number;
  totalChunks: number;
  partialResults: string[];
  startedAt: string;
}

interface StuckChapter {
  id: string;
  number: number;
  title: string | null;
  stuckSince: string;
  progressPercent: number;
  hasPartialResults: boolean;
}

interface RecoveryInfo {
  workId: string;
  workTitle: string;
  stuckChapters: StuckChapter[];
}

// GET: 멈춘 번역 작업 조회
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workId = searchParams.get("workId");

    // 사용자의 모든 작품 또는 특정 작품에서 멈춘 챕터 찾기
    const stuckChapters = await db.chapter.findMany({
      where: {
        status: "TRANSLATING",
        work: {
          authorId: session.user.id,
          ...(workId ? { id: workId } : {}),
        },
        // 마지막 업데이트가 10분 이상 지난 경우
        updatedAt: {
          lt: new Date(Date.now() - STUCK_TIMEOUT_MS),
        },
      },
      include: {
        work: {
          select: {
            id: true,
            titleKo: true,
          },
        },
      },
      orderBy: [
        { workId: "asc" },
        { number: "asc" },
      ],
    });

    // 작품별로 그룹화
    const recoveryByWork = new Map<string, RecoveryInfo>();

    for (const chapter of stuckChapters) {
      const meta = chapter.translationMeta as TranslationMeta | null;

      if (!recoveryByWork.has(chapter.workId)) {
        recoveryByWork.set(chapter.workId, {
          workId: chapter.workId,
          workTitle: chapter.work.titleKo,
          stuckChapters: [],
        });
      }

      const stuckInfo: StuckChapter = {
        id: chapter.id,
        number: chapter.number,
        title: chapter.title,
        stuckSince: chapter.updatedAt.toISOString(),
        progressPercent: meta
          ? Math.round((meta.lastSavedChunk / meta.totalChunks) * 100)
          : 0,
        hasPartialResults: meta ? meta.partialResults.length > 0 : false,
      };

      recoveryByWork.get(chapter.workId)!.stuckChapters.push(stuckInfo);
    }

    return NextResponse.json({
      recoverable: Array.from(recoveryByWork.values()),
      totalStuck: stuckChapters.length,
    });
  } catch (error) {
    console.error("[Recovery API] GET 오류:", error);
    return NextResponse.json(
      { error: "복구 가능한 작업 조회 실패" },
      { status: 500 }
    );
  }
}

// POST: 멈춘 챕터 상태 리셋 (재시도 가능하도록)
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workId, chapterIds, action } = body as {
      workId: string;
      chapterIds?: string[]; // 없으면 작품의 모든 멈춘 챕터
      action: "reset" | "clear"; // reset: 상태만 PENDING으로, clear: 메타데이터도 삭제
    };

    if (!workId) {
      return NextResponse.json({ error: "workId 필요" }, { status: 400 });
    }

    // 권한 확인
    const work = await db.work.findFirst({
      where: {
        id: workId,
        authorId: session.user.id,
      },
    });

    if (!work) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }

    // 업데이트 조건
    const whereClause: Prisma.ChapterWhereInput = {
      workId,
      status: "TRANSLATING",
      updatedAt: {
        lt: new Date(Date.now() - STUCK_TIMEOUT_MS),
      },
      ...(chapterIds ? { id: { in: chapterIds } } : {}),
    };

    // 액션에 따른 데이터 설정
    const updateData: Prisma.ChapterUpdateManyMutationInput =
      action === "clear"
        ? { status: "PENDING", translationMeta: Prisma.JsonNull }
        : { status: "PENDING" }; // reset: 메타데이터 유지 (이어서 번역 가능)

    const result = await db.chapter.updateMany({
      where: whereClause,
      data: updateData,
    });

    console.log(`[Recovery API] ${result.count}개 챕터 복구됨`, {
      workId,
      action,
      chapterIds,
    });

    return NextResponse.json({
      success: true,
      recoveredCount: result.count,
      action,
      message:
        action === "clear"
          ? `${result.count}개 챕터 초기화됨 (처음부터 다시 번역)`
          : `${result.count}개 챕터 복구됨 (이어서 번역 가능)`,
    });
  } catch (error) {
    console.error("[Recovery API] POST 오류:", error);
    return NextResponse.json(
      { error: "복구 실패" },
      { status: 500 }
    );
  }
}
