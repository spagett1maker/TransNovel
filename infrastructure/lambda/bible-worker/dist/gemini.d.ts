/**
 * Gemini API wrapper for Bible generation Lambda
 * Simplified version of src/lib/bible-generator.ts for Lambda environment
 */
export interface ChapterContent {
    number: number;
    originalContent: string;
}
export interface WorkInfo {
    title: string;
    genres: string[];
    synopsis: string;
    sourceLanguage: string;
}
export interface ChapterRange {
    start: number;
    end: number;
}
export interface AnalyzedCharacter {
    nameOriginal: string;
    nameKorean: string;
    nameHanja?: string;
    titles: string[];
    aliases: string[];
    personality?: string;
    speechStyle?: string;
    role: string;
    description?: string;
    relationships?: Record<string, string>;
    firstAppearance?: number;
}
export interface AnalyzedTerm {
    original: string;
    translated: string;
    category: string;
    note?: string;
    context?: string;
    firstAppearance?: number;
}
export interface AnalyzedEvent {
    title: string;
    description: string;
    chapterStart: number;
    chapterEnd?: number;
    eventType: string;
    importance: string;
    isForeshadowing: boolean;
    foreshadowNote?: string;
    involvedCharacters: string[];
}
export interface AnalysisResult {
    characters: AnalyzedCharacter[];
    terms: AnalyzedTerm[];
    events: AnalyzedEvent[];
    translationNotes?: string;
}
export declare class AnalysisError extends Error {
    code: string;
    retryable: boolean;
    constructor(message: string, code: string, retryable?: boolean);
}
/**
 * Main analysis function
 */
export declare function analyzeBatch(workInfo: WorkInfo, chapters: ChapterContent[], chapterRange: ChapterRange, apiKey: string, maxRetries?: number): Promise<AnalysisResult>;
//# sourceMappingURL=gemini.d.ts.map