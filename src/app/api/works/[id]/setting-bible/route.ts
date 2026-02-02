import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma, CharacterRole, TermCategory } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/works/[id]/setting-bible - 설정집 조회 (페이지네이션 지원)
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

    const url = new URL(req.url);
    const tab = url.searchParams.get("tab"); // "characters" | "terms" | "events" | null
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get("pageSize") || "100", 10) || 100));
    const search = url.searchParams.get("search") || "";
    const filter = url.searchParams.get("filter") || "all";

    const bible = await db.settingBible.findUnique({
      where: { workId: id },
    });

    if (!bible) {
      return NextResponse.json({ bible: null });
    }

    // tab이 없으면 메타데이터 + 카운트만 반환 (가벼운 응답)
    if (!tab) {
      const [characterCount, termCount, eventCount] = await Promise.all([
        db.character.count({ where: { bibleId: bible.id } }),
        db.settingTerm.count({ where: { bibleId: bible.id } }),
        db.timelineEvent.count({ where: { bibleId: bible.id } }),
      ]);

      return NextResponse.json({
        bible: {
          ...bible,
          characterCount,
          termCount,
          eventCount,
        },
      });
    }

    const skip = (page - 1) * pageSize;

    // 탭별 페이지네이션 데이터 반환
    if (tab === "characters") {
      const where: Prisma.CharacterWhereInput = { bibleId: bible.id };
      if (search) {
        where.OR = [
          { nameKorean: { contains: search, mode: "insensitive" } },
          { nameOriginal: { contains: search, mode: "insensitive" } },
        ];
      }
      if (filter !== "all") {
        where.role = filter as CharacterRole;
      }

      const [characters, total] = await Promise.all([
        db.character.findMany({
          where,
          orderBy: [{ role: "asc" }, { sortOrder: "asc" }],
          skip,
          take: pageSize,
        }),
        db.character.count({ where }),
      ]);

      return NextResponse.json({ characters, total, page, pageSize });
    }

    if (tab === "terms") {
      const where: Prisma.SettingTermWhereInput = { bibleId: bible.id };
      if (search) {
        where.OR = [
          { original: { contains: search, mode: "insensitive" } },
          { translated: { contains: search, mode: "insensitive" } },
        ];
      }
      if (filter !== "all") {
        where.category = filter as TermCategory;
      }

      const [terms, total] = await Promise.all([
        db.settingTerm.findMany({
          where,
          orderBy: [{ category: "asc" }, { original: "asc" }],
          skip,
          take: pageSize,
        }),
        db.settingTerm.count({ where }),
      ]);

      return NextResponse.json({ terms, total, page, pageSize });
    }

    if (tab === "events") {
      const where: Prisma.TimelineEventWhereInput = { bibleId: bible.id };

      const [events, total] = await Promise.all([
        db.timelineEvent.findMany({
          where,
          orderBy: [{ chapterStart: "asc" }, { importance: "desc" }],
          skip,
          take: pageSize,
        }),
        db.timelineEvent.count({ where }),
      ]);

      return NextResponse.json({ events, total, page, pageSize });
    }

    return NextResponse.json({ error: "유효하지 않은 tab 파라미터입니다." }, { status: 400 });
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
