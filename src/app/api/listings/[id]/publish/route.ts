import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ProjectListingStatus, UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// POST - 공고 게시
export async function POST(
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
      select: {
        authorId: true,
        status: true,
        title: true,
        description: true,
        workId: true,
      },
    });

    if (!listing) {
      return NextResponse.json(
        { error: "공고를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    // Only author can publish
    if (listing.authorId !== session.user.id && (session.user.role as UserRole) !== "ADMIN") {
      return NextResponse.json(
        { error: "게시 권한이 없습니다" },
        { status: 403 }
      );
    }

    // Only draft listings can be published
    if (listing.status !== ProjectListingStatus.DRAFT) {
      return NextResponse.json(
        { error: "초안 상태의 공고만 게시할 수 있습니다" },
        { status: 400 }
      );
    }

    // Validate minimum requirements
    if (!listing.title || !listing.description || listing.description.length < 10) {
      return NextResponse.json(
        { error: "제목과 설명이 필요합니다" },
        { status: 400 }
      );
    }

    // 같은 작품에 이미 OPEN 또는 IN_PROGRESS 공고가 있는지 확인
    const existingActiveListing = await db.projectListing.findFirst({
      where: {
        workId: listing.workId,
        id: { not: id },
        status: { in: [ProjectListingStatus.OPEN, ProjectListingStatus.IN_PROGRESS] },
      },
      select: { id: true, status: true },
    });

    if (existingActiveListing) {
      return NextResponse.json(
        { error: "이 작품에 이미 진행 중인 공고가 있습니다. 기존 공고를 마감한 후 게시해주세요." },
        { status: 409 }
      );
    }

    const updated = await db.projectListing.update({
      where: { id },
      data: {
        status: ProjectListingStatus.OPEN,
        publishedAt: new Date(),
      },
      include: {
        work: {
          select: { id: true, titleKo: true },
        },
      },
    });

    return NextResponse.json({ listing: updated });
  } catch (error) {
    console.error("Error publishing listing:", error);
    return NextResponse.json(
      { error: "공고 게시에 실패했습니다" },
      { status: 500 }
    );
  }
}
