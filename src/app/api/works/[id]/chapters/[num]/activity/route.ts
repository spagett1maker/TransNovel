import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessWork } from "@/lib/permissions";

// GET - List activities for a chapter
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId, num } = await params;
    const chapterNum = parseInt(num, 10);

    if (isNaN(chapterNum)) {
      return NextResponse.json(
        { error: "잘못된 회차 번호입니다" },
        { status: 400 }
      );
    }

    // Check work access
    const work = await db.work.findUnique({
      where: { id: workId },
      select: { id: true, authorId: true, editorId: true },
    });

    if (!work) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    if (!canAccessWork(session.user.id, session.user.role as UserRole, work)) {
      return NextResponse.json({ error: "접근 권한이 없습니다" }, { status: 403 });
    }

    // Get chapter
    const chapter = await db.chapter.findUnique({
      where: { workId_number: { workId, number: chapterNum } },
      select: { id: true },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "회차를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const cursor = searchParams.get("cursor");

    // cursor 유효성 검증
    if (cursor && isNaN(new Date(cursor).getTime())) {
      return NextResponse.json(
        { error: "잘못된 cursor 형식입니다" },
        { status: 400 }
      );
    }

    // If-Modified-Since 지원: 변경 없으면 304 반환으로 폴링 부하 감소
    const ifModifiedSince = request.headers.get("If-Modified-Since");
    if (ifModifiedSince && !cursor) {
      const sinceDate = new Date(ifModifiedSince);
      if (!isNaN(sinceDate.getTime())) {
        const newerActivity = await db.chapterActivity.findFirst({
          where: {
            chapterId: chapter.id,
            createdAt: { gt: sinceDate },
          },
          select: { id: true },
        });

        if (!newerActivity) {
          return new Response(null, { status: 304 });
        }
      }
    }

    // Fetch activities
    const activities = await db.chapterActivity.findMany({
      where: {
        chapterId: chapter.id,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: {
        actor: {
          select: { id: true, name: true, image: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    // Check if there's more
    const hasMore = activities.length > limit;
    if (hasMore) {
      activities.pop();
    }

    const nextCursor = hasMore
      ? activities[activities.length - 1].createdAt.toISOString()
      : null;

    const lastModified = activities.length > 0
      ? activities[0].createdAt.toUTCString()
      : new Date().toUTCString();

    return NextResponse.json(
      { data: activities, nextCursor, hasMore },
      { headers: { "Last-Modified": lastModified } }
    );
  } catch (error) {
    console.error("Error fetching activities:", error);
    return NextResponse.json(
      { error: "활동을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}
