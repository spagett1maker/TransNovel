import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET - 윤문가 프로필 상세 조회
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

    const profile = await db.editorProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
        portfolioItems: {
          orderBy: { sortOrder: "asc" },
        },
        reviews: {
          where: { isPublic: true },
          include: {
            author: {
              select: { id: true, name: true, image: true },
            },
            work: {
              select: { id: true, titleKo: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        _count: {
          select: {
            reviews: { where: { isPublic: true } },
          },
        },
      },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "윤문가를 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Error fetching editor profile:", error);
    return NextResponse.json(
      { error: "프로필을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}
