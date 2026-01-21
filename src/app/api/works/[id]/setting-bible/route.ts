import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/works/[id]/setting-bible - 설정집 조회
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const bible = await db.settingBible.findUnique({
      where: { workId: id },
      include: {
        characters: {
          orderBy: [{ role: "asc" }, { sortOrder: "asc" }],
        },
        terms: {
          orderBy: [{ category: "asc" }, { original: "asc" }],
        },
        events: {
          orderBy: [{ chapterStart: "asc" }, { importance: "desc" }],
        },
      },
    });

    if (!bible) {
      return NextResponse.json({ bible: null });
    }

    return NextResponse.json({ bible });
  } catch (error) {
    console.error("Failed to fetch setting bible:", error);
    return NextResponse.json(
      { error: "설정집을 불러오는데 실패했습니다." },
      { status: 500 }
    );
  }
}

// POST /api/works/[id]/setting-bible - 설정집 생성/초기화
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true, status: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 기존 설정집이 있는지 확인
    const existingBible = await db.settingBible.findUnique({
      where: { workId: id },
    });

    if (existingBible) {
      return NextResponse.json(
        { error: "이미 설정집이 존재합니다.", bible: existingBible },
        { status: 400 }
      );
    }

    // 새 설정집 생성
    const bible = await db.settingBible.create({
      data: {
        workId: id,
        status: "GENERATING",
      },
    });

    // 작품 상태 업데이트
    await db.work.update({
      where: { id },
      data: { status: "BIBLE_GENERATING" },
    });

    return NextResponse.json({ bible }, { status: 201 });
  } catch (error) {
    console.error("Failed to create setting bible:", error);
    return NextResponse.json(
      { error: "설정집 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}

// DELETE /api/works/[id]/setting-bible - 설정집 삭제 (재생성용)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        { error: "확정된 설정집은 삭제할 수 없습니다." },
        { status: 400 }
      );
    }

    // 설정집 삭제 (Cascade로 관련 데이터도 삭제됨)
    await db.settingBible.delete({
      where: { workId: id },
    });

    // 작품 상태 되돌리기
    await db.work.update({
      where: { id },
      data: { status: "REGISTERED" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete setting bible:", error);
    return NextResponse.json(
      { error: "설정집 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
