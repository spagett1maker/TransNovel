import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { retranslateText } from "@/lib/gemini";

interface RetranslateRequest {
  feedback: string;
  selectedText?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; num: string }> }
) {
  console.log("[Retranslate API] POST 요청 수신");
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
    }

    const { id: workId, num } = await params;
    const chapterNum = parseInt(num, 10);
    const body: RetranslateRequest = await req.json();
    const { feedback, selectedText } = body;

    console.log("[Retranslate API] 요청 데이터:", {
      workId,
      chapterNum,
      feedback: feedback.substring(0, 50),
      hasSelectedText: !!selectedText,
    });

    if (!feedback || feedback.trim().length === 0) {
      return NextResponse.json(
        { error: "피드백을 입력해주세요." },
        { status: 400 }
      );
    }

    // 작품 조회
    const work = await db.work.findUnique({
      where: { id: workId },
      include: {
        glossary: true,
      },
    });

    if (!work || work.authorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 챕터 조회
    const chapter = await db.chapter.findFirst({
      where: {
        workId,
        number: chapterNum,
      },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "회차를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // 윤문 완료/승인된 챕터는 재번역 불가 (에디터 작업 보호)
    if (["EDITED", "APPROVED"].includes(chapter.status)) {
      return NextResponse.json(
        { error: "윤문 완료된 회차는 재번역할 수 없습니다. 스냅샷을 확인해주세요." },
        { status: 400 }
      );
    }

    const currentTranslation = chapter.editedContent || chapter.translatedContent;
    if (!currentTranslation) {
      return NextResponse.json(
        { error: "번역된 내용이 없습니다. 먼저 번역을 진행해주세요." },
        { status: 400 }
      );
    }

    console.log("[Retranslate API] 재번역 시작");

    // 재번역 컨텍스트
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

    // 재번역 수행
    const retranslatedContent = await retranslateText(
      chapter.originalContent,
      currentTranslation,
      feedback,
      selectedText,
      context
    );

    console.log("[Retranslate API] 재번역 완료, 길이:", retranslatedContent.length);

    // DB 업데이트
    const updatedChapter = await db.chapter.update({
      where: { id: chapter.id },
      data: {
        translatedContent: retranslatedContent,
        editedContent: null, // 재번역 시 편집 내용 초기화
        status: "TRANSLATED",
      },
    });

    console.log("[Retranslate API] DB 업데이트 완료");

    return NextResponse.json({
      success: true,
      chapter: updatedChapter,
    });
  } catch (error) {
    console.error("[Retranslate API] 오류:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "재번역 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
