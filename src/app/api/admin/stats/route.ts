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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ADMIN만 접근 가능
    if (session.user.role !== UserRole.ADMIN) {
      return NextResponse.json({ error: "관리자만 접근할 수 있습니다." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // 에러 통계
    const errorStats = await translationLogger.getErrorStats(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    // 작업 히스토리 통계
    const [totalJobs, completedJobs, failedJobs, recentJobs] = await Promise.all([
      db.translationJobHistory.count(),
      db.translationJobHistory.count({ where: { status: "COMPLETED" } }),
      db.translationJobHistory.count({ where: { status: "FAILED" } }),
      db.translationJobHistory.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    // 사용자별 통계
    const userStats = await db.translationJobHistory.groupBy({
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
    });

    // 오늘 통계
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStats = await db.translationJobHistory.aggregate({
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
    });

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
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return NextResponse.json(
      { error: "통계 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
