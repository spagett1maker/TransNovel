import { UserRole, LogLevel, LogCategory } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { translationLogger } from "@/lib/translation-logger";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    // ADMIN만 접근 가능
    if (session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);

    // 쿼리 파라미터 파싱
    const level = searchParams.get("level") as LogLevel | null;
    const category = searchParams.get("category") as LogCategory | null;
    const jobId = searchParams.get("jobId");
    const workId = searchParams.get("workId");
    const userId = searchParams.get("userId");
    const errorCode = searchParams.get("errorCode");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    try {
      const result = await translationLogger.getLogs({
        level: level || undefined,
        category: category || undefined,
        jobId: jobId || undefined,
        workId: workId || undefined,
        userId: userId || undefined,
        errorCode: errorCode || undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        page,
        limit,
      });

      return NextResponse.json(result);
    } catch (dbError) {
      // 테이블이 없거나 DB 에러 시 빈 결과 반환
      console.error("DB error in getLogs:", dbError);
      return NextResponse.json({ logs: [], total: 0, page: 1, totalPages: 0 });
    }
  } catch (error) {
    console.error("Failed to fetch logs:", error);
    return NextResponse.json(
      { error: "로그 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    if (session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const debugDays = parseInt(searchParams.get("debugDays") || "7", 10);
    const infoDays = parseInt(searchParams.get("infoDays") || "30", 10);
    const warnErrorDays = parseInt(searchParams.get("warnErrorDays") || "90", 10);
    const historyDays = parseInt(searchParams.get("historyDays") || "90", 10);

    const [logResult, historyCount] = await Promise.all([
      translationLogger.cleanupOldLogs({ debugDays, infoDays, warnErrorDays }),
      translationLogger.cleanupOldJobHistory(historyDays),
    ]);

    return NextResponse.json({
      message: "로그 정리 완료",
      logs: logResult,
      jobHistory: { deletedCount: historyCount },
    });
  } catch (error) {
    console.error("Failed to cleanup logs:", error);
    return NextResponse.json(
      { error: "로그 정리에 실패했습니다." },
      { status: 500 }
    );
  }
}
