import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { UserRole, ProjectListingStatus } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessWork } from "@/lib/permissions";

// GET - 작품별 공고 목록
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId } = await params;

    // Check work access
    const work = await db.work.findUnique({
      where: { id: workId },
      select: { id: true, authorId: true, editorId: true, titleKo: true },
    });

    if (!work) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    if (!canAccessWork(session.user.id, session.user.role as UserRole, work)) {
      return NextResponse.json(
        { error: "접근 권한이 없습니다" },
        { status: 403 }
      );
    }

    const listings = await db.projectListing.findMany({
      where: { workId },
      include: {
        _count: {
          select: { applications: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: listings, work: { titleKo: work.titleKo } });
  } catch (error) {
    console.error("Error fetching work listings:", error);
    return NextResponse.json(
      { error: "공고 목록을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}

// POST - 새 공고 생성
const createListingSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(10).max(5000),
  requirements: z.string().max(2000).optional(),
  budgetMin: z.number().int().min(0).optional(),
  budgetMax: z.number().int().min(0).optional(),
  deadline: z.string().optional(),
  chapterStart: z.number().int().min(0).optional(),
  chapterEnd: z.number().int().min(0).optional(),
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

    const { id: workId } = await params;

    // Only authors can create listings
    const userRole = session.user.role as UserRole;
    if (userRole !== "AUTHOR" && userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "작가만 공고를 작성할 수 있습니다" },
        { status: 403 }
      );
    }

    // Check work ownership
    const work = await db.work.findUnique({
      where: { id: workId },
      select: { id: true, authorId: true, titleKo: true },
    });

    if (!work) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    if (work.authorId !== session.user.id && userRole !== "ADMIN") {
      return NextResponse.json(
        { error: "본인의 작품에만 공고를 작성할 수 있습니다" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = createListingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // Validate budget
    if (parsed.data.budgetMin != null && parsed.data.budgetMax != null && parsed.data.budgetMin > parsed.data.budgetMax) {
      return NextResponse.json(
        { error: "최소 예산이 최대 예산보다 클 수 없습니다" },
        { status: 400 }
      );
    }

    // Validate chapter range
    if (parsed.data.chapterStart != null && parsed.data.chapterEnd != null && parsed.data.chapterStart > parsed.data.chapterEnd) {
      return NextResponse.json(
        { error: "시작 회차가 끝 회차보다 클 수 없습니다" },
        { status: 400 }
      );
    }

    const listing = await db.projectListing.create({
      data: {
        workId,
        authorId: session.user.id,
        title: parsed.data.title,
        description: parsed.data.description,
        requirements: parsed.data.requirements,
        budgetMin: parsed.data.budgetMin,
        budgetMax: parsed.data.budgetMax,
        deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
        chapterStart: parsed.data.chapterStart,
        chapterEnd: parsed.data.chapterEnd,
        status: ProjectListingStatus.DRAFT,
      },
      include: {
        work: {
          select: { id: true, titleKo: true },
        },
      },
    });

    return NextResponse.json({ listing }, { status: 201 });
  } catch (error) {
    console.error("Error creating listing:", error);
    return NextResponse.json(
      { error: "공고 생성에 실패했습니다" },
      { status: 500 }
    );
  }
}
