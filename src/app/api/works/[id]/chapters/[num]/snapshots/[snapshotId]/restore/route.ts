import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { UserRole, SnapshotType } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db, dbTransaction } from "@/lib/db";
import { canAccessWork, canEditChapterContent } from "@/lib/permissions";

// POST - Restore chapter to a snapshot
export async function POST(
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

    // Get chapter
    const chapter = await db.chapter.findUnique({
      where: { workId_number: { workId, number: chapterNum } },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "회차를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Get snapshot
    const snapshot = await db.chapterSnapshot.findUnique({
      where: { id: snapshotId },
    });

    if (!snapshot) {
      return NextResponse.json(
        { error: "스냅샷을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // 읽기 전용 상태에서 스냅샷 복원 차단
    const userRole = session.user.role as UserRole;
    if (!canEditChapterContent(userRole, chapter.status)) {
      return NextResponse.json(
        { error: "현재 상태에서는 스냅샷을 복원할 권한이 없습니다" },
        { status: 403 }
      );
    }

    // Verify snapshot belongs to this chapter
    if (snapshot.chapterId !== chapter.id) {
      return NextResponse.json(
        { error: "스냅샷이 현재 회차에 속하지 않습니다" },
        { status: 400 }
      );
    }

    // 트랜잭션으로 백업 생성 + 복원 + 활동 기록을 원자적으로 실행
    const updatedChapter = await dbTransaction(async (tx) => {
      // 1. 복원 전 백업 스냅샷 생성
      await tx.chapterSnapshot.create({
        data: {
          chapterId: chapter.id,
          authorId: session.user.id,
          name: `복원 전 백업`,
          snapshotType: SnapshotType.STATUS_CHANGE,
          originalContent: chapter.originalContent,
          translatedContent: chapter.translatedContent,
          editedContent: chapter.editedContent,
          status: chapter.status,
          triggerEvent: `restore_from_${snapshotId}`,
        },
      });

      // 2. 챕터 복원
      const restored = await tx.chapter.update({
        where: { id: chapter.id },
        data: {
          translatedContent: snapshot.translatedContent,
          editedContent: snapshot.editedContent,
          status: snapshot.status,
          lastEditedById: session.user.id,
          lastEditedAt: new Date(),
        },
      });

      // 3. 활동 기록
      await tx.chapterActivity.create({
        data: {
          chapterId: chapter.id,
          actorId: session.user.id,
          activityType: "SNAPSHOT_RESTORED",
          metadata: {
            snapshotId: snapshot.id,
            snapshotName: snapshot.name,
            snapshotDate: snapshot.createdAt,
          },
          summary: `${session.user.name}님이 스냅샷으로 복원했습니다${snapshot.name ? `: ${snapshot.name}` : ""}`,
        },
      });

      return restored;
    });

    return NextResponse.json({
      success: true,
      chapter: updatedChapter,
    });
  } catch (error) {
    console.error("Error restoring snapshot:", error);
    return NextResponse.json(
      { error: "스냅샷 복원에 실패했습니다" },
      { status: 500 }
    );
  }
}
