import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { UserRole, ApplicationStatus } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET - 내 지원 목록 조회 (윤문가 전용)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    // Only editors can view their applications
    if ((session.user.role as UserRole) !== UserRole.EDITOR) {
      return NextResponse.json(
        { error: "윤문가만 지원 목록을 조회할 수 있습니다" },
        { status: 403 }
      );
    }

    // Get editor profile
    const editorProfile = await db.editorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!editorProfile) {
      return NextResponse.json({
        applications: [],
        counts: {
          total: 0,
          pending: 0,
          shortlisted: 0,
          accepted: 0,
          rejected: 0,
        },
      });
    }

    // Get status filter from query params
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status") as ApplicationStatus | null;

    const whereClause: Record<string, unknown> = {
      editorProfileId: editorProfile.id,
    };

    if (statusFilter && Object.values(ApplicationStatus).includes(statusFilter)) {
      whereClause.status = statusFilter;
    }

    // Fetch applications
    const applications = await db.projectApplication.findMany({
      where: whereClause,
      include: {
        listing: {
          include: {
            work: {
              select: {
                id: true,
                titleKo: true,
                titleOriginal: true,
                coverImage: true,
                genres: true,
                totalChapters: true,
                status: true,
              },
            },
            author: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
            contract: {
              select: {
                id: true,
                isActive: true,
              },
            },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    // Get counts by status
    const countsByStatus = await db.projectApplication.groupBy({
      by: ["status"],
      where: { editorProfileId: editorProfile.id },
      _count: { status: true },
    });

    const counts = {
      total: 0,
      pending: 0,
      shortlisted: 0,
      accepted: 0,
      rejected: 0,
    };

    countsByStatus.forEach((item) => {
      const key = item.status.toLowerCase() as keyof typeof counts;
      if (key in counts) {
        counts[key] = item._count.status;
        counts.total += item._count.status;
      }
    });

    return NextResponse.json({ applications, counts });
  } catch (error) {
    console.error("Error fetching applications:", error);
    return NextResponse.json(
      { error: "지원 목록을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}

// DELETE - 지원 철회 (PENDING 상태만 가능)
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get("id");

    if (!applicationId) {
      return NextResponse.json(
        { error: "지원 ID가 필요합니다" },
        { status: 400 }
      );
    }

    // Get editor profile
    const editorProfile = await db.editorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!editorProfile) {
      return NextResponse.json(
        { error: "윤문가 프로필이 없습니다" },
        { status: 403 }
      );
    }

    // Verify application belongs to this editor
    const application = await db.projectApplication.findUnique({
      where: { id: applicationId },
      select: { editorProfileId: true, status: true, listingId: true },
    });

    if (!application) {
      return NextResponse.json(
        { error: "지원을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    if (application.editorProfileId !== editorProfile.id) {
      return NextResponse.json(
        { error: "본인의 지원만 철회할 수 있습니다" },
        { status: 403 }
      );
    }

    // Only PENDING applications can be withdrawn
    if (application.status !== ApplicationStatus.PENDING) {
      return NextResponse.json(
        { error: "대기 중인 지원만 철회할 수 있습니다" },
        { status: 400 }
      );
    }

    // 트랜잭션으로 삭제 + 카운트 차감을 원자적으로 실행
    await db.$transaction(async (tx) => {
      await tx.projectApplication.delete({
        where: { id: applicationId },
      });
      await tx.projectListing.update({
        where: { id: application.listingId },
        data: { applicationCount: { decrement: 1 } },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error withdrawing application:", error);
    return NextResponse.json(
      { error: "지원 철회에 실패했습니다" },
      { status: 500 }
    );
  }
}
