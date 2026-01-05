import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const chapters = await db.chapter.findMany({
      where: { workId: id },
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        wordCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(chapters);
  } catch (error) {
    console.error("Failed to fetch chapters:", error);
    return NextResponse.json(
      { error: "회차 목록을 불러오는데 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const body = await req.json();
    const { chapters } = body as {
      chapters: Array<{
        number: number;
        title?: string;
        content: string;
      }>;
    };

    if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
      return NextResponse.json(
        { error: "회차 데이터가 필요합니다." },
        { status: 400 }
      );
    }

    // Create chapters
    const createdChapters = await db.$transaction(
      chapters.map((chapter) =>
        db.chapter.upsert({
          where: {
            workId_number: {
              workId: id,
              number: chapter.number,
            },
          },
          update: {
            title: chapter.title,
            originalContent: chapter.content,
            wordCount: chapter.content.length,
          },
          create: {
            workId: id,
            number: chapter.number,
            title: chapter.title,
            originalContent: chapter.content,
            wordCount: chapter.content.length,
          },
        })
      )
    );

    // Update total chapters count
    const totalChapters = await db.chapter.count({ where: { workId: id } });
    await db.work.update({
      where: { id },
      data: { totalChapters },
    });

    return NextResponse.json(
      { created: createdChapters.length },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create chapters:", error);
    return NextResponse.json(
      { error: "회차 등록에 실패했습니다." },
      { status: 500 }
    );
  }
}
