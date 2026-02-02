import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { UserRole, ProjectListingStatus, ApplicationStatus } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET - 지원서 목록 (작가용)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: listingId } = await params;

    const listing = await db.projectListing.findUnique({
      where: { id: listingId },
      select: { authorId: true },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "공고를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Only author can see applications
    if (listing.authorId !== session.user.id && (session.user.role as UserRole) !== "ADMIN") {
      return NextResponse.json(
        { error: "접근 권한이 없습니다" },
        { status: 403 }
      );
    }

    const applications = await db.projectApplication.findMany({
      where: { listingId },
      include: {
        editorProfile: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
            portfolioItems: {
              take: 3,
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    return NextResponse.json({ data: applications });
  } catch (error) {
    console.error("Error fetching applications:", error);
    return NextResponse.json(
      { error: "지원서를 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}

// POST - 지원하기 (윤문가용)
const createApplicationSchema = z.object({
  proposalMessage: z.string().min(10).max(5000),
  priceQuote: z.number().int().min(0).optional(),
  estimatedDays: z.number().int().min(1).optional(),
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

    const { id: listingId } = await params;

    // Only editors can apply
    const userRole = session.user.role as UserRole;
    if (userRole !== "EDITOR" && userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "윤문가만 지원할 수 있습니다" },
        { status: 403 }
      );
    }

    // Get editor profile
    const editorProfile = await db.editorProfile.findUnique({
      where: { userId: session.user.id },
    });

    if (!editorProfile) {
      return NextResponse.json(
        { error: "먼저 윤문가 프로필을 생성해주세요" },
        { status: 400 }
      );
    }

    // Check listing
    const listing = await db.projectListing.findUnique({
      where: { id: listingId },
      select: { status: true, authorId: true },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "공고를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Can't apply to own listing
    if (listing.authorId === session.user.id) {
      return NextResponse.json(
        { error: "본인의 공고에는 지원할 수 없습니다" },
        { status: 400 }
      );
    }

    // Only open listings
    if (listing.status !== ProjectListingStatus.OPEN) {
      return NextResponse.json(
        { error: "현재 지원을 받지 않는 공고입니다" },
        { status: 400 }
      );
    }

    // Check if already applied
    const existingApplication = await db.projectApplication.findUnique({
      where: {
        listingId_editorProfileId: {
          listingId,
          editorProfileId: editorProfile.id,
        },
      },
    });

    if (existingApplication) {
      return NextResponse.json(
        { error: "이미 지원한 공고입니다" },
        { status: 409 }
      );
    }

    const body = await request.json();
    const parsed = createApplicationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Create application and increment count
    const [application] = await db.$transaction([
      db.projectApplication.create({
        data: {
          listingId,
          editorProfileId: editorProfile.id,
          proposalMessage: parsed.data.proposalMessage,
          priceQuote: parsed.data.priceQuote,
          estimatedDays: parsed.data.estimatedDays,
          status: ApplicationStatus.PENDING,
        },
        include: {
          editorProfile: {
            include: {
              user: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      db.projectListing.update({
        where: { id: listingId },
        data: { applicationCount: { increment: 1 } },
      }),
    ]);

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    console.error("Error creating application:", error);
    return NextResponse.json(
      { error: "지원에 실패했습니다" },
      { status: 500 }
    );
  }
}
