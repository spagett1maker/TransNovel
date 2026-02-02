import { ChapterStatus, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
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

    // 모든 독립 쿼리를 병렬 실행
    const completedStatuses: ChapterStatus[] = [ChapterStatus.TRANSLATED, ChapterStatus.EDITED, ChapterStatus.APPROVED];

    const [statusBreakdown, works, chapterCompletions, chapters] = await Promise.all([
      // 1. 상태별 챕터 분포
      db.chapter.groupBy({
        by: ["status"],
        where: { work: workWhereClause },
        _count: true,
      }),
      // 2. 작품 목록 (챕터 개수만, 챕터 행 제거)
      db.work.findMany({
        where: workWhereClause,
        select: {
          id: true,
          titleKo: true,
          _count: { select: { chapters: true } },
        },
      }),
      // 2b. 작품별 완료 챕터 수 (groupBy로 N+1 제거)
      db.chapter.groupBy({
        by: ["workId"],
        where: {
          work: workWhereClause,
          status: { in: completedStatuses },
        },
        _count: { _all: true },
      }),
      // 3. 기간별 번역 추이용 챕터
      db.chapter.findMany({
        where: {
          work: workWhereClause,
          updatedAt: { gte: startDate },
          status: { in: completedStatuses },
        },
        select: { status: true, updatedAt: true },
      }),
    ]);

    // 작품별 완료율 계산 (인메모리 조인)
    const completionMap = new Map(chapterCompletions.map((c) => [c.workId, c._count._all]));
    const workStats = works.map((work) => {
      const completedCount = completionMap.get(work.id) || 0;
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

    // 날짜별 그룹화
    const dailyData: Record<
      string,
      { translated: number; edited: number; approved: number }
    > = {};

    const days = Math.ceil(
      (now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split("T")[0];
      dailyData[dateStr] = { translated: 0, edited: 0, approved: 0 };
    }

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

    const timeSeries = Object.entries(dailyData)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => ({
        date: date.substring(5),
        ...counts,
        total: counts.translated + counts.edited + counts.approved,
      }));

    // 요약 통계 — statusBreakdown에서 파생 (별도 count 쿼리 제거)
    const totalChapters = statusBreakdown.reduce((sum, s) => sum + s._count, 0);
    const translatedChapters = statusBreakdown
      .filter((s) => completedStatuses.includes(s.status))
      .reduce((sum, s) => sum + s._count, 0);
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
