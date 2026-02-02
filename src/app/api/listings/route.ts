import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ProjectListingStatus } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET - 공개 공고 목록 (마켓플레이스)
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
    const search = searchParams.get("search");
    const sortBy = searchParams.get("sortBy") || "recent"; // recent, deadline, budget

    // Only show open listings
    const where: Record<string, unknown> = {
      status: ProjectListingStatus.OPEN,
    };

    // Genre filter (from work)
    if (genre) {
      where.work = { genres: { has: genre } };
    }

    // Search filter
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { work: { titleKo: { contains: search, mode: "insensitive" } } },
      ];
    }

    // Sort options
    let orderBy: Record<string, string>[] = [];
    switch (sortBy) {
      case "deadline":
        orderBy = [{ deadline: "asc" }];
        break;
      case "recent":
      default:
        orderBy = [{ publishedAt: "desc" }];
        break;
    }

    const [listings, total] = await Promise.all([
      db.projectListing.findMany({
        where,
        include: {
          work: {
            select: {
              id: true,
              titleKo: true,
              coverImage: true,
              genres: true,
              sourceLanguage: true,
              totalChapters: true,
            },
          },
          author: {
            select: { id: true, name: true, image: true },
          },
          _count: {
            select: { applications: true },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.projectListing.count({ where }),
    ]);

    // 목록 조회에서는 viewCount를 증가시키지 않음 (상세 조회에서만 증가)

    return NextResponse.json({
      data: listings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching listings:", error);
    return NextResponse.json(
      { error: "공고 목록을 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}
