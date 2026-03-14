import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessWork } from "@/lib/permissions";
import { searchQuerySchema } from "@/lib/validations/search";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function extractSnippets(
  text: string,
  query: string,
  maxSnippets = 3,
  contextLen = 30
): string[] {
  const plain = stripHtml(text);
  const lower = plain.toLowerCase();
  const qLower = query.toLowerCase();
  const snippets: string[] = [];
  let startFrom = 0;

  while (snippets.length < maxSnippets) {
    const idx = lower.indexOf(qLower, startFrom);
    if (idx === -1) break;

    const snippetStart = Math.max(0, idx - contextLen);
    const snippetEnd = Math.min(plain.length, idx + query.length + contextLen);
    const prefix = snippetStart > 0 ? "…" : "";
    const suffix = snippetEnd < plain.length ? "…" : "";
    snippets.push(prefix + plain.slice(snippetStart, snippetEnd) + suffix);

    startFrom = idx + query.length;
  }

  return snippets;
}

function countMatches(text: string, query: string): number {
  const lower = stripHtml(text).toLowerCase();
  const qLower = query.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = lower.indexOf(qLower, pos)) !== -1) {
    count++;
    pos += qLower.length;
  }
  return count;
}

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
    const parsed = searchQuerySchema.safeParse({ q: searchParams.get("q") });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "검색어는 2~100자여야 합니다." },
        { status: 400 }
      );
    }

    const query = parsed.data.q;

    const work = await db.work.findUnique({
      where: { id },
      select: { authorId: true, editorId: true },
    });

    if (
      !work ||
      !canAccessWork(session.user.id, session.user.role as UserRole, work)
    ) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const chapters = await db.chapter.findMany({
      where: {
        workId: id,
        OR: [
          { translatedContent: { contains: query, mode: "insensitive" } },
          { editedContent: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        number: true,
        title: true,
        translatedTitle: true,
        status: true,
        translatedContent: true,
        editedContent: true,
      },
      orderBy: { number: "asc" },
      take: 500,
    });

    const results = chapters.map((ch) => {
      const matches: { field: string; snippets: string[]; count: number }[] = [];

      if (ch.translatedContent) {
        const count = countMatches(ch.translatedContent, query);
        if (count > 0) {
          matches.push({
            field: "번역문",
            snippets: extractSnippets(ch.translatedContent, query),
            count,
          });
        }
      }

      if (ch.editedContent) {
        const count = countMatches(ch.editedContent, query);
        if (count > 0) {
          matches.push({
            field: "윤문본",
            snippets: extractSnippets(ch.editedContent, query),
            count,
          });
        }
      }

      const totalCount = matches.reduce((sum, m) => sum + m.count, 0);

      return {
        number: ch.number,
        title: ch.title,
        translatedTitle: ch.translatedTitle,
        status: ch.status,
        matches,
        totalCount,
      };
    });

    return NextResponse.json({ results, query });
  } catch (error) {
    console.error("Failed to search chapters:", error);
    return NextResponse.json(
      { error: "검색에 실패했습니다." },
      { status: 500 }
    );
  }
}
