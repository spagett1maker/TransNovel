import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET - 계약 상세
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

    const contract = await db.projectContract.findUnique({
      where: { id },
      include: {
        work: {
          select: {
            id: true,
            titleKo: true,
            titleOriginal: true,
            coverImage: true,
            totalChapters: true,
            genres: true,
          },
        },
        author: {
          select: { id: true, name: true, image: true },
        },
        editor: {
          select: { id: true, name: true, image: true },
        },
        listing: {
          select: { id: true, title: true, description: true },
        },
        revisionRequests: {
          include: {
            chapter: {
              select: { id: true, number: true, title: true },
            },
            requestedBy: {
              select: { id: true, name: true },
            },
          },
          orderBy: { requestedAt: "desc" },
          take: 50,
        },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "계약을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Check access
    const isAuthor = contract.authorId === session.user.id;
    const isEditor = contract.editorId === session.user.id;
    const isAdmin = (session.user.role as UserRole) === "ADMIN";

    if (!isAuthor && !isEditor && !isAdmin) {
      return NextResponse.json(
        { error: "접근 권한이 없습니다" },
        { status: 403 }
      );
    }

    // Check if author has already submitted a review
    let hasReview = false;
    if (isAuthor && !contract.isActive) {
      const existingReview = await db.editorReview.findFirst({
        where: {
          authorId: session.user.id,
          workId: contract.workId,
        },
        select: { id: true },
      });
      hasReview = !!existingReview;
    }

    return NextResponse.json({ contract, hasReview });
  } catch (error) {
    console.error("Error fetching contract:", error);
    return NextResponse.json(
      { error: "계약을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}

// PATCH - 계약 수정/완료
const updateContractSchema = z.object({
  isActive: z.boolean().optional(),
  expectedEndDate: z.string().optional().nullable(),
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

    const contract = await db.projectContract.findUnique({
      where: { id },
      select: { authorId: true, editorId: true, listingId: true, workId: true, isActive: true, chapterStart: true, chapterEnd: true },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "계약을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Only author can complete contract
    const isAuthor = contract.authorId === session.user.id;
    const isAdmin = (session.user.role as UserRole) === "ADMIN";

    if (!isAuthor && !isAdmin) {
      return NextResponse.json(
        { error: "수정 권한이 없습니다" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = updateContractSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.isActive !== undefined) {
      updateData.isActive = parsed.data.isActive;
    }
    if (parsed.data.expectedEndDate !== undefined) {
      updateData.expectedEndDate = parsed.data.expectedEndDate
        ? new Date(parsed.data.expectedEndDate)
        : null;
    }

    // If completing contract, update listing status and editor stats atomically
    if (parsed.data.isActive === false) {
      if (!contract.isActive) {
        return NextResponse.json(
          { error: "이미 완료된 계약입니다" },
          { status: 400 }
        );
      }
      const updated = await db.$transaction(async (tx) => {
        // 계약 범위 내 모든 챕터가 APPROVED인지 확인
        const contractChapters = await tx.chapter.findMany({
          where: {
            workId: contract.workId,
            ...(contract.chapterStart || contract.chapterEnd
              ? {
                  number: {
                    ...(contract.chapterStart ? { gte: contract.chapterStart } : {}),
                    ...(contract.chapterEnd ? { lte: contract.chapterEnd } : {}),
                  },
                }
              : {}),
          },
          select: { number: true, status: true },
        });

        const unapproved = contractChapters.filter((ch) => ch.status !== "APPROVED");
        if (unapproved.length > 0) {
          const nums = unapproved.map((ch) => ch.number).join(", ");
          throw new Error(`승인되지 않은 회차가 있습니다: ${nums}화`);
        }

        // 계약 범위 내 챕터 수가 예상과 일치하는지 확인 (삭제된 챕터 검증)
        if (contract.chapterStart && contract.chapterEnd) {
          const expectedCount = contract.chapterEnd - contract.chapterStart + 1;
          if (contractChapters.length < expectedCount) {
            const existingNums = new Set(contractChapters.map((ch) => ch.number));
            const missing: number[] = [];
            for (let i = contract.chapterStart; i <= contract.chapterEnd; i++) {
              if (!existingNums.has(i)) missing.push(i);
            }
            throw new Error(`계약 범위 내 누락된 회차가 있습니다: ${missing.join(", ")}화`);
          }
        }

        await tx.projectListing.update({
          where: { id: contract.listingId },
          data: { status: "COMPLETED" },
        });

        // Increment editor's completed projects on actual completion
        await tx.editorProfile.updateMany({
          where: { userId: contract.editorId },
          data: { completedProjects: { increment: 1 } },
        });

        // 계약 완료 시 작품에서 에디터 해제 + 모든 챕터 승인됨으로 COMPLETED 전환
        await tx.work.update({
          where: { id: contract.workId },
          data: { editorId: null, status: "COMPLETED" },
        });

        return tx.projectContract.update({
          where: { id },
          data: updateData,
        });
      });

      return NextResponse.json({ contract: updated });
    }

    const updated = await db.projectContract.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ contract: updated });
  } catch (error) {
    console.error("Error updating contract:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.startsWith("승인되지 않은") || message.startsWith("계약 범위 내 누락된")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "계약 수정에 실패했습니다" },
      { status: 500 }
    );
  }
}
