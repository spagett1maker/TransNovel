import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { improveExpression } from "@/lib/gemini";

const improveSchema = z.object({
  selectedText: z.string().min(1).max(2000),
  context: z.string().max(5000).optional().default(""),
});

// POST - AI 표현 개선 제안
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId } = await params;

    // Check work access
    const work = await db.work.findUnique({
      where: { id: workId },
      select: { id: true, authorId: true, editorId: true, genres: true },
    });

    if (!work) {
      return NextResponse.json(
        { error: "작품을 찾을 수 없습니다" },
        { status: 404 }
      );
    }

    const isEditor = work.editorId === session.user.id;
    const isAdmin = session.user.role === "ADMIN";

    if (!isEditor && !isAdmin) {
      return NextResponse.json(
        { error: "윤문가만 AI 표현 개선을 사용할 수 있습니다" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = improveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { selectedText, context } = parsed.data;

    const suggestions = await improveExpression(
      selectedText,
      context,
      work.genres
    );

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Error in AI improve:", error);

    const message =
      error instanceof Error ? error.message : "AI 표현 개선에 실패했습니다";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
