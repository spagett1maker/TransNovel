import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const updateTermSchema = z.object({
  translated: z.string().min(1).optional(),
  category: z.enum(["CHARACTER", "PLACE", "ORGANIZATION", "RANK_TITLE", "SKILL_TECHNIQUE", "ITEM", "OTHER"]).optional(),
  note: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
});

// GET /api/works/[id]/setting-bible/terms/[termId]
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; termId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, termId } = await params;

    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      include: { settingBible: { select: { id: true } } },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const term = await db.settingTerm.findUnique({
      where: { id: termId },
    });

    if (!term || !work.settingBible || term.bibleId !== work.settingBible.id) {
      return NextResponse.json({ error: "용어를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ term });
  } catch (error) {
    console.error("Failed to fetch term:", error);
    return NextResponse.json(
      { error: "용어 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

// PATCH /api/works/[id]/setting-bible/terms/[termId]
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; termId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, termId } = await params;

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

    const term = await db.settingTerm.findUnique({
      where: { id: termId },
    });

    if (!term || term.bibleId !== work.settingBible.id) {
      return NextResponse.json({ error: "용어를 찾을 수 없습니다." }, { status: 404 });
    }

    const body = await req.json();
    const validatedData = updateTermSchema.parse(body);

    const updated = await db.settingTerm.update({
      where: { id: termId },
      data: validatedData,
    });

    return NextResponse.json({ term: updated });
  } catch (error) {
    console.error("Failed to update term:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "잘못된 데이터입니다.", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "용어 수정에 실패했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/works/[id]/setting-bible/terms/[termId]
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; termId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id, termId } = await params;

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

    const term = await db.settingTerm.findUnique({
      where: { id: termId },
    });

    if (!term || term.bibleId !== work.settingBible.id) {
      return NextResponse.json({ error: "용어를 찾을 수 없습니다." }, { status: 404 });
    }

    await db.settingTerm.delete({
      where: { id: termId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete term:", error);
    return NextResponse.json(
      { error: "용어 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
