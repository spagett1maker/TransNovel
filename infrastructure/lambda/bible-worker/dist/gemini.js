"use strict";
/**
 * Gemini API wrapper for Bible generation Lambda
 * Simplified version of src/lib/bible-generator.ts for Lambda environment
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalysisError = void 0;
exports.analyzeBatch = analyzeBatch;
const generative_ai_1 = require("@google/generative-ai");
// Configuration
const API_TIMEOUT_MS = 180000; // 3 minutes
const MAX_OUTPUT_TOKENS = 65536;
// Model priority for fallback
const MODEL_PRIORITY = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
];
class AnalysisError extends Error {
    code;
    retryable;
    constructor(message, code, retryable = false) {
        super(message);
        this.code = code;
        this.retryable = retryable;
        this.name = "AnalysisError";
    }
}
exports.AnalysisError = AnalysisError;
/**
 * Build system prompt for bible analysis
 */
function buildSystemPrompt(workInfo, chapterRange) {
    return `당신은 웹소설 분석 전문가입니다. 주어진 챕터들을 분석하여 설정집을 생성합니다.

[작품 정보]
- 제목: ${workInfo.title}
- 장르: ${workInfo.genres.join(", ")}
- 줄거리: ${workInfo.synopsis}
- 원문 언어: ${workInfo.sourceLanguage}
- 분석 범위: ${chapterRange.start}회 ~ ${chapterRange.end}회

[분석 지침]
1. 등장인물: 이름, 역할, 성격, 말투, 관계 등을 추출
2. 용어: 고유명사, 기술명, 지명 등을 원문과 번역어로 정리
3. 이벤트: 주요 사건, 복선, 반전 등을 기록
4. 번역 참고사항: 문체, 분위기, 주의점 등을 정리

[출력 형식]
반드시 아래 JSON 형식으로만 응답하세요:
{
  "characters": [
    {
      "nameOriginal": "원문 이름",
      "nameKorean": "한국어 이름",
      "nameHanja": "한자 (있는 경우)",
      "titles": ["칭호1", "칭호2"],
      "aliases": ["별명1", "별명2"],
      "personality": "성격 설명",
      "speechStyle": "말투 특징",
      "role": "PROTAGONIST|ANTAGONIST|SUPPORTING|MINOR",
      "description": "인물 설명",
      "relationships": {"관계인물": "관계설명"},
      "firstAppearance": 회차번호
    }
  ],
  "terms": [
    {
      "original": "원문",
      "translated": "번역어",
      "category": "CHARACTER|SKILL_TECHNIQUE|ITEM|PLACE|ORGANIZATION|RANK_TITLE|OTHER",
      "note": "참고사항",
      "context": "사용 맥락",
      "firstAppearance": 회차번호
    }
  ],
  "events": [
    {
      "title": "이벤트 제목",
      "description": "상세 설명",
      "chapterStart": 시작회차,
      "chapterEnd": 종료회차,
      "eventType": "PLOT|CHARACTER_DEV|FORESHADOWING|REVEAL|WORLD_BUILDING",
      "importance": "CRITICAL|MAJOR|MINOR",
      "isForeshadowing": false,
      "foreshadowNote": "복선 설명 (해당시)",
      "involvedCharacters": ["인물1", "인물2"]
    }
  ],
  "translationNotes": "번역 시 참고할 전반적인 사항"
}`;
}
/**
 * Analyze error and convert to AnalysisError
 */
function analyzeError(error) {
    if (error instanceof generative_ai_1.GoogleGenerativeAIError) {
        const message = error.message.toLowerCase();
        if (message.includes("quota") || message.includes("rate") || message.includes("429")) {
            return new AnalysisError("API 요청 한도 초과", "RATE_LIMIT", true);
        }
        if (message.includes("safety") || message.includes("blocked")) {
            return new AnalysisError("콘텐츠 안전 정책으로 거부됨", "CONTENT_BLOCKED", false);
        }
        if (message.includes("api key") || message.includes("401")) {
            return new AnalysisError("API 인증 실패", "AUTH_ERROR", false);
        }
        if (message.includes("500") || message.includes("503") || message.includes("server")) {
            return new AnalysisError("AI 서버 오류", "SERVER_ERROR", true);
        }
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new AnalysisError(`분석 오류: ${errorMessage}`, "UNKNOWN_ERROR", true);
}
/**
 * Add jitter to prevent thundering herd
 */
function addJitter(baseMs, fraction = 0.2) {
    const jitter = baseMs * fraction * (Math.random() - 0.5) * 2;
    return Math.max(0, baseMs + jitter);
}
/**
 * Analyze with timeout
 */
async function withTimeout(promise, timeoutMs, operation) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new AnalysisError(`${operation} 시간 초과`, "TIMEOUT", true));
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
 * Analyze content with a specific model
 */
