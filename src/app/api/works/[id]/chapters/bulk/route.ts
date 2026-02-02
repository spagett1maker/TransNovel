import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { parseChaptersFromText } from "@/lib/chapter-parser";
import { db, dbTransaction } from "@/lib/db";

interface ChapterInput {
  number: number;
  title?: string;
  content: string;
}

interface BulkUploadRequest {
  chapters: ChapterInput[];
  autoDetect?: boolean;
  rawText?: string;
  separator?: string;
}

// 배치 크기 (한 번에 처리할 챕터 수)
const BATCH_SIZE = 50;

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

    const body: BulkUploadRequest = await req.json();
    let chapters: ChapterInput[] = [];

    // 자동 감지 모드 또는 원본 텍스트 제공 시
    if (body.rawText) {
      if (typeof body.rawText !== "string") {
        return NextResponse.json({ error: "rawText는 문자열이어야 합니다." }, { status: 400 });
      }
      chapters = parseChaptersFromText(body.rawText, body.separator);
    } else if (body.chapters && Array.isArray(body.chapters)) {
      // 클라이언트가 직접 전달한 챕터 배열 검증
      for (const ch of body.chapters) {
        if (typeof ch.number !== "number" || !Number.isInteger(ch.number) || ch.number < 0) {
          return NextResponse.json({ error: "회차 번호가 유효하지 않습니다." }, { status: 400 });
        }
        if (typeof ch.content !== "string" || ch.content.trim().length === 0) {
          return NextResponse.json({ error: "회차 내용이 비어있습니다." }, { status: 400 });
        }
      }
      chapters = body.chapters;
    }

    if (chapters.length === 0) {
      return NextResponse.json(
        { error: "업로드할 회차가 없습니다." },
        { status: 400 }
      );
    }

    // 회차 번호 중복 제거 및 정렬
    const uniqueChapters = chapters.reduce((acc, ch) => {
      const existing = acc.find(c => c.number === ch.number);
      if (!existing) {
        acc.push(ch);
      }
      return acc;
    }, [] as ChapterInput[]);

    uniqueChapters.sort((a, b) => a.number - b.number);

    // 기존 챕터 번호 조회 (한 번에)
    const existingChapters = await db.chapter.findMany({
      where: {
        workId: id,
        number: { in: uniqueChapters.map(c => c.number) },
      },
      select: { number: true },
    });
    const existingNumbers = new Set(existingChapters.map(c => c.number));

    // 새 챕터와 업데이트할 챕터 분리
    const newChapters = uniqueChapters.filter(c => !existingNumbers.has(c.number));
    const updateChapters = uniqueChapters.filter(c => existingNumbers.has(c.number));

    let createdCount = 0;
    let updatedCount = 0;

    // 새 챕터 일괄 생성 (createMany - 매우 빠름)
    if (newChapters.length > 0) {
      // 배치로 나누어 처리
      for (let i = 0; i < newChapters.length; i += BATCH_SIZE) {
        const batch = newChapters.slice(i, i + BATCH_SIZE);
        await db.chapter.createMany({
          data: batch.map(chapter => ({
            workId: id,
            number: chapter.number,
            title: chapter.title || null,
            originalContent: chapter.content,
            wordCount: chapter.content.length,
          })),
          skipDuplicates: true,
        });
        createdCount += batch.length;
      }
    }

    // 기존 챕터 업데이트 (배치 트랜잭션)
    if (updateChapters.length > 0) {
      for (let i = 0; i < updateChapters.length; i += BATCH_SIZE) {
        const batch = updateChapters.slice(i, i + BATCH_SIZE);
        await db.$transaction(
          batch.map(chapter =>
            db.chapter.update({
              where: {
                workId_number: {
                  workId: id,
                  number: chapter.number,
                },
              },
              data: {
                title: chapter.title || null,
                originalContent: chapter.content,
                wordCount: chapter.content.length,
              },
            })
          )
        );
        updatedCount += batch.length;
      }
    }

    // 총 회차 수 업데이트 및 상태 변경 (트랜잭션으로 동시 업로드 시 카운트 정확성 보장)
    await db.$transaction(async (tx) => {
      const totalChapters = await tx.chapter.count({ where: { workId: id } });
      await tx.work.update({
        where: { id },
        data: {
          totalChapters,
          // 회차가 등록되면 상태를 REGISTERED로 변경 (PREPARING에서)
          status: work.status === "PREPARING" ? "REGISTERED" : work.status,
        },
      });
    });

    return NextResponse.json({
      success: true,
      created: createdCount,
      updated: updatedCount,
      total: createdCount + updatedCount,
    }, { status: 201 });
  } catch (error) {
    console.error("Bulk upload error:", error);
    return NextResponse.json(
      { error: "일괄 업로드에 실패했습니다." },
      { status: 500 }
    );
  }
}
