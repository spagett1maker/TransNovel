import { ChapterStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db, dbTransaction } from "@/lib/db";

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

    // 페이지네이션 파라미터 파싱 (NaN 방지)
    const { searchParams } = new URL(req.url);
    const pageRaw = parseInt(searchParams.get("page") || "1", 10);
    const limitRaw = parseInt(searchParams.get("limit") || "50", 10);
    const fetchAll = searchParams.get("all") === "true"; // 전체 조회 (번역 페이지용)

    // NaN 체크 및 범위 제한
    const page = Number.isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
    // all=true면 2000, 아니면 최대 100 (DoS 방지)
    const maxLimit = fetchAll ? 2000 : 100;
    const limit = Number.isNaN(limitRaw) ? 50 : Math.min(maxLimit, Math.max(1, limitRaw));
    const statusParam = searchParams.get("status"); // 선택적 상태 필터

    // 유효한 ChapterStatus인지 확인
    const validStatuses = Object.values(ChapterStatus);
    const status = statusParam && validStatuses.includes(statusParam as ChapterStatus)
      ? (statusParam as ChapterStatus)
      : undefined;

    // where 조건 구성
    const where = {
      workId: id,
      ...(status && { status }),
    };

    // 병렬로 count와 데이터 조회
    const [total, chapters] = await Promise.all([
      db.chapter.count({ where }),
      db.chapter.findMany({
        where,
        orderBy: { number: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          wordCount: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      chapters,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Failed to fetch chapters:", error);
    return NextResponse.json(
      { error: "회차 목록을 불러오는데 실패했습니다." },
      { status: 500 }
    );
  }
}

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
      select: { authorId: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const body = await req.json();
    const { chapters } = body as {
      chapters: Array<{
        number: number;
        title?: string;
        content: string;
      }>;
    };

    if (!chapters || !Array.isArray(chapters) || chapters.length === 0) {
      return NextResponse.json(
        { error: "회차 데이터가 필요합니다." },
        { status: 400 }
      );
    }

    // 기존 챕터 수 조회 (한 번에)
    const [existingCount, existingChapters] = await Promise.all([
      db.chapter.count({ where: { workId: id } }),
      db.chapter.findMany({
        where: {
          workId: id,
          number: { in: chapters.map(c => c.number) },
        },
        select: { number: true },
      }),
    ]);
    const existingNumbers = new Set(existingChapters.map(c => c.number));

    // 새 챕터와 업데이트할 챕터 분리
    const newChapters = chapters.filter(c => !existingNumbers.has(c.number));
    const updateChapters = chapters.filter(c => existingNumbers.has(c.number));

    let createdCount = 0;

    // 새 챕터 일괄 생성
    if (newChapters.length > 0) {
      await db.chapter.createMany({
        data: newChapters.map(chapter => ({
          workId: id,
          number: chapter.number,
          title: chapter.title || null,
          originalContent: chapter.content,
          wordCount: chapter.content.length,
        })),
        skipDuplicates: true,
      });
      createdCount = newChapters.length;
    }

    // 기존 챕터 업데이트 (배치)
    if (updateChapters.length > 0) {
      await db.$transaction(
        updateChapters.map(chapter =>
          db.chapter.update({
            where: {
              workId_number: { workId: id, number: chapter.number },
            },
            data: {
              title: chapter.title || null,
              originalContent: chapter.content,
              wordCount: chapter.content.length,
            },
          })
        )
      );
    }

    // 총 회차 수 계산 (별도 쿼리 불필요)
    const totalChapters = existingCount + createdCount;
    await db.work.update({
      where: { id },
      data: { totalChapters },
    });

    return NextResponse.json(
      { created: createdCount, updated: updateChapters.length },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create chapters:", error);
    return NextResponse.json(
      { error: "회차 등록에 실패했습니다." },
      { status: 500 }
    );
  }
}
