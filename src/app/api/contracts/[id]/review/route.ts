import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// POST - 리뷰 작성 (작가만)
const createReviewSchema = z.object({
  overallRating: z.number().int().min(1).max(5),
  qualityRating: z.number().int().min(1).max(5).optional(),
  speedRating: z.number().int().min(1).max(5).optional(),
  communicationRating: z.number().int().min(1).max(5).optional(),
  content: z.string().max(2000).optional(),
  isPublic: z.boolean().default(true),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: contractId } = await params;

    const contract = await db.projectContract.findUnique({
      where: { id: contractId },
      select: {
        authorId: true,
        editorId: true,
        workId: true,
        isActive: true,
        editor: {
          select: {
            editorProfile: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!contract) {
      return NextResponse.json(
        { error: "계약을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Only author can review
    if (contract.authorId !== session.user.id && (session.user.role as UserRole) !== "ADMIN") {
      return NextResponse.json(
        { error: "작가만 리뷰를 작성할 수 있습니다" },
        { status: 403 }
      );
    }

    // Contract should be completed
    if (contract.isActive) {
      return NextResponse.json(
        { error: "완료된 계약에만 리뷰를 작성할 수 있습니다" },
        { status: 400 }
      );
    }

    const editorProfileId = contract.editor?.editorProfile?.id;
    if (!editorProfileId) {
      return NextResponse.json(
        { error: "윤문가 프로필을 찾을 수 없습니다" },
        { status: 400 }
      );
    }

    // Check if already reviewed
    const existingReview = await db.editorReview.findUnique({
      where: {
        editorProfileId_authorId_workId: {
          editorProfileId,
          authorId: session.user.id,
          workId: contract.workId,
        },
      },
    });

    if (existingReview) {
      return NextResponse.json(
        { error: "이미 리뷰를 작성했습니다" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parsed = createReviewSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Create review and update editor profile stats atomically
    const review = await db.$transaction(async (tx) => {
      const created = await tx.editorReview.create({
        data: {
          editorProfileId,
          authorId: session.user.id,
          workId: contract.workId,
          overallRating: parsed.data.overallRating,
          qualityRating: parsed.data.qualityRating,
          speedRating: parsed.data.speedRating,
          communicationRating: parsed.data.communicationRating,
          content: parsed.data.content,
          isPublic: parsed.data.isPublic,
        },
      });

      // Recalculate average rating and update stats atomically
      const { _avg } = await tx.editorReview.aggregate({
        where: { editorProfileId },
        _avg: { overallRating: true },
      });

      await tx.editorProfile.update({
        where: { id: editorProfileId },
        data: {
          totalReviews: { increment: 1 },
          ..._avg.overallRating !== null ? { averageRating: _avg.overallRating } : {},
        },
      });

      return created;
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    console.error("Error creating review:", error);
    return NextResponse.json(
      { error: "리뷰 작성에 실패했습니다" },
      { status: 500 }
    );
  }
}
