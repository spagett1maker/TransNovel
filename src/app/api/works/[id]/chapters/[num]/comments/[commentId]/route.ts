import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { UserRole } from "@prisma/client";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessWork } from "@/lib/permissions";

// Validation schema for updating a comment
const updateCommentSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  isResolved: z.boolean().optional(),
});

// GET - Get a single comment with replies
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; num: string; commentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId, num, commentId } = await params;
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

    // Get comment
    const comment = await db.chapterComment.findUnique({
      where: { id: commentId },
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
    });

    if (!comment) {
      return NextResponse.json(
        { error: "댓글을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    return NextResponse.json(comment);
  } catch (error) {
    console.error("Error fetching comment:", error);
    return NextResponse.json(
      { error: "댓글을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}

// PATCH - Update a comment (content or resolve status)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; num: string; commentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId, num, commentId } = await params;
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

    // Get existing comment
    const existingComment = await db.chapterComment.findUnique({
      where: { id: commentId },
      include: {
        chapter: { select: { id: true } },
      },
    });

    if (!existingComment) {
      return NextResponse.json(
        { error: "댓글을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Parse and validate body
    const body = await request.json();
    const validatedData = updateCommentSchema.parse(body);

    // Permission check for content update (only author can edit)
    if (
      validatedData.content !== undefined &&
      existingComment.authorId !== session.user.id &&
      session.user.role !== UserRole.ADMIN
    ) {
      return NextResponse.json(
        { error: "자신의 댓글만 수정할 수 있습니다" },
        { status: 403 }
      );
    }

    // Build update data
    const updateData: {
      content?: string;
      isResolved?: boolean;
      resolvedAt?: Date | null;
      resolvedById?: string | null;
    } = {};

    if (validatedData.content !== undefined) {
      updateData.content = validatedData.content;
    }

    if (validatedData.isResolved !== undefined) {
      // 댓글 해결은 작가(작품 소유자)와 관리자만 가능
      const isWorkAuthor = work.authorId === session.user.id;
      const isAdmin = session.user.role === UserRole.ADMIN;
      if (!isWorkAuthor && !isAdmin) {
        return NextResponse.json(
          { error: "댓글 해결은 작가만 할 수 있습니다" },
          { status: 403 }
        );
      }
      updateData.isResolved = validatedData.isResolved;
      if (validatedData.isResolved) {
        updateData.resolvedAt = new Date();
        updateData.resolvedById = session.user.id;
      } else {
        updateData.resolvedAt = null;
        updateData.resolvedById = null;
      }
    }

    // Update comment
    const updatedComment = await db.chapterComment.update({
      where: { id: commentId },
      data: updateData,
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
    });

    // Log activity for resolve/unresolve
    if (validatedData.isResolved !== undefined) {
      await db.chapterActivity.create({
        data: {
          chapterId: existingComment.chapter.id,
          actorId: session.user.id,
          activityType: "COMMENT_RESOLVED",
          metadata: {
            commentId,
            resolved: validatedData.isResolved,
          },
          summary: validatedData.isResolved
            ? `${session.user.name}님이 댓글을 해결함으로 표시했습니다`
            : `${session.user.name}님이 댓글을 다시 열었습니다`,
        },
      });
    }

    return NextResponse.json(updatedComment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }
    console.error("Error updating comment:", error);
    return NextResponse.json(
      { error: "댓글 수정에 실패했습니다" },
      { status: 500 }
    );
  }
}

// DELETE - Delete a comment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; num: string; commentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId, num, commentId } = await params;
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

    // Get existing comment
    const existingComment = await db.chapterComment.findUnique({
      where: { id: commentId },
      select: { authorId: true },
    });

    if (!existingComment) {
      return NextResponse.json(
        { error: "댓글을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Permission check (only author or admin can delete)
    if (
      existingComment.authorId !== session.user.id &&
      session.user.role !== UserRole.ADMIN
    ) {
      return NextResponse.json(
        { error: "자신의 댓글만 삭제할 수 있습니다" },
        { status: 403 }
      );
    }

    // Delete comment (cascade deletes replies due to onDelete: Cascade)
    await db.chapterComment.delete({
      where: { id: commentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return NextResponse.json(
      { error: "댓글 삭제에 실패했습니다" },
      { status: 500 }
    );
  }
}
