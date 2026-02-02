import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { UserRole, SnapshotType } from "@prisma/client";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessWork } from "@/lib/permissions";

// Validation schema for creating a snapshot
const createSnapshotSchema = z.object({
  name: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
});

// GET - List snapshots for a chapter
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
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const skip = (page - 1) * limit;

    // Fetch snapshots
    const [snapshots, total] = await Promise.all([
      db.chapterSnapshot.findMany({
        where: { chapterId: chapter.id },
        select: {
          id: true,
          name: true,
          description: true,
          snapshotType: true,
          status: true,
          triggerEvent: true,
          createdAt: true,
          author: {
            select: { id: true, name: true, image: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.chapterSnapshot.count({
        where: { chapterId: chapter.id },
      }),
    ]);

    return NextResponse.json({
      data: snapshots,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching snapshots:", error);
    return NextResponse.json(
      { error: "스냅샷을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}

// POST - Create a new snapshot
export async function POST(
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

    // Get chapter with full content
    const chapter = await db.chapter.findUnique({
      where: { workId_number: { workId, number: chapterNum } },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "회차를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const validatedData = createSnapshotSchema.parse(body);

    // Create snapshot (originalContent는 Chapter 테이블에서 항상 접근 가능하므로 중복 저장 방지)
    const snapshot = await db.chapterSnapshot.create({
      data: {
        chapterId: chapter.id,
        authorId: session.user.id,
        name: validatedData.name,
        description: validatedData.description,
        snapshotType: SnapshotType.MANUAL,
        originalContent: "",
        translatedContent: chapter.translatedContent,
        editedContent: chapter.editedContent,
        status: chapter.status,
      },
      include: {
        author: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    // Log activity
    await db.chapterActivity.create({
      data: {
        chapterId: chapter.id,
        actorId: session.user.id,
        activityType: "SNAPSHOT_CREATED",
        metadata: {
          snapshotId: snapshot.id,
          snapshotName: snapshot.name,
        },
        summary: `${session.user.name}님이 스냅샷을 생성했습니다${snapshot.name ? `: ${snapshot.name}` : ""}`,
      },
    });

    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }
    console.error("Error creating snapshot:", error);
    return NextResponse.json(
      { error: "스냅샷 생성에 실패했습니다" },
      { status: 500 }
    );
  }
}
