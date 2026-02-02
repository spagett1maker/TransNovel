import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET - 포트폴리오 아이템 목록
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const profile = await db.editorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "윤문가 프로필이 없습니다" },
        { status: 404 }
      );
    }

    const portfolioItems = await db.portfolioItem.findMany({
      where: { profileId: profile.id },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ items: portfolioItems });
  } catch (error) {
    console.error("Error fetching portfolio items:", error);
    return NextResponse.json(
      { error: "포트폴리오를 불러오는 데 실패했습니다" },
      { status: 500 }
    );
  }
}

// POST - 포트폴리오 아이템 추가
const createItemSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  genre: z.string().max(50).optional(),
  sampleText: z.string().max(10000).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const profile = await db.editorProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "먼저 윤문가 프로필을 생성해주세요" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = createItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // sortOrder가 없으면 마지막에 추가
    let sortOrder = parsed.data.sortOrder;
    if (sortOrder === undefined) {
      const lastItem = await db.portfolioItem.findFirst({
        where: { profileId: profile.id },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      sortOrder = (lastItem?.sortOrder ?? -1) + 1;
    }

    const item = await db.portfolioItem.create({
      data: {
        profileId: profile.id,
        title: parsed.data.title,
        description: parsed.data.description,
        genre: parsed.data.genre,
        sampleText: parsed.data.sampleText,
        sortOrder,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Error creating portfolio item:", error);
    return NextResponse.json(
      { error: "포트폴리오 아이템 추가에 실패했습니다" },
      { status: 500 }
    );
  }
}
