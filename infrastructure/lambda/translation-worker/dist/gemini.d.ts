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
    }>;
    characters?: Array<{
        nameOriginal: string;
        nameKorean: string;
        role: string;
        speechStyle?: string;
        personality?: string;
    }>;
    translationGuide?: string;
}
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