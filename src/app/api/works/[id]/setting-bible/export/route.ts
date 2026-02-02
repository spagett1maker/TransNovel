import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// Vercel 서버리스 함수 타임아웃 확장 (대규모 내보내기 대응)
export const maxDuration = 300;

const CHUNK_SIZE = 500;

// GET /api/works/[id]/setting-bible/export - 설정집 다운로드 (스트리밍)
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

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "json";

    // 메타데이터만 조회 (엔티티 데이터는 스트리밍)
    const work = await db.work.findUnique({
      where: { id },
      include: {
        settingBible: true,
      },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    if (!work.settingBible) {
      return NextResponse.json(
        { error: "설정집이 없습니다." },
        { status: 404 }
      );
    }

    const bible = work.settingBible;
    const bibleId = bible.id;
    const fileName = `${work.titleKo}_설정집_${new Date().toISOString().split("T")[0]}`;

    if (format === "json") {
      return streamJsonExport(work, bible, bibleId, fileName);
    } else if (format === "csv") {
      return streamCsvExport(work, bible, bibleId, fileName);
    } else {
      return NextResponse.json(
        { error: "지원하지 않는 형식입니다. json 또는 csv를 사용하세요." },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Failed to export setting bible:", error);
    return NextResponse.json(
      { error: "설정집 내보내기에 실패했습니다." },
      { status: 500 }
    );
  }
}

// JSON 스트리밍 내보내기
function streamJsonExport(
  work: { titleKo: string; titleOriginal: string; genres: string[]; synopsis: string },
  bible: { status: string; version: number; analyzedChapters: number; generatedAt: Date | null; confirmedAt: Date | null; translationGuide: string | null },
  bibleId: string,
  fileName: string
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 헤더 부분
        controller.enqueue(encoder.encode('{\n  "workInfo": '));
        controller.enqueue(encoder.encode(JSON.stringify({
          title: work.titleKo,
          titleOriginal: work.titleOriginal,
          genres: work.genres,
          synopsis: work.synopsis,
        }, null, 2).replace(/\n/g, "\n  ")));

        controller.enqueue(encoder.encode(',\n  "settingBible": '));
        controller.enqueue(encoder.encode(JSON.stringify({
          status: bible.status,
          version: bible.version,
          analyzedChapters: bible.analyzedChapters,
          generatedAt: bible.generatedAt,
          confirmedAt: bible.confirmedAt,
          translationGuide: bible.translationGuide,
        }, null, 2).replace(/\n/g, "\n  ")));

        // Characters 스트리밍
        controller.enqueue(encoder.encode(',\n  "characters": ['));
        let isFirst = true;
        let charCursor: string | undefined;

        while (true) {
          const chars = await db.character.findMany({
            where: { bibleId },
            orderBy: { sortOrder: "asc" },
            take: CHUNK_SIZE,
            ...(charCursor ? { skip: 1, cursor: { id: charCursor } } : {}),
          });

          if (chars.length === 0) break;
          charCursor = chars[chars.length - 1].id;

          for (const c of chars) {
            const prefix = isFirst ? "\n    " : ",\n    ";
            isFirst = false;
            controller.enqueue(encoder.encode(prefix + JSON.stringify({
              nameOriginal: c.nameOriginal,
              nameKorean: c.nameKorean,
              nameHanja: c.nameHanja,
              role: c.role,
              titles: c.titles,
              aliases: c.aliases,
              personality: c.personality,
              speechStyle: c.speechStyle,
              description: c.description,
              relationships: c.relationships,
              firstAppearance: c.firstAppearance,
            })));
          }

          if (chars.length < CHUNK_SIZE) break;
        }
        controller.enqueue(encoder.encode("\n  ]"));

        // Terms 스트리밍
        controller.enqueue(encoder.encode(',\n  "terms": ['));
        isFirst = true;
        let termCursor: string | undefined;

        while (true) {
          const terms = await db.settingTerm.findMany({
            where: { bibleId },
            orderBy: { category: "asc" },
            take: CHUNK_SIZE,
            ...(termCursor ? { skip: 1, cursor: { id: termCursor } } : {}),
          });

          if (terms.length === 0) break;
          termCursor = terms[terms.length - 1].id;

          for (const t of terms) {
            const prefix = isFirst ? "\n    " : ",\n    ";
            isFirst = false;
            controller.enqueue(encoder.encode(prefix + JSON.stringify({
              original: t.original,
              translated: t.translated,
              category: t.category,
              note: t.note,
              context: t.context,
              firstAppearance: t.firstAppearance,
            })));
          }

          if (terms.length < CHUNK_SIZE) break;
        }
        controller.enqueue(encoder.encode("\n  ]"));

        // Events 스트리밍
        controller.enqueue(encoder.encode(',\n  "events": ['));
        isFirst = true;
        let eventCursor: string | undefined;

        while (true) {
          const events = await db.timelineEvent.findMany({
            where: { bibleId },
            orderBy: { chapterStart: "asc" },
            take: CHUNK_SIZE,
            ...(eventCursor ? { skip: 1, cursor: { id: eventCursor } } : {}),
          });

          if (events.length === 0) break;
          eventCursor = events[events.length - 1].id;

          for (const e of events) {
            const prefix = isFirst ? "\n    " : ",\n    ";
            isFirst = false;
            controller.enqueue(encoder.encode(prefix + JSON.stringify({
              title: e.title,
              description: e.description,
              chapterStart: e.chapterStart,
              chapterEnd: e.chapterEnd,
              eventType: e.eventType,
              importance: e.importance,
              isForeshadowing: e.isForeshadowing,
              foreshadowNote: e.foreshadowNote,
              involvedCharacterIds: e.involvedCharacterIds,
            })));
          }

          if (events.length < CHUNK_SIZE) break;
        }
        controller.enqueue(encoder.encode("\n  ]"));

        // 마무리
        controller.enqueue(encoder.encode(`,\n  "exportedAt": "${new Date().toISOString()}"\n}\n`));
        controller.close();
      } catch (error) {
        console.error("Export stream error:", error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}.json"`,
      "Transfer-Encoding": "chunked",
    },
  });
}

