import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, num } = await params;
    const number = parseInt(num);

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

    const chapter = await db.chapter.findUnique({
      where: {
        workId_number: { workId: id, number },
      },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "회차를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json(chapter);
  } catch (error) {
    console.error("Failed to fetch chapter:", error);
    return NextResponse.json(
      { error: "회차 정보를 불러오는데 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, num } = await params;
    const number = parseInt(num);

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

    const chapter = await db.chapter.update({
      where: {
        workId_number: { workId: id, number },
      },
      data: {
        title: body.title,
        originalContent: body.originalContent,
        translatedContent: body.translatedContent,
        editedContent: body.editedContent,
        status: body.status,
        wordCount: body.originalContent?.length ?? undefined,
      },
    });

    return NextResponse.json(chapter);
  } catch (error) {
    console.error("Failed to update chapter:", error);
    return NextResponse.json(
      { error: "회차 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, num } = await params;
    const number = parseInt(num);

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

    await db.chapter.delete({
      where: {
        workId_number: { workId: id, number },
      },
    });

    // Update total chapters count
    const totalChapters = await db.chapter.count({ where: { workId: id } });
    await db.work.update({
      where: { id },
      data: { totalChapters },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete chapter:", error);
    return NextResponse.json(
      { error: "회차 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
