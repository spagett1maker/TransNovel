import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { translationLogger } from "@/lib/translation-logger";
import { db } from "@/lib/db";

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
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 모든 독립 쿼리를 병렬 실행
      const [errorStats, totalJobs, completedJobs, failedJobs, recentJobs, userStats, todayStats] = await Promise.all([
        translationLogger.getErrorStats(
          startDate ? new Date(startDate) : undefined,
          endDate ? new Date(endDate) : undefined
        ),
        db.translationJobHistory.count(),
        db.translationJobHistory.count({ where: { status: "COMPLETED" } }),
        db.translationJobHistory.count({ where: { status: "FAILED" } }),
        db.translationJobHistory.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        db.translationJobHistory.groupBy({
          by: ["userId", "userEmail"],
          _count: true,
          _sum: {
            completedChapters: true,
            failedChapters: true,
            totalChapters: true,
          },
          orderBy: {
            _count: {
              userId: "desc",
            },
          },
          take: 10,
        }),
        db.translationJobHistory.aggregate({
          where: {
            createdAt: { gte: today },
          },
          _count: true,
          _sum: {
            completedChapters: true,
            failedChapters: true,
            totalChapters: true,
            durationMs: true,
          },
        }),
      ]);

      return NextResponse.json({
        errors: errorStats,
        jobs: {
          total: totalJobs,
          completed: completedJobs,
          failed: failedJobs,
          successRate: totalJobs > 0 ? ((completedJobs / totalJobs) * 100).toFixed(1) : 0,
          recent: recentJobs,
        },
        users: userStats.map((u) => ({
          userId: u.userId,
          userEmail: u.userEmail,
          jobCount: u._count,
          totalChapters: u._sum.totalChapters || 0,
          completedChapters: u._sum.completedChapters || 0,
          failedChapters: u._sum.failedChapters || 0,
        })),
        today: {
          jobCount: todayStats._count,
          totalChapters: todayStats._sum.totalChapters || 0,
          completedChapters: todayStats._sum.completedChapters || 0,
          failedChapters: todayStats._sum.failedChapters || 0,
          totalDurationMs: todayStats._sum.durationMs || 0,
        },
      });
    } catch (dbError) {
      // 테이블이 없거나 DB 에러 시 빈 통계 반환
      console.error("DB error in stats:", dbError);
      return NextResponse.json({
        errors: { totalErrors: 0, byErrorCode: {}, byCategory: {}, recentErrors: [] },
        jobs: { total: 0, completed: 0, failed: 0, successRate: 0, recent: [] },
        users: [],
        today: { jobCount: 0, totalChapters: 0, completedChapters: 0, failedChapters: 0, totalDurationMs: 0 },
      });
    }
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return NextResponse.json(
      { error: "통계 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
