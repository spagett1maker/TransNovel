import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { translationManager } from "@/lib/translation-manager";

export const dynamic = "force-dynamic";

// 활성 번역 작업 목록 조회
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    // 현재 사용자의 활성 작업만 조회
    const jobs = await translationManager.getActiveJobsByUserId(session.user.id);

    console.log("[Translation Active API] 작업 목록 조회:", {
      userId: session.user.id,
      totalJobs: jobs.length,
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("[Translation Active API] 오류:", error);
    return NextResponse.json(
      { error: "작업 목록 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

// 작업 삭제 (UI에서 닫기)
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");

    if (!jobId) {
      return NextResponse.json({ error: "jobId가 필요합니다." }, { status: 400 });
    }

    await translationManager.removeJob(jobId);

    console.log("[Translation Active API] 작업 삭제:", jobId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Translation Active API] 삭제 오류:", error);
    return NextResponse.json(
      { error: "작업 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
