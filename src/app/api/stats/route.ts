import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "30d";

    const userRole = session.user.role as UserRole;
    const isEditor = userRole === UserRole.EDITOR;

    // 기간 계산
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "1y":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // 작품 조건
    const workWhereClause = isEditor
      ? { editorId: session.user.id }
      : { authorId: session.user.id };

    // 1. 상태별 챕터 분포
    const statusBreakdown = await db.chapter.groupBy({
      by: ["status"],
      where: {
        work: workWhereClause,
      },
      _count: true,
    });

    // 2. 작품별 완료율
    const works = await db.work.findMany({
      where: workWhereClause,
      select: {
        id: true,
        titleKo: true,
        _count: {
          select: { chapters: true },
        },
        chapters: {
          select: { status: true },
        },
      },
    });

    const workStats = works.map((work) => {
      const completedStatuses = ["TRANSLATED", "EDITED", "APPROVED"];
      const completedCount = work.chapters.filter((ch) =>
        completedStatuses.includes(ch.status)
      ).length;

      return {
        id: work.id,
        title:
          work.titleKo.length > 20
            ? work.titleKo.substring(0, 20) + "..."
            : work.titleKo,
        totalChapters: work._count.chapters,
        completedChapters: completedCount,
        completionRate:
          work._count.chapters > 0
            ? Math.round((completedCount / work._count.chapters) * 100)
            : 0,
      };
    });

    // 3. 기간별 번역 추이 (일별)
    const chapters = await db.chapter.findMany({
      where: {
        work: workWhereClause,
        updatedAt: { gte: startDate },
        status: { in: ["TRANSLATED", "EDITED", "APPROVED"] },
      },
      select: {
        status: true,
        updatedAt: true,
      },
    });

    // 날짜별 그룹화
    const dailyData: Record<
      string,
      { translated: number; edited: number; approved: number }
    > = {};

    // 기간 내 모든 날짜 초기화
    const days = Math.ceil(
      (now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split("T")[0];
      dailyData[dateStr] = { translated: 0, edited: 0, approved: 0 };
    }

    // 챕터 데이터 집계
    chapters.forEach((ch) => {
      const dateStr = ch.updatedAt.toISOString().split("T")[0];
      if (dailyData[dateStr]) {
        if (ch.status === "TRANSLATED") {
          dailyData[dateStr].translated++;
        } else if (ch.status === "EDITED") {
          dailyData[dateStr].edited++;
        } else if (ch.status === "APPROVED") {
          dailyData[dateStr].approved++;
        }
      }
    });

    // 시계열 데이터로 변환 (최근 날짜 기준 정렬)
    const timeSeries = Object.entries(dailyData)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => ({
        date: date.substring(5), // MM-DD 형식
        ...counts,
        total: counts.translated + counts.edited + counts.approved,
      }));

    // 4. 요약 통계
    const totalChapters = await db.chapter.count({
      where: { work: workWhereClause },
    });

    const translatedChapters = await db.chapter.count({
      where: {
        work: workWhereClause,
        status: { in: ["TRANSLATED", "EDITED", "APPROVED"] },
      },
    });

    const recentActivity = chapters.length;

    // 상태 레이블 매핑
    const statusLabels: Record<string, string> = {
      PENDING: "대기",
      TRANSLATING: "번역중",
      TRANSLATED: "번역완료",
      REVIEWING: "검토중",
      EDITED: "윤문완료",
      APPROVED: "승인",
    };

    const formattedStatusBreakdown = statusBreakdown.map((item) => ({
      status: item.status,
      label: statusLabels[item.status] || item.status,
      count: item._count,
    }));

    return NextResponse.json({
      statusBreakdown: formattedStatusBreakdown,
      workStats: workStats.slice(0, 10), // 상위 10개만
      timeSeries: timeSeries.slice(-30), // 최근 30일만
      summary: {
        totalChapters,
        translatedChapters,
        completionRate:
          totalChapters > 0
            ? Math.round((translatedChapters / totalChapters) * 100)
            : 0,
        recentActivity,
        worksCount: works.length,
      },
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "통계 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}
