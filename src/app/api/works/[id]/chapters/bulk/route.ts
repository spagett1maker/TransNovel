import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
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

/**
 * 텍스트에서 챕터를 자동 감지하여 분리
 * 패턴: 第X章, 第X话, 第X節, Chapter X, 제X화, 제X장 등
 */
function parseChaptersFromText(text: string, separator?: string): ChapterInput[] {
  const chapters: ChapterInput[] = [];

  // 사용자 지정 구분자가 있는 경우
  if (separator) {
    const parts = text.split(separator).filter(p => p.trim());
    parts.forEach((part, index) => {
      const trimmed = part.trim();
      if (trimmed) {
        // 첫 줄을 제목으로 사용
        const lines = trimmed.split('\n');
        const firstLine = lines[0].trim();
        const content = lines.slice(1).join('\n').trim() || trimmed;

        chapters.push({
          number: index + 1,
          title: firstLine.length < 100 ? firstLine : undefined,
          content: content,
        });
      }
    });
    return chapters;
  }

  // 자동 감지 패턴
  const patterns = [
    /^第[一二三四五六七八九十百千\d]+[章话節节回卷]/gm,  // 중국어
    /^第[一二三四五六七八九十百千\d]+話/gm,              // 일본어
    /^Chapter\s*\d+/gim,                                 // 영어
    /^제\s*\d+\s*[화장회]/gm,                            // 한국어
    /^[\d]+[\.、]\s*/gm,                                 // 숫자만
  ];

  let bestPattern: RegExp | null = null;
  let maxMatches = 0;

  // 가장 많이 매칭되는 패턴 찾기
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > maxMatches) {
      maxMatches = matches.length;
      bestPattern = pattern;
    }
  }

  if (bestPattern && maxMatches >= 2) {
    // 패턴으로 분리
    const parts = text.split(bestPattern);
    const headers = text.match(bestPattern) || [];

    // 첫 번째 부분이 프롤로그인 경우 처리
    if (parts[0].trim()) {
      chapters.push({
        number: 0,
        title: "프롤로그",
        content: parts[0].trim(),
      });
    }

    headers.forEach((header, index) => {
      const content = parts[index + 1]?.trim();
      if (content) {
        // 헤더에서 번호 추출
        const numMatch = header.match(/\d+/);
        const num = numMatch ? parseInt(numMatch[0]) : index + 1;

        // 헤더 다음 줄에서 제목 추출
        const lines = content.split('\n');
        const firstLine = lines[0].trim();
        const hasTitle = firstLine.length < 50 && !firstLine.includes('。') && !firstLine.includes('.');

        chapters.push({
          number: num,
          title: hasTitle ? firstLine : undefined,
          content: hasTitle ? lines.slice(1).join('\n').trim() : content,
        });
      }
    });
  } else {
    // 패턴을 찾지 못한 경우 전체를 하나의 챕터로
    chapters.push({
      number: 1,
      title: undefined,
      content: text.trim(),
    });
  }

  return chapters;
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
      select: { authorId: true, status: true },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const body: BulkUploadRequest = await req.json();
    let chapters: ChapterInput[] = [];

    // 자동 감지 모드 또는 원본 텍스트 제공 시
    if (body.rawText) {
      chapters = parseChaptersFromText(body.rawText, body.separator);
    } else if (body.chapters && Array.isArray(body.chapters)) {
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

    // 총 회차 수 업데이트 및 상태 변경
    const totalChapters = await db.chapter.count({ where: { workId: id } });
    await db.work.update({
      where: { id },
      data: {
        totalChapters,
        // 회차가 등록되면 상태를 REGISTERED로 변경 (PREPARING에서)
        status: work.status === "PREPARING" ? "REGISTERED" : work.status,
      },
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