async function analyzeWithModel(genAI, modelName, content, systemPrompt, maxRetries) {
    const model = genAI.getGenerativeModel({ model: modelName });
    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await withTimeout(model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: systemPrompt },
                            { text: `[분석할 챕터 내용]\n\n${content}` },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.3,
                    topP: 0.85,
                    topK: 40,
                    maxOutputTokens: MAX_OUTPUT_TOKENS,
                },
            }), API_TIMEOUT_MS, "분석 API 호출");
            const text = result.response.text();
            if (!text || text.trim().length === 0) {
                throw new AnalysisError("AI가 빈 응답을 반환했습니다", "EMPTY_RESPONSE", true);
            }
            return text;
        }
        catch (error) {
            lastError = error instanceof AnalysisError ? error : analyzeError(error);
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
    throw lastError || new AnalysisError("분석 실패", "MAX_RETRIES", false);
}
/**
 * Parse JSON from AI response
 */
function parseAnalysisResult(text) {
    // Remove markdown code blocks if present
    let jsonText = text.trim();
    if (jsonText.startsWith("```json")) {
        jsonText = jsonText.slice(7);
    }
    else if (jsonText.startsWith("```")) {
        jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith("```")) {
        jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();
    try {
        const parsed = JSON.parse(jsonText);
        // Validate and normalize the result
        return {
            characters: Array.isArray(parsed.characters) ? parsed.characters.map((c) => ({
                nameOriginal: c.nameOriginal || "",
                nameKorean: c.nameKorean || c.nameOriginal || "",
                nameHanja: c.nameHanja,
                titles: Array.isArray(c.titles) ? c.titles : [],
                aliases: Array.isArray(c.aliases) ? c.aliases : [],
                personality: c.personality,
                speechStyle: c.speechStyle,
                role: c.role || "SUPPORTING",
                description: c.description,
                relationships: c.relationships,
                firstAppearance: c.firstAppearance,
            })) : [],
            terms: Array.isArray(parsed.terms) ? parsed.terms.map((t) => ({
                original: t.original || "",
                translated: t.translated || t.original || "",
                category: t.category || "OTHER",
                note: t.note,
                context: t.context,
                firstAppearance: t.firstAppearance,
            })) : [],
            events: Array.isArray(parsed.events) ? parsed.events.map((e) => ({
                title: e.title || "",
                description: e.description || "",
                chapterStart: e.chapterStart || 0,
                chapterEnd: e.chapterEnd,
                eventType: e.eventType || "PLOT",
                importance: e.importance || "MINOR",
                isForeshadowing: !!e.isForeshadowing,
                foreshadowNote: e.foreshadowNote,
                involvedCharacters: Array.isArray(e.involvedCharacters) ? e.involvedCharacters : [],
            })) : [],
            translationNotes: parsed.translationNotes,
        };
    }
    catch (error) {
        throw new AnalysisError(`JSON 파싱 실패: ${error instanceof Error ? error.message : "Unknown error"}`, "PARSE_ERROR", false);
    }
}
/**
 * Main analysis function
 */
async function analyzeBatch(workInfo, chapters, chapterRange, apiKey, maxRetries = 5) {
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    const systemPrompt = buildSystemPrompt(workInfo, chapterRange);
    // Combine chapter contents
    const content = chapters
        .map((ch) => `=== ${ch.number}회 ===\n${ch.originalContent}`)
        .join("\n\n---\n\n");
    // Try each model in priority order
    for (const modelName of MODEL_PRIORITY) {
        try {
            const responseText = await analyzeWithModel(genAI, modelName, content, systemPrompt, maxRetries);
            return parseAnalysisResult(responseText);
        }
        catch (error) {
            const analysisError = error instanceof AnalysisError ? error : analyzeError(error);
            if (!analysisError.retryable && !analysisError.message.includes("503")) {
                throw analysisError;
            }
            // Try next model
        }
    }
    throw new AnalysisError("모든 모델 실패", "ALL_MODELS_FAILED", false);
}
//# sourceMappingURL=gemini.js.map