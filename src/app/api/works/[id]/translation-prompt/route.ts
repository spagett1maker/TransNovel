import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessWork } from "@/lib/permissions";
import {
  buildSystemPrompt,
  getDefaultPromptTemplate,
  getDefaultRetranslateTemplate,
  getDefaultImproveTemplate,
} from "@/lib/gemini";
import type { TranslationContext } from "@/lib/gemini";
import { getDefaultBibleTemplate } from "@/lib/bible-generator";

// GET /api/works/[id]/translation-prompt - 번역 프롬프트 미리보기 (모든 프롬프트 타입)
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

    const work = await db.work.findUnique({
      where: { id },
      include: {
        glossary: true,
        settingBible: {
          include: {
            characters: true,
          },
        },
      },
    });

    const userRole = session.user.role as UserRole;
    if (!work || !canAccessWork(session.user.id, userRole, work)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    // 번역 컨텍스트 생성
    const context: TranslationContext = {
      titleKo: work.titleKo,
      genres: work.genres,
      ageRating: work.ageRating,
      synopsis: work.synopsis,
      glossary: work.glossary.map((g) => ({
        original: g.original,
        translated: g.translated,
      })),
      characters: work.settingBible?.characters.map((c) => ({
        nameOriginal: c.nameOriginal,
        nameKorean: c.nameKorean,
        role: c.role,
        speechStyle: c.speechStyle || undefined,
        personality: c.personality || undefined,
      })),
      translationGuide: work.settingBible?.translationGuide || undefined,
      customSystemPrompt: work.settingBible?.customSystemPrompt || undefined,
    };

    // 1. 초벌 번역 프롬프트
    const fullPrompt = buildSystemPrompt(context);
    const defaultTemplate = getDefaultPromptTemplate(context);

    // 2. 재번역 프롬프트
    const defaultRetranslateTemplate = getDefaultRetranslateTemplate();

    // 3. 표현 개선 프롬프트
    const defaultImproveTemplate = getDefaultImproveTemplate();

    // 4. 설정집 분석 프롬프트
    const defaultBibleTemplate = getDefaultBibleTemplate();

    return NextResponse.json({
      // 초벌 번역
      fullPrompt,
      defaultTemplate,
      customSystemPrompt: work.settingBible?.customSystemPrompt || null,
      isCustom: !!work.settingBible?.customSystemPrompt,

      // 재번역
      defaultRetranslateTemplate,
      customRetranslatePrompt: work.settingBible?.customRetranslatePrompt || null,
      isRetranslateCustom: !!work.settingBible?.customRetranslatePrompt,

      // 표현 개선
      defaultImproveTemplate,
      customImprovePrompt: work.settingBible?.customImprovePrompt || null,
      isImproveCustom: !!work.settingBible?.customImprovePrompt,

      // 설정집 분석
      defaultBibleTemplate,
      customBiblePrompt: work.settingBible?.customBiblePrompt || null,
      isBibleCustom: !!work.settingBible?.customBiblePrompt,
    });
  } catch (error) {
    console.error("Failed to generate translation prompt preview:", error);
    return NextResponse.json(
      { error: "프롬프트 미리보기 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
