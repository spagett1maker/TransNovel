import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const updateCharacterSchema = z.object({
  nameKorean: z.string().min(1).optional(),
  nameHanja: z.string().nullable().optional(),
  titles: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  personality: z.string().nullable().optional(),
  speechStyle: z.string().nullable().optional(),
  role: z.enum(["PROTAGONIST", "ANTAGONIST", "SUPPORTING", "MINOR"]).optional(),
  description: z.string().nullable().optional(),
  relationships: z.record(z.string(), z.unknown()).nullable().optional(),
  sortOrder: z.number().int().optional(),
});

// GET /api/works/[id]/setting-bible/characters/[charId]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, charId } = await params;

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const character = await db.character.findUnique({
      where: { id: charId },
    });

    if (!character) {
      return NextResponse.json({ error: "인물을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ character });
  } catch (error) {
    console.error("Failed to fetch character:", error);
    return NextResponse.json(
      { error: "인물 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

// PATCH /api/works/[id]/setting-bible/characters/[charId]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, charId } = await params;

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      include: { settingBible: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    if (!work.settingBible) {
      return NextResponse.json({ error: "설정집이 없습니다." }, { status: 404 });
    }

    // 확정된 설정집은 수정 불가
    if (work.settingBible.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "확정된 설정집은 수정할 수 없습니다." },
        { status: 400 }
      );
    }

    const character = await db.character.findUnique({
      where: { id: charId },
    });

    if (!character || character.bibleId !== work.settingBible.id) {
      return NextResponse.json({ error: "인물을 찾을 수 없습니다." }, { status: 404 });
    }

    const body = await req.json();
    const validatedData = updateCharacterSchema.parse(body);

    // Prisma JSON 필드 처리: null을 명시적으로 처리하고 타입 캐스팅
    const dataToUpdate: Prisma.CharacterUpdateInput = {
      ...validatedData,
      relationships: validatedData.relationships === null
        ? undefined  // null은 업데이트하지 않음
        : validatedData.relationships as Prisma.InputJsonValue,
    };

    const updated = await db.character.update({
      where: { id: charId },
      data: dataToUpdate,
    });

    return NextResponse.json({ character: updated });
  } catch (error) {
    console.error("Failed to update character:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "잘못된 데이터입니다.", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "인물 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/works/[id]/setting-bible/characters/[charId]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; charId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, charId } = await params;

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      include: { settingBible: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    if (!work.settingBible) {
      return NextResponse.json({ error: "설정집이 없습니다." }, { status: 404 });
    }

    // 확정된 설정집은 삭제 불가
    if (work.settingBible.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "확정된 설정집은 수정할 수 없습니다." },
        { status: 400 }
      );
    }

    const character = await db.character.findUnique({
      where: { id: charId },
    });

    if (!character || character.bibleId !== work.settingBible.id) {
      return NextResponse.json({ error: "인물을 찾을 수 없습니다." }, { status: 404 });
    }

    await db.character.delete({
      where: { id: charId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete character:", error);
    return NextResponse.json(
      { error: "인물 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
