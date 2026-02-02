import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { translationManager } from "@/lib/translation-manager";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { jobId } = await req.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "작업 ID가 필요합니다." },
        { status: 400 }
      );
    }

    // 작업 소유자 확인
    const job = await db.activeTranslationJob.findUnique({
      where: { jobId },
      select: { userId: true },
    });

    if (!job) {
      return NextResponse.json(
        { error: "작업을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    if (job.userId !== session.user.id) {
      return NextResponse.json(
        { error: "본인의 작업만 일시정지할 수 있습니다." },
        { status: 403 }
      );
    }

    const success = await translationManager.pauseJob(jobId);

    if (!success) {
      return NextResponse.json(
        { error: "일시정지할 수 없는 상태입니다." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "번역이 일시정지 요청되었습니다.",
    });
  } catch (error) {
    console.error("[Translation Pause API] 오류:", error);
    return NextResponse.json(
      { error: "일시정지 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
