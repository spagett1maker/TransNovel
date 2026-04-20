/**
 * Gemini API wrapper for Lambda
 * Simplified version of src/lib/gemini.ts for Lambda environment
 */
export interface TranslationContext {
    titleKo: string;
    genres: string[];
    ageRating: string;
    synopsis: string;
    glossary?: Array<{
        original: string;
        translated: string;
        note?: string;
    }>;
    characters?: Array<{
        nameOriginal: string;
        nameKorean: string;
        role: string;
        speechStyle?: string;
        personality?: string;
    }>;
    translationGuide?: string;
    customSystemPrompt?: string;
}
/**
 * 원문 앞에 제목 마커를 붙여서 Gemini가 함께 번역하도록 함
 */
export declare function prependChapterTitle(content: string, title: string | null | undefined): string;
/**
 * 번역 결과에서 제목 마커를 파싱하여 제목과 본문을 분리
 */
export declare function extractTranslatedTitle(translatedContent: string): {
    translatedTitle: string | null;
    content: string;
};
export declare class TranslationError extends Error {
    code: string;
    retryable: boolean;
    constructor(message: string, code: string, retryable?: boolean);
}
/**
 * Main translation function
 */
export declare function translateChapter(content: string, context: TranslationContext, apiKey: string, maxRetries?: number): Promise<string>;
//# sourceMappingURL=gemini.d.ts.map