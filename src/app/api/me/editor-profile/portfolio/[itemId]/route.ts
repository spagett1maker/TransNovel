import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// PATCH - 포트폴리오 아이템 수정
const updateItemSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
  genre: z.string().max(50).optional(),
  sampleText: z.string().max(10000).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { itemId } = await params;

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

    // 본인의 포트폴리오 아이템인지 확인
    const existingItem = await db.portfolioItem.findFirst({
      where: {
        id: itemId,
        profileId: profile.id,
      },
    });

    if (!existingItem) {
      return NextResponse.json(
        { error: "포트폴리오 아이템을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateItemSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.genre !== undefined) updateData.genre = parsed.data.genre;
    if (parsed.data.sampleText !== undefined) updateData.sampleText = parsed.data.sampleText;
    if (parsed.data.sortOrder !== undefined) updateData.sortOrder = parsed.data.sortOrder;

    const item = await db.portfolioItem.update({
      where: { id: itemId },
      data: updateData,
    });

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Error updating portfolio item:", error);
    return NextResponse.json(
      { error: "포트폴리오 아이템 수정에 실패했습니다" },
      { status: 500 }
    );
  }
}

// DELETE - 포트폴리오 아이템 삭제
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { itemId } = await params;

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

    // 본인의 포트폴리오 아이템인지 확인
    const existingItem = await db.portfolioItem.findFirst({
      where: {
        id: itemId,
        profileId: profile.id,
      },
    });

    if (!existingItem) {
      return NextResponse.json(
        { error: "포트폴리오 아이템을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    await db.portfolioItem.delete({
      where: { id: itemId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting portfolio item:", error);
    return NextResponse.json(
      { error: "포트폴리오 아이템 삭제에 실패했습니다" },
      { status: 500 }
    );
  }
}
