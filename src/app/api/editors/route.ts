import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { EditorAvailability } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET - 윤문가 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const genre = searchParams.get("genre");
    const availability = searchParams.get("availability") as EditorAvailability | null;
    const search = searchParams.get("search");
    const sortBy = searchParams.get("sortBy") || "rating"; // rating, reviews, projects

    const where: Record<string, unknown> = {};

    // 장르 필터
    if (genre) {
      where.specialtyGenres = { has: genre };
    }

    // 가용성 필터
    if (availability && Object.values(EditorAvailability).includes(availability)) {
      where.availability = availability;
    }

    // 검색어 필터
    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: "insensitive" } },
        { bio: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    // 정렬 설정
    let orderBy: Record<string, string>[] = [];
    switch (sortBy) {
      case "reviews":
        orderBy = [{ totalReviews: "desc" }];
        break;
      case "projects":
        orderBy = [{ completedProjects: "desc" }];
        break;
      case "rating":
      default:
        orderBy = [{ averageRating: "desc" }, { totalReviews: "desc" }];
        break;
    }

    const [editors, total] = await Promise.all([
      db.editorProfile.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
          portfolioItems: {
            take: 3,
            orderBy: { sortOrder: "asc" },
            select: { id: true, title: true, genre: true },
          },
          _count: {
            select: { reviews: true },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.editorProfile.count({ where }),
    ]);

    return NextResponse.json({
      data: editors,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching editors:", error);
    return NextResponse.json(
      { error: "윤문가 목록을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}
