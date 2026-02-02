import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { ProjectListingStatus, UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET - 공고 상세 조회
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id } = await params;

    const listing = await db.projectListing.findUnique({
      where: { id },
      include: {
        work: {
          select: {
            id: true,
            titleKo: true,
            titleOriginal: true,
            coverImage: true,
            genres: true,
            sourceLanguage: true,
            synopsis: true,
            totalChapters: true,
            authorId: true,
          },
        },
        author: {
          select: { id: true, name: true, image: true },
        },
        _count: {
          select: { applications: true },
        },
      },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "공고를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // 접근 권한 확인
    const isAuthor = listing.authorId === session.user.id;
    const isAdmin = (session.user.role as UserRole) === "ADMIN";

    if (!isAuthor && !isAdmin && listing.status !== ProjectListingStatus.OPEN) {
      return NextResponse.json(
        { error: "접근 권한이 없습니다" },
        { status: 403 }
      );
    }

    // Increment view count
    await db.projectListing.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    // Check if the current user (editor) has already applied
    let myApplication: { id: string; status: string } | null = null;
    let hasEditorProfile = false;
    if ((session.user.role as UserRole) === "EDITOR" || (session.user.role as UserRole) === "ADMIN") {
      const editorProfile = await db.editorProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });
      hasEditorProfile = !!editorProfile;
      if (editorProfile) {
        myApplication = await db.projectApplication.findUnique({
          where: {
            listingId_editorProfileId: {
              listingId: id,
              editorProfileId: editorProfile.id,
            },
          },
          select: { id: true, status: true },
        });
      }
    }

    return NextResponse.json({ listing, myApplication, hasEditorProfile });
  } catch (error) {
    console.error("Error fetching listing:", error);
    return NextResponse.json(
      { error: "공고를 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}

// PATCH - 공고 수정
const updateListingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(10).max(5000).optional(),
  requirements: z.string().max(2000).optional(),
  budgetMin: z.number().int().min(0).optional().nullable(),
  budgetMax: z.number().int().min(0).optional().nullable(),
  deadline: z.string().optional().nullable(),
  chapterStart: z.number().int().min(0).optional().nullable(),
  chapterEnd: z.number().int().min(0).optional().nullable(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id } = await params;

    const listing = await db.projectListing.findUnique({
      where: { id },
      select: { authorId: true, status: true },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "공고를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Only author can update
    if (listing.authorId !== session.user.id && (session.user.role as UserRole) !== "ADMIN") {
      return NextResponse.json(
        { error: "수정 권한이 없습니다" },
        { status: 403 }
      );
    }

    // Can't edit if already in progress or completed
    if (["IN_PROGRESS", "COMPLETED"].includes(listing.status)) {
      return NextResponse.json(
        { error: "진행 중이거나 완료된 공고는 수정할 수 없습니다" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = updateListingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // 범위 검증
    const budgetMin = parsed.data.budgetMin;
    const budgetMax = parsed.data.budgetMax;
    if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
      return NextResponse.json(
        { error: "최소 예산이 최대 예산보다 클 수 없습니다" },
        { status: 400 }
      );
    }

    const chapterStart = parsed.data.chapterStart;
    const chapterEnd = parsed.data.chapterEnd;
    if (chapterStart != null && chapterEnd != null && chapterStart > chapterEnd) {
      return NextResponse.json(
        { error: "시작 회차가 끝 회차보다 클 수 없습니다" },
        { status: 400 }
      );
    }

    // deadline 날짜 검증
    if (parsed.data.deadline) {
      const deadlineDate = new Date(parsed.data.deadline);
      if (isNaN(deadlineDate.getTime())) {
        return NextResponse.json(
          { error: "유효하지 않은 마감일 형식입니다" },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.requirements !== undefined) updateData.requirements = parsed.data.requirements;
    if (budgetMin !== undefined) updateData.budgetMin = budgetMin;
    if (budgetMax !== undefined) updateData.budgetMax = budgetMax;
    if (parsed.data.deadline !== undefined) {
      updateData.deadline = parsed.data.deadline ? new Date(parsed.data.deadline) : null;
    }
    if (chapterStart !== undefined) updateData.chapterStart = chapterStart;
    if (chapterEnd !== undefined) updateData.chapterEnd = chapterEnd;

    const updated = await db.projectListing.update({
      where: { id },
      data: updateData,
      include: {
        work: {
          select: { id: true, titleKo: true },
        },
      },
    });

    return NextResponse.json({ listing: updated });
  } catch (error) {
    console.error("Error updating listing:", error);
    return NextResponse.json(
      { error: "공고 수정에 실패했습니다" },
      { status: 500 }
    );
  }
}

// DELETE - 공고 삭제
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id } = await params;

    const listing = await db.projectListing.findUnique({
      where: { id },
      select: { authorId: true, status: true },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "공고를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Only author can delete
    if (listing.authorId !== session.user.id && (session.user.role as UserRole) !== "ADMIN") {
      return NextResponse.json(
        { error: "삭제 권한이 없습니다" },
        { status: 403 }
      );
    }

    // Can't delete if already in progress
    if (["IN_PROGRESS", "COMPLETED"].includes(listing.status)) {
      return NextResponse.json(
        { error: "진행 중이거나 완료된 공고는 삭제할 수 없습니다" },
        { status: 400 }
      );
    }

    // 대기 중인 지원서를 먼저 거절 처리 후 삭제
    await db.$transaction(async (tx) => {
      await tx.projectApplication.updateMany({
        where: { listingId: id, status: "PENDING" },
        data: { status: "REJECTED", authorNote: "공고가 삭제되었습니다" },
      });
      await tx.projectListing.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting listing:", error);
    return NextResponse.json(
      { error: "공고 삭제에 실패했습니다" },
      { status: 500 }
    );
  }
}
