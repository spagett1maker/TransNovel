"use strict";
/**
 * Gemini API wrapper for Lambda
 * Simplified version of src/lib/gemini.ts for Lambda environment
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranslationError = void 0;
exports.translateChapter = translateChapter;
const generative_ai_1 = require("@google/generative-ai");
// Configuration
const API_TIMEOUT_MS = 180000; // 3 minutes
const MAX_OUTPUT_TOKENS = 65536;
const TARGET_CHUNK_TOKENS = Math.floor(MAX_OUTPUT_TOKENS * 0.9);
// Model priority for fallback
const MODEL_PRIORITY = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
];
class TranslationError extends Error {
    code;
    retryable;
    constructor(message, code, retryable = false) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.name = "TranslationError";
    }
}
exports.TranslationError = TranslationError;
/**
 * Build system prompt for translation
 */
function buildSystemPrompt(context) {
    let glossarySection = "";
    if (context.glossary && context.glossary.length > 0) {
        glossarySection = `
[용어집]
${context.glossary.map((g) => `- ${g.original} → ${g.translated}`).join("\n")}
`;
    }
    let characterSection = "";
    if (context.characters && context.characters.length > 0) {
        characterSection = `
[인물 정보]
${context.characters.map((c) => `- ${c.nameOriginal} → ${c.nameKorean} (${c.role})${c.speechStyle ? ` 말투: ${c.speechStyle}` : ""}`).join("\n")}
`;
    }
    return `당신은 웹소설 번역 전문가입니다.

[작품 정보]
- 제목: ${context.titleKo}
- 장르: ${context.genres.join(", ")}
- 연령등급: ${context.ageRating}
- 줄거리: ${context.synopsis}
${glossarySection}
${characterSection}
${context.translationGuide ? `[번역 가이드]\n${context.translationGuide}\n` : ""}

[지침]
1. 원문의 의미와 뉘앙스를 정확하게 전달하세요
2. 용어집의 번역어를 반드시 사용하세요
3. 캐릭터의 말투와 성격을 일관되게 유지하세요
4. 한국 독자에게 자연스러운 문체로 번역하세요
5. 번역문만 출력하세요 (설명, 주석 없이)

입력되는 원문을 한국어로 번역하세요.`;
}
/**
 * Analyze error and convert to TranslationError
 */
function analyzeError(error) {
    if (error instanceof generative_ai_1.GoogleGenerativeAIError) {
        const message = error.message.toLowerCase();
        if (message.includes("quota") || message.includes("rate") || message.includes("429")) {
            return new TranslationError("API 요청 한도 초과", "RATE_LIMIT", true);
        }
        if (message.includes("safety") || message.includes("blocked")) {
            return new TranslationError("콘텐츠 안전 정책으로 거부됨", "CONTENT_BLOCKED", false);
        }
        if (message.includes("api key") || message.includes("401")) {
            return new TranslationError("API 인증 실패", "AUTH_ERROR", false);
        }
        if (message.includes("500") || message.includes("503") || message.includes("server")) {
            return new TranslationError("AI 서버 오류", "SERVER_ERROR", true);
        }
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new TranslationError(`번역 오류: ${errorMessage}`, "UNKNOWN_ERROR", true);
}
/**
 * Add jitter to prevent thundering herd
 */
function addJitter(baseMs, fraction = 0.2) {
    const jitter = baseMs * fraction * (Math.random() - 0.5) * 2;
    return Math.max(0, baseMs + jitter);
}
/**
 * Translate text with timeout
 */
async function withTimeout(promise, timeoutMs, operation) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new TranslationError(`${operation} 시간 초과`, "TIMEOUT", true));
        }, timeoutMs);
    });
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    }
    catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}
/**
 * Translate content with a specific model
 */