// CSV 스트리밍 내보내기
function streamCsvExport(
  work: { titleKo: string },
  bible: { translationGuide: string | null },
  bibleId: string,
  fileName: string
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // BOM (Excel 한글 깨짐 방지)
        controller.enqueue(encoder.encode("\uFEFF"));

        // 인물 섹션
        controller.enqueue(encoder.encode("=== 인물 (Characters) ===\n"));
        controller.enqueue(encoder.encode("원문이름,한국어이름,한자,역할,칭호,별명,성격,말투,설명,첫등장\n"));

        let charCursor: string | undefined;
        while (true) {
          const chars = await db.character.findMany({
            where: { bibleId },
            orderBy: { sortOrder: "asc" },
            take: CHUNK_SIZE,
            ...(charCursor ? { skip: 1, cursor: { id: charCursor } } : {}),
          });

          if (chars.length === 0) break;
          charCursor = chars[chars.length - 1].id;

          for (const c of chars) {
            controller.enqueue(encoder.encode([
              escapeCsv(c.nameOriginal),
              escapeCsv(c.nameKorean),
              escapeCsv(c.nameHanja || ""),
              c.role,
              escapeCsv(c.titles.join(", ")),
              escapeCsv(c.aliases.join(", ")),
              escapeCsv(c.personality || ""),
              escapeCsv(c.speechStyle || ""),
              escapeCsv(c.description || ""),
              c.firstAppearance?.toString() || "",
            ].join(",") + "\n"));
          }

          if (chars.length < CHUNK_SIZE) break;
        }

        // 용어 섹션
        controller.enqueue(encoder.encode("\n=== 용어 (Terms) ===\n"));
        controller.enqueue(encoder.encode("원문,번역,분류,메모,컨텍스트,첫등장\n"));

        let termCursor: string | undefined;
        while (true) {
          const terms = await db.settingTerm.findMany({
            where: { bibleId },
            orderBy: { category: "asc" },
            take: CHUNK_SIZE,
            ...(termCursor ? { skip: 1, cursor: { id: termCursor } } : {}),
          });

          if (terms.length === 0) break;
          termCursor = terms[terms.length - 1].id;

          for (const t of terms) {
            controller.enqueue(encoder.encode([
              escapeCsv(t.original),
              escapeCsv(t.translated),
              t.category,
              escapeCsv(t.note || ""),
              escapeCsv(t.context || ""),
              t.firstAppearance?.toString() || "",
            ].join(",") + "\n"));
          }

          if (terms.length < CHUNK_SIZE) break;
        }

        // 이벤트 섹션
        controller.enqueue(encoder.encode("\n=== 이벤트 (Events) ===\n"));
        controller.enqueue(encoder.encode("제목,설명,시작회차,종료회차,유형,중요도,복선여부,복선메모\n"));

        let eventCursor: string | undefined;
        while (true) {
          const events = await db.timelineEvent.findMany({
            where: { bibleId },
            orderBy: { chapterStart: "asc" },
            take: CHUNK_SIZE,
            ...(eventCursor ? { skip: 1, cursor: { id: eventCursor } } : {}),
          });

          if (events.length === 0) break;
          eventCursor = events[events.length - 1].id;

          for (const e of events) {
            controller.enqueue(encoder.encode([
              escapeCsv(e.title),
              escapeCsv(e.description),
              e.chapterStart.toString(),
              e.chapterEnd?.toString() || "",
              e.eventType,
              e.importance.toString(),
              e.isForeshadowing ? "Y" : "N",
              escapeCsv(e.foreshadowNote || ""),
            ].join(",") + "\n"));
          }

          if (events.length < CHUNK_SIZE) break;
        }

        // 번역 가이드
        if (bible.translationGuide) {
          controller.enqueue(encoder.encode("\n=== 번역 가이드 ===\n"));
          controller.enqueue(encoder.encode(escapeCsv(bible.translationGuide) + "\n"));
        }

        controller.close();
      } catch (error) {
        console.error("Export stream error:", error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}.csv"`,
      "Transfer-Encoding": "chunked",
    },
  });
}

// CSV 이스케이프 헬퍼
function escapeCsv(value: string): string {
  if (!value) return "";
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
