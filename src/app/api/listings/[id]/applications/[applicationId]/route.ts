import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { UserRole, ApplicationStatus, ProjectListingStatus } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canTransitionWorkStatus } from "@/lib/work-status";
import { WorkStatus } from "@prisma/client";

// GET - 지원서 상세
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; applicationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: listingId, applicationId } = await params;

    const application = await db.projectApplication.findUnique({
      where: { id: applicationId },
      include: {
        listing: {
          select: { id: true, authorId: true },
        },
        editorProfile: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
            portfolioItems: true,
          },
        },
      },
    });

    if (!application || application.listingId !== listingId) {
      return NextResponse.json(
        { error: "지원서를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Only author or applicant can see
    const isAuthor = application.listing.authorId === session.user.id;
    const isApplicant = application.editorProfile.userId === session.user.id;
    const isAdmin = (session.user.role as UserRole) === "ADMIN";

    if (!isAuthor && !isApplicant && !isAdmin) {
      return NextResponse.json(
        { error: "접근 권한이 없습니다" },
        { status: 403 }
      );
    }

    return NextResponse.json({ application });
  } catch (error) {
    console.error("Error fetching application:", error);
    return NextResponse.json(
      { error: "지원서를 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}

// PATCH - 지원서 상태 변경 (수락/거절/보류)
const updateApplicationSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
  authorNote: z.string().max(2000).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; applicationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: listingId, applicationId } = await params;

    const application = await db.projectApplication.findUnique({
      where: { id: applicationId },
      include: {
        listing: {
          select: { id: true, authorId: true, workId: true, status: true, chapterStart: true, chapterEnd: true },
        },
        editorProfile: {
          include: {
            user: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!application || application.listingId !== listingId) {
      return NextResponse.json(
        { error: "지원서를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Only author can update (except WITHDRAWN)
    const isAuthor = application.listing.authorId === session.user.id;
    const isApplicant = application.editorProfile.userId === session.user.id;
    const isAdmin = (session.user.role as UserRole) === "ADMIN";

    const body = await request.json();
    const parsed = updateApplicationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Applicants can only withdraw PENDING applications
    if (isApplicant && !isAuthor && !isAdmin) {
      if (parsed.data.status !== ApplicationStatus.WITHDRAWN) {
        return NextResponse.json(
          { error: "지원 철회만 가능합니다" },
          { status: 403 }
        );
      }
      if (application.status !== ApplicationStatus.PENDING) {
        return NextResponse.json(
          { error: "대기 중인 지원만 철회할 수 있습니다" },
          { status: 400 }
        );
      }
    } else if (!isAuthor && !isAdmin) {
      return NextResponse.json(
        { error: "수정 권한이 없습니다" },
        { status: 403 }
      );
    }

    // If accepting, create contract and update listing/work
    if (parsed.data.status === ApplicationStatus.ACCEPTED) {
      // Use interactive transaction with atomic listing claim to prevent race conditions
      const updatedApplication = await db.$transaction(async (tx) => {
        // 원자적 공고 상태 전환: OPEN → IN_PROGRESS (동시 수락 방지)
        // updateMany는 WHERE 조건을 원자적으로 평가하므로 두 요청 중 하나만 성공
        const listingClaim = await tx.projectListing.updateMany({
          where: { id: listingId, status: ProjectListingStatus.OPEN },
          data: { status: ProjectListingStatus.IN_PROGRESS },
        });

        if (listingClaim.count === 0) {
          throw new Error("이미 마감된 공고입니다");
        }

        // 같은 작품에 이미 활성 계약이 있는지 확인 (중복 계약 방지)
        const existingContract = await tx.projectContract.findFirst({
          where: { workId: application.listing.workId, isActive: true },
        });
        if (existingContract) {
          // 롤백: 공고 상태 복원
          await tx.projectListing.update({
            where: { id: listingId },
            data: { status: ProjectListingStatus.OPEN },
          });
          throw new Error("이 작품에 이미 진행 중인 계약이 있습니다");
        }

        const updated = await tx.projectApplication.update({
          where: { id: applicationId },
          data: {
            status: ApplicationStatus.ACCEPTED,
            authorNote: parsed.data.authorNote,
            reviewedAt: new Date(),
          },
        });

        // 작품 상태 검증: PROOFREADING으로 전이 가능한지 확인
        const currentWork = await tx.work.findUnique({
          where: { id: application.listing.workId },
          select: { status: true },
        });
        if (!currentWork) {
          throw new Error("작품을 찾을 수 없습니다");
        }
        if (!canTransitionWorkStatus(currentWork.status as WorkStatus, "PROOFREADING" as WorkStatus)) {
          throw new Error(`현재 작품 상태(${currentWork.status})에서는 윤문가를 배정할 수 없습니다`);
        }

        await tx.work.update({
          where: { id: application.listing.workId },
          data: {
            editorId: application.editorProfile.userId,
            status: "PROOFREADING",
          },
        });

        await tx.projectContract.create({
          data: {
            listingId,
            workId: application.listing.workId,
            authorId: application.listing.authorId,
            editorId: application.editorProfile.userId,
            startDate: new Date(),
            chapterStart: application.listing.chapterStart ?? 1,
            chapterEnd: application.listing.chapterEnd,
          },
        });

        // Reject other pending/shortlisted applications and decrement applicationCount
        const rejectedResult = await tx.projectApplication.updateMany({
          where: {
            listingId,
            id: { not: applicationId },
            status: { in: [ApplicationStatus.PENDING, ApplicationStatus.SHORTLISTED] },
          },
          data: { status: ApplicationStatus.REJECTED },
        });

        if (rejectedResult.count > 0) {
          await tx.projectListing.update({
            where: { id: listingId },
            data: { applicationCount: { decrement: rejectedResult.count } },
          });
        }

        return updated;
      });

      return NextResponse.json({ application: updatedApplication });
    }

    // Regular update (reject, shortlist, withdraw) — 트랜잭션으로 원자적 실행
    const shouldDecrement =
      parsed.data.status === ApplicationStatus.REJECTED ||
      parsed.data.status === ApplicationStatus.WITHDRAWN;

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.projectApplication.update({
        where: { id: applicationId },
        data: {
          status: parsed.data.status,
          authorNote: parsed.data.authorNote,
          reviewedAt: new Date(),
        },
      });

      if (shouldDecrement) {
        await tx.projectListing.update({
          where: { id: listingId },
          data: { applicationCount: { decrement: 1 } },
        });
      }

      return result;
    });

    return NextResponse.json({ application: updated });
  } catch (error) {
    console.error("Error updating application:", error);
    const message = error instanceof Error ? error.message : "";
    const conflictErrors = ["이미 마감된 공고입니다", "이 작품에 이미 진행 중인 계약이 있습니다"];
    const badRequestErrors = ["작품을 찾을 수 없습니다"];
    if (conflictErrors.includes(message)) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (badRequestErrors.includes(message) || message.startsWith("현재 작품 상태")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "지원서 상태 변경에 실패했습니다" },
      { status: 500 }
    );
  }
}
