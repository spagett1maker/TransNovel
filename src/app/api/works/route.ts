import { UserRole } from "@prisma/client";
import { revalidateTag } from "next/cache";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { workSchema } from "@/lib/validations/work";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const userRole = session.user.role as UserRole;
    const userId = session.user.id;

    // URL 파라미터에서 페이지네이션 옵션 추출
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 100); // 최대 100개
    const skip = (page - 1) * limit;

    // 역할별 필터링
    let whereClause = {};
    if (userRole === UserRole.ADMIN) {
      // ADMIN: 모든 작품 조회
      whereClause = {};
    } else if (userRole === UserRole.EDITOR) {
      // EDITOR: 할당된 작품만 조회
      whereClause = { editorId: userId };
    } else {
      // AUTHOR: 본인 작품만 조회
      whereClause = { authorId: userId };
    }

    // 총 개수와 작품 목록 병렬 조회
    const [total, works] = await Promise.all([
      db.work.count({ where: whereClause }),
      db.work.findMany({
        where: whereClause,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        include: {
          creators: true,
          author: {
            select: { id: true, name: true, email: true },
          },
          editor: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { chapters: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      works,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch works:", error);
    return NextResponse.json(
      { error: "작품 목록을 불러오는데 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const userRole = session.user.role as UserRole;

    // EDITOR는 작품 생성 불가
    if (userRole === UserRole.EDITOR) {
      return NextResponse.json(
        { error: "윤문가는 작품을 등록할 수 없습니다." },
        { status: 403 }
      );
    }

    // User 존재 여부 확인 (FK 에러 방지)
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });

    if (!user) {
      console.error("User not found in database:", session.user.id);
      return NextResponse.json(
        { error: "사용자 정보를 찾을 수 없습니다. 다시 로그인해주세요." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validatedData = workSchema.parse(body);

    const work = await db.work.create({
      data: {
        titleKo: validatedData.titleKo,
        titleOriginal: validatedData.titleOriginal,
        publisher: validatedData.publisher,
        ageRating: validatedData.ageRating,
        status: "REGISTERED", // 새 프로젝트는 "등록완료" 상태로 시작
        synopsis: validatedData.synopsis,
        genres: validatedData.genres,
        // 원작 정보
        originalStatus: validatedData.originalStatus,
        sourceLanguage: validatedData.sourceLanguage,
        expectedChapters: validatedData.expectedChapters || null,
        // 원작 플랫폼
        platformName: validatedData.platformName || null,
        platformUrl: validatedData.platformUrl || null,
        authorId: session.user.id,
        creators: {
          create: validatedData.creators.map((creator) => ({
            name: creator.name,
            role: creator.role,
          })),
        },
      },
      include: {
        creators: true,
      },
    });

    revalidateTag(`user-${session.user.id}-stats`, { expire: 0 });
    return NextResponse.json(work, { status: 201 });
  } catch (error) {
    console.error("Failed to create work:", error);

    // Prisma FK 에러 처리
    if (error instanceof Error && error.message.includes("Foreign key constraint")) {
      return NextResponse.json(
        { error: "사용자 인증에 문제가 있습니다. 로그아웃 후 다시 로그인해주세요." },
        { status: 401 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "작품 등록에 실패했습니다." },
      { status: 500 }
    );
  }
}
