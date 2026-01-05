import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { splitIntoChunks, translateChunks } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workId, chapterNumbers } = body as {
      workId: string;
      chapterNumbers: number[];
    };

    if (!workId || !chapterNumbers || chapterNumbers.length === 0) {
      return NextResponse.json(
        { error: "작품 ID와 회차 번호가 필요합니다." },
        { status: 400 }
      );
    }

    // Get work with glossary
    const work = await db.work.findUnique({
      where: { id: workId },
      include: {
        glossary: true,
      },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // Get chapters to translate
    const chapters = await db.chapter.findMany({
      where: {
        workId,
        number: { in: chapterNumbers },
        status: "PENDING",
      },
      orderBy: { number: "asc" },
    });

    if (chapters.length === 0) {
      return NextResponse.json(
        { error: "번역할 회차가 없습니다." },
        { status: 400 }
      );
    }

    const context = {
      titleKo: work.titleKo,
      genres: work.genres,
      ageRating: work.ageRating,
      synopsis: work.synopsis,
      glossary: work.glossary.map((g) => ({
        original: g.original,
        translated: g.translated,
      })),
    };

    const results: Array<{ number: number; success: boolean; error?: string }> = [];

    for (const chapter of chapters) {
      try {
        // Update status to translating
        await db.chapter.update({
          where: { id: chapter.id },
          data: { status: "TRANSLATING" },
        });

        // Split content into chunks if too long
        const chunks = splitIntoChunks(chapter.originalContent);

        // Translate all chunks
        const translatedChunks = await translateChunks(chunks, context);
        const translatedContent = translatedChunks.join("\n\n");

        // Save translation
        await db.chapter.update({
          where: { id: chapter.id },
          data: {
            translatedContent,
            status: "TRANSLATED",
          },
        });

        results.push({ number: chapter.number, success: true });
      } catch (error) {
        console.error(`Failed to translate chapter ${chapter.number}:`, error);

        // Revert status on error
        await db.chapter.update({
          where: { id: chapter.id },
          data: { status: "PENDING" },
        });

        results.push({
          number: chapter.number,
          success: false,
          error: error instanceof Error ? error.message : "번역 실패",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      total: chapters.length,
      success: successCount,
      failed: chapters.length - successCount,
      results,
    });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "번역 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
