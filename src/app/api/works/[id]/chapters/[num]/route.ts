import { ChapterStatus, UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessWork, canEditWork, canTransitionStatus } from "@/lib/permissions";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, num } = await params;
    const number = parseInt(num, 10);

    // NaN 또는 유효하지 않은 숫자 체크
    if (Number.isNaN(number) || number < 1) {
      return NextResponse.json({ error: "유효하지 않은 회차 번호입니다." }, { status: 400 });
    }

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true, editorId: true },
    });

    if (!work) {
      return NextResponse.json({ error: "작품을 찾을 수 없습니다." }, { status: 404 });
    }

    const userRole = session.user.role as UserRole;
    if (!canAccessWork(session.user.id, userRole, work)) {
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
    const number = parseInt(num, 10);

    // NaN 또는 유효하지 않은 숫자 체크
    if (Number.isNaN(number) || number < 1) {
      return NextResponse.json({ error: "유효하지 않은 회차 번호입니다." }, { status: 400 });
    }

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true, editorId: true },
    });

    if (!work) {
      return NextResponse.json({ error: "작품을 찾을 수 없습니다." }, { status: 404 });
    }

    const userRole = session.user.role as UserRole;
    if (!canAccessWork(session.user.id, userRole, work)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const body = await req.json();

    // 현재 회차 정보 가져오기
    const currentChapter = await db.chapter.findUnique({
      where: { workId_number: { workId: id, number } },
    });

    if (!currentChapter) {
      return NextResponse.json({ error: "회차를 찾을 수 없습니다." }, { status: 404 });
    }

    // 상태 변경 요청이 있는 경우 권한 검증
    if (body.status && body.status !== currentChapter.status) {
      const newStatus = body.status as ChapterStatus;
      if (!canTransitionStatus(userRole, currentChapter.status, newStatus)) {
        return NextResponse.json(
          { error: `${currentChapter.status}에서 ${newStatus}로 상태를 변경할 권한이 없습니다.` },
          { status: 403 }
        );
      }
    }

    // 업데이트할 데이터 구성
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.originalContent !== undefined) {
      updateData.originalContent = body.originalContent;
      updateData.wordCount = body.originalContent.length;
    }
    if (body.translatedContent !== undefined) updateData.translatedContent = body.translatedContent;
    if (body.editedContent !== undefined) updateData.editedContent = body.editedContent;
    if (body.status !== undefined) updateData.status = body.status;

    const chapter = await db.chapter.update({
      where: {
        workId_number: { workId: id, number },
      },
      data: updateData,
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
    const number = parseInt(num, 10);

    // NaN 또는 유효하지 않은 숫자 체크
    if (Number.isNaN(number) || number < 1) {
      return NextResponse.json({ error: "유효하지 않은 회차 번호입니다." }, { status: 400 });
    }

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!work) {
      return NextResponse.json({ error: "작품을 찾을 수 없습니다." }, { status: 404 });
    }

    const userRole = session.user.role as UserRole;
    if (!canEditWork(session.user.id, userRole, work)) {
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
