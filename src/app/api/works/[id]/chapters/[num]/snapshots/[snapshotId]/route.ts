import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessWork } from "@/lib/permissions";

// GET - Get a single snapshot
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; num: string; snapshotId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId, num, snapshotId } = await params;
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

    // Get snapshot
    const snapshot = await db.chapterSnapshot.findUnique({
      where: { id: snapshotId },
      include: {
        author: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    if (!snapshot) {
      return NextResponse.json(
        { error: "스냅샷을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("Error fetching snapshot:", error);
    return NextResponse.json(
      { error: "스냅샷을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a snapshot
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; num: string; snapshotId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId, num, snapshotId } = await params;
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

    // Get snapshot to verify ownership
    const snapshot = await db.chapterSnapshot.findUnique({
      where: { id: snapshotId },
      select: { authorId: true },
    });

    if (!snapshot) {
      return NextResponse.json(
        { error: "스냅샷을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Only author or admin can delete
    if (
      snapshot.authorId !== session.user.id &&
      session.user.role !== UserRole.ADMIN
    ) {
      return NextResponse.json(
        { error: "자신이 생성한 스냅샷만 삭제할 수 있습니다" },
        { status: 403 }
      );
    }

    // Delete snapshot
    await db.chapterSnapshot.delete({
      where: { id: snapshotId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting snapshot:", error);
    return NextResponse.json(
      { error: "스냅샷 삭제에 실패했습니다" },
      { status: 500 }
    );
  }
}
