import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { translationLogger } from "@/lib/translation-logger";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ADMIN만 접근 가능
    if (session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);

    // 쿼리 파라미터 파싱
    const workId = searchParams.get("workId");
    const userId = searchParams.get("userId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const result = await translationLogger.getJobHistory({
      workId: workId || undefined,
      userId: userId || undefined,
      status: status || undefined,
      page,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch job history:", error);
    return NextResponse.json(
      { error: "작업 히스토리 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
