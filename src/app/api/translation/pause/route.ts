import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { translationManager } from "@/lib/translation-manager";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await req.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "작업 ID가 필요합니다." },
        { status: 400 }
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