async function translateWithModel(genAI, modelName, content, systemPrompt, maxRetries) {
    const model = genAI.getGenerativeModel({ model: modelName });
    const safetySettings = [
        { category: generative_ai_1.HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE },
        { category: generative_ai_1.HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE },
        { category: generative_ai_1.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE },
        { category: generative_ai_1.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE },
        { category: generative_ai_1.HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: generative_ai_1.HarmBlockThreshold.BLOCK_NONE },
    ];
    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await withTimeout(model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: systemPrompt },
                            { text: `[원문 시작]\n\n${content}\n\n[원문 끝]` },
                        ],
                    },
                ],
                safetySettings,
                generationConfig: {
                    temperature: 0.4,
                    topP: 0.85,
                    topK: 40,
                    maxOutputTokens: MAX_OUTPUT_TOKENS,
                },
            }), API_TIMEOUT_MS, "번역 API 호출");
            // Check safety block before calling .text()
            const response = result.response;
            const candidate = response.candidates?.[0];
            if (candidate?.finishReason === "SAFETY" || response.promptFeedback?.blockReason) {
                const safetyRatings = candidate?.safetyRatings || response.promptFeedback?.safetyRatings;
                console.log("[Gemini] Safety block details:", JSON.stringify({
                    finishReason: candidate?.finishReason,
                    blockReason: response.promptFeedback?.blockReason,
                    safetyRatings,
                }));
                throw new TranslationError("콘텐츠 안전 정책으로 거부됨", "CONTENT_BLOCKED", true);
            }
            const text = response.text();
            if (!text || text.trim().length === 0) {
                throw new TranslationError("AI가 빈 응답을 반환했습니다", "EMPTY_RESPONSE", true);
            }
            return text;
        }
        catch (error) {
            lastError = error instanceof TranslationError ? error : analyzeError(error);
            // Non-retryable errors
            if (!lastError.retryable) {
                throw lastError;
            }
            // 503/overloaded - try next model
            if (lastError.message.includes("503") || lastError.message.includes("overloaded")) {
                throw lastError;
            }
            // Wait before retry
            if (attempt < maxRetries - 1) {
                const baseDelay = lastError.code === "RATE_LIMIT" ? 30000 : 5000;
                const waitMs = addJitter(baseDelay * Math.pow(1.5, attempt));
                await new Promise((r) => setTimeout(r, waitMs));
            }
        }
    }
    throw lastError || new TranslationError("번역 실패", "MAX_RETRIES", false);
}
/**
 * Split long text into chunks
 */
function splitIntoChunks(text, maxLength) {
    const paragraphs = text.split(/\n\n+/);
    const chunks = [];
    let currentChunk = "";
    for (const paragraph of paragraphs) {
        if (currentChunk.length + paragraph.length > maxLength && currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = paragraph;
        }
        else {
            currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
        }
    }
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}
/**
 * Calculate max characters for token budget
 */
function maxCharsForTokenBudget(sampleText) {
    const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/g;
    const cjkMatches = sampleText.match(cjkPattern);
    const cjkCount = cjkMatches?.length ?? 0;
    const totalChars = sampleText.length || 1;
    const cjkRatio = cjkCount / totalChars;
    const avgTokensPerChar = cjkRatio * 1.5 + (1 - cjkRatio) * 0.25;
    return Math.floor(TARGET_CHUNK_TOKENS / avgTokensPerChar);
}
/**
 * Main translation function
 */
async function translateChapter(content, context, apiKey, maxRetries = 5) {
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    // Filter context to only include terms/characters that appear in content
    const filteredContext = { ...context };
    if (context.glossary) {
        filteredContext.glossary = context.glossary.filter((term) => content.includes(term.original));
    }
    if (context.characters) {
        filteredContext.characters = context.characters.filter((char) => char.role === "PROTAGONIST" ||
            char.role === "ANTAGONIST" ||
            content.includes(char.nameOriginal));
    }
    const systemPrompt = buildSystemPrompt(filteredContext);
    const chunkThreshold = Math.max(8000, maxCharsForTokenBudget(content));
    // Small content - translate in one go
    if (content.length <= chunkThreshold) {
        for (const modelName of MODEL_PRIORITY) {
            try {
                return await translateWithModel(genAI, modelName, content, systemPrompt, maxRetries);
            }
            catch (error) {
                const translationError = error instanceof TranslationError ? error : analyzeError(error);
                if (!translationError.retryable && !translationError.message.includes("503")) {
                    throw translationError;
                }
                // Try next model
            }
        }
        throw new TranslationError("모든 모델 실패", "ALL_MODELS_FAILED", false);
    }
    // Large content - chunk and translate
    const chunks = splitIntoChunks(content, chunkThreshold);
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
        let translated = false;
        for (const modelName of MODEL_PRIORITY) {
            try {
                const result = await translateWithModel(genAI, modelName, chunks[i], systemPrompt, maxRetries);
                results.push(result);
                translated = true;
                break;
            }
            catch (error) {
                const translationError = error instanceof TranslationError ? error : analyzeError(error);
                if (!translationError.retryable && !translationError.message.includes("503")) {
                    throw translationError;
                }
                // Try next model
            }
        }
        if (!translated) {
            throw new TranslationError(`청크 ${i + 1}/${chunks.length} 번역 실패`, "CHUNK_FAILED", false);
        }
        // Small delay between chunks
        if (i < chunks.length - 1) {
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
    return results.join("\n\n");
}
//# sourceMappingURL=gemini.js.map