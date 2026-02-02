import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

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
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
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
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true, status: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 트랜잭션으로 원자적 생성 (동시 요청 시 중복 방지)
    const bible = await db.$transaction(async (tx) => {
      const existingBible = await tx.settingBible.findUnique({
        where: { workId: id },
      });

      if (existingBible) {
        throw new Error("ALREADY_EXISTS");
      }

      const created = await tx.settingBible.create({
        data: {
          workId: id,
          status: "GENERATING",
        },
      });

      await tx.work.update({
        where: { id },
        data: { status: "BIBLE_GENERATING" },
      });

      return created;
    });

    return NextResponse.json({ bible }, { status: 201 });
  } catch (error) {
    // 이미 존재 (트랜잭션 내 체크 또는 unique 제약 조건 위반)
    if (
      (error instanceof Error && error.message === "ALREADY_EXISTS") ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    ) {
      return NextResponse.json(
        { error: "이미 설정집이 존재합니다." },
        { status: 400 }
      );
    }
    console.error("Failed to create setting bible:", error);
    return NextResponse.json(
      { error: "설정집 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}

// PATCH /api/works/[id]/setting-bible - 설정집 수정 (번역 가이드 등)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const { id } = await params;

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

    if (work.settingBible.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "확정된 설정집은 수정할 수 없습니다." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { translationGuide } = body;

    if (typeof translationGuide !== "string") {
      return NextResponse.json(
        { error: "유효하지 않은 요청입니다." },
        { status: 400 }
      );
    }

    const updated = await db.settingBible.update({
      where: { workId: id },
      data: { translationGuide },
    });

    return NextResponse.json({ bible: updated });
  } catch (error) {
    console.error("Failed to update setting bible:", error);
    return NextResponse.json(
      { error: "설정집 수정에 실패했습니다." },
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
