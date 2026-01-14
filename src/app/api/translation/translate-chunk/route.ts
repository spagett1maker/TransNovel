import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { translateText, TranslationError } from "@/lib/gemini";

interface TranslationContext {
  titleKo: string;
  genres: string[];
  ageRating: string;
  synopsis: string;
  glossary?: Array<{ original: string; translated: string; note?: string }>;
}

// Vercel Hobby 플랜: 10초 제한
// 안전 마진을 위해 실제 번역은 8초 내에 완료되어야 함
export const maxDuration = 10;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { text, context } = body as {
      text: string;
      context: TranslationContext;
    };

    if (!text || !context) {
      return NextResponse.json(
        { error: "텍스트와 컨텍스트가 필요합니다." },
        { status: 400 }
      );
    }

    // 청크 크기 제한 (1500자 이하만 허용 - 10초 내 처리 보장)
    if (text.length > 1500) {
      return NextResponse.json(
        { error: "청크가 너무 큽니다. 1500자 이하로 분할해주세요." },
        { status: 400 }
      );
    }

    // 단일 청크 번역 (재시도 2회로 제한 - 시간 절약)
    const translated = await translateText(text, context, 2);

    return NextResponse.json({
      translated,
      originalLength: text.length,
      translatedLength: translated.length,
    });
  } catch (error) {
    console.error("[Translate Chunk API] 오류:", error);

    if (error instanceof TranslationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          retryable: error.retryable,
        },
        { status: error.retryable ? 503 : 400 }
      );
    }

    return NextResponse.json(
      { error: "번역 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
