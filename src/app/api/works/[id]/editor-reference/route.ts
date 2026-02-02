import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET - 에디터 참조 데이터 (용어집 + 캐릭터 + 타임라인)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId } = await params;

    // Check work exists and user has access
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

    const isOwner = work.authorId === session.user.id;
    const isEditor = work.editorId === session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    if (!isOwner && !isEditor && !isAdmin) {
      return NextResponse.json(
        { error: "접근 권한이 없습니다" },
        { status: 403 }
      );
    }

    // Fetch glossary + bible data in parallel
    const [glossary, bible] = await Promise.all([
      db.glossaryItem.findMany({
        where: { workId },
        orderBy: { original: "asc" },
        take: 200,
      }),
      db.settingBible.findUnique({
        where: { workId },
        include: {
          characters: {
            orderBy: { role: "asc" },
          },
          events: {
            orderBy: { chapterStart: "asc" },
          },
        },
      }),
    ]);

    return NextResponse.json({
      glossary,
      characters: bible?.characters || [],
      timeline: bible?.events || [],
    });
  } catch (error) {
    console.error("Error fetching editor reference:", error);
    return NextResponse.json(
      { error: "데이터를 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}
