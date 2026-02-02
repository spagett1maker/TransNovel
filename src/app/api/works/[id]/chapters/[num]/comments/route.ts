import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessWork } from "@/lib/permissions";

// Validation schema for creating a comment
const createCommentSchema = z.object({
  content: z.string().min(1, "댓글 내용을 입력해주세요").max(5000),
  textRange: z
    .object({
      from: z.number(),
      to: z.number(),
    })
    .optional(),
  quotedText: z.string().optional(),
  parentId: z.string().optional(),
});

// GET - List comments for a chapter
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
    const includeResolved = searchParams.get("includeResolved") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const cursor = searchParams.get("cursor");

    // cursor 유효성 검증
    if (cursor && isNaN(new Date(cursor).getTime())) {
      return NextResponse.json(
        { error: "잘못된 cursor 형식입니다" },
        { status: 400 }
      );
    }

    // Fetch comments (only top-level, replies are nested)
    const comments = await db.chapterComment.findMany({
      where: {
        chapterId: chapter.id,
        parentId: null,
        ...(includeResolved ? {} : { isResolved: false }),
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: {
        author: {
          select: { id: true, name: true, image: true, role: true },
        },
        resolvedBy: {
          select: { id: true, name: true },
        },
        replies: {
          include: {
            author: {
              select: { id: true, name: true, image: true, role: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = comments.length > limit;
    if (hasMore) {
      comments.pop();
    }

    const nextCursor = hasMore
      ? comments[comments.length - 1].createdAt.toISOString()
      : null;

    // 미해결/해결됨 카운트 (필터와 무관하게 항상 반환)
    const [unresolvedCount, resolvedCount] = await Promise.all([
      db.chapterComment.count({
        where: { chapterId: chapter.id, parentId: null, isResolved: false },
      }),
      db.chapterComment.count({
        where: { chapterId: chapter.id, parentId: null, isResolved: true },
      }),
    ]);

    return NextResponse.json({ data: comments, nextCursor, hasMore, unresolvedCount, resolvedCount });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json(
      { error: "댓글을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}

// POST - Create a new comment
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

    // Parse and validate body
    const body = await request.json();
    const validatedData = createCommentSchema.parse(body);

    // If it's a reply, verify parent exists
    if (validatedData.parentId) {
      const parentComment = await db.chapterComment.findUnique({
        where: { id: validatedData.parentId },
        select: { id: true, chapterId: true },
      });

      if (!parentComment || parentComment.chapterId !== chapter.id) {
        return NextResponse.json(
          { error: "상위 댓글을 찾을 수 없습니다" },
          { status: 404 }
        );
      }
    }

    // Create comment
    const comment = await db.chapterComment.create({
      data: {
        chapterId: chapter.id,
        authorId: session.user.id,
        content: validatedData.content,
        textRange: validatedData.textRange || undefined,
        quotedText: validatedData.quotedText,
        parentId: validatedData.parentId,
      },
      include: {
        author: {
          select: { id: true, name: true, image: true, role: true },
        },
        replies: {
          include: {
            author: {
              select: { id: true, name: true, image: true, role: true },
            },
          },
        },
      },
    });

    // Log activity
    await db.chapterActivity.create({
      data: {
        chapterId: chapter.id,
        actorId: session.user.id,
        activityType: validatedData.parentId ? "COMMENT_REPLIED" : "COMMENT_ADDED",
        metadata: {
          commentId: comment.id,
          parentId: validatedData.parentId,
        },
        summary: validatedData.parentId
          ? `${session.user.name}님이 답글을 남겼습니다`
          : `${session.user.name}님이 댓글을 남겼습니다`,
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }
    console.error("Error creating comment:", error);
    return NextResponse.json(
      { error: "댓글 작성에 실패했습니다" },
      { status: 500 }
    );
  }
}
