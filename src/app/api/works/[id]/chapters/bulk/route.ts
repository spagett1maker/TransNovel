import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

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

    // 데이터베이스에 저장
    const createdChapters = await db.$transaction(
      uniqueChapters.map((chapter) =>
        db.chapter.upsert({
          where: {
            workId_number: {
              workId: id,
              number: chapter.number,
            },
          },
          update: {
            title: chapter.title || null,
            originalContent: chapter.content,
            wordCount: chapter.content.length,
          },
          create: {
            workId: id,
            number: chapter.number,
            title: chapter.title || null,
            originalContent: chapter.content,
            wordCount: chapter.content.length,
          },
        })
      )
    );

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
      created: createdChapters.length,
      chapters: createdChapters.map(ch => ({
        number: ch.number,
        title: ch.title,
        wordCount: ch.wordCount,
      })),
    }, { status: 201 });
  } catch (error) {
    console.error("Bulk upload error:", error);
    return NextResponse.json(
      { error: "일괄 업로드에 실패했습니다." },
      { status: 500 }
    );
  }
}
