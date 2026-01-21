import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/works/[id]/setting-bible/export - 설정집 다운로드
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

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "json";

    const work = await db.work.findUnique({
      where: { id },
      include: {
        settingBible: {
          include: {
            characters: {
              orderBy: { sortOrder: "asc" },
            },
            terms: {
              orderBy: { category: "asc" },
            },
            events: {
              orderBy: { chapterStart: "asc" },
            },
          },
        },
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
    const fileName = `${work.titleKo}_설정집_${new Date().toISOString().split("T")[0]}`;

    if (format === "json") {
      // JSON 형식
      const exportData = {
        workInfo: {
          title: work.titleKo,
          titleOriginal: work.titleOriginal,
          genres: work.genres,
          synopsis: work.synopsis,
        },
        settingBible: {
          status: bible.status,
          version: bible.version,
          analyzedChapters: bible.analyzedChapters,
          generatedAt: bible.generatedAt,
          confirmedAt: bible.confirmedAt,
          translationGuide: bible.translationGuide,
        },
        characters: bible.characters.map((c) => ({
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
        })),
        terms: bible.terms.map((t) => ({
          original: t.original,
          translated: t.translated,
          category: t.category,
          note: t.note,
          context: t.context,
          firstAppearance: t.firstAppearance,
        })),
        events: bible.events.map((e) => ({
          title: e.title,
          description: e.description,
          chapterStart: e.chapterStart,
          chapterEnd: e.chapterEnd,
          eventType: e.eventType,
          importance: e.importance,
          isForeshadowing: e.isForeshadowing,
          foreshadowNote: e.foreshadowNote,
          involvedCharacterIds: e.involvedCharacterIds,
        })),
        exportedAt: new Date().toISOString(),
      };

      return new NextResponse(JSON.stringify(exportData, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}.json"`,
        },
      });
    } else if (format === "csv") {
      // CSV 형식 (인물 + 용어를 하나의 파일에)
      const lines: string[] = [];

      // 인물 섹션
      lines.push("=== 인물 (Characters) ===");
      lines.push("원문이름,한국어이름,한자,역할,칭호,별명,성격,말투,설명,첫등장");
      for (const c of bible.characters) {
        lines.push([
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
        ].join(","));
      }

      lines.push("");
      lines.push("=== 용어 (Terms) ===");
      lines.push("원문,번역,분류,메모,컨텍스트,첫등장");
      for (const t of bible.terms) {
        lines.push([
          escapeCsv(t.original),
          escapeCsv(t.translated),
          t.category,
          escapeCsv(t.note || ""),
          escapeCsv(t.context || ""),
          t.firstAppearance?.toString() || "",
        ].join(","));
      }

      lines.push("");
      lines.push("=== 이벤트 (Events) ===");
      lines.push("제목,설명,시작회차,종료회차,유형,중요도,복선여부,복선메모");
      for (const e of bible.events) {
        lines.push([
          escapeCsv(e.title),
          escapeCsv(e.description),
          e.chapterStart.toString(),
          e.chapterEnd?.toString() || "",
          e.eventType,
          e.importance.toString(),
          e.isForeshadowing ? "Y" : "N",
          escapeCsv(e.foreshadowNote || ""),
        ].join(","));
      }

      if (bible.translationGuide) {
        lines.push("");
        lines.push("=== 번역 가이드 ===");
        lines.push(escapeCsv(bible.translationGuide));
      }

      // BOM 추가 (Excel에서 한글 깨짐 방지)
      const bom = "\uFEFF";
      const csvContent = bom + lines.join("\n");

      return new NextResponse(csvContent, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}.csv"`,
        },
      });
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

// CSV 이스케이프 헬퍼
function escapeCsv(value: string): string {
  if (!value) return "";
  // 쉼표, 줄바꿈, 따옴표가 포함되면 따옴표로 감싸기
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
