import {
  genAI,
  log,
  logError,
  API_TIMEOUT_MS,
} from "./client";
import {
  rateLimiter,
  withTimeout,
  addJitter,
  delay,
  TranslationError,
  analyzeError,
} from "./resilience";
import {
  TranslationContext,
  buildRetranslatePrompt,
} from "./prompt";

// 재번역 함수
export async function retranslateText(
  originalContent: string,
  currentTranslation: string,
  feedback: string,
  selectedText: string | undefined,
  context: TranslationContext,
  maxRetries: number = 3
): Promise<string> {
  log("retranslateText 시작", {
    originalLength: originalContent.length,
    translationLength: currentTranslation.length,
    hasSelectedText: !!selectedText,
  });

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const prompt = buildRetranslatePrompt(
    originalContent,
    currentTranslation,
    feedback,
    selectedText,
    context
  );

  let lastError: TranslationError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    log(`재번역 시도 ${attempt + 1}/${maxRetries}`);
    try {
      // Rate Limiter 토큰 획득
      await rateLimiter.acquire();

      // 타임아웃 적용
      const result = await withTimeout(
        model.generateContent({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3, // 재번역은 좀 더 일관성 있게
            topP: 0.85,
            topK: 40,
            maxOutputTokens: 65536,
          },
        }),
        API_TIMEOUT_MS,
        "재번역 API 호출"
      );

      const response = result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new TranslationError(
          "AI가 빈 응답을 반환했습니다.",
          "EMPTY_RESPONSE",
          true
        );
      }

      log("재번역 성공, 결과 길이:", text.length);
      return text;
    } catch (error) {
      lastError = error instanceof TranslationError ? error : analyzeError(error);

      logError(`재번역 시도 ${attempt + 1} 실패:`, {
        code: lastError.code,
        message: lastError.message,
      });

      // Rate limit 에러 시 rate limiter에 알림
      if (lastError.code === "RATE_LIMIT") {
        rateLimiter.onRateLimitError();
      }

      if (!lastError.retryable) {
        throw lastError;
      }

      if (attempt < maxRetries - 1) {
        const baseDelay =
          lastError.code === "RATE_LIMIT" ? 30000 :
          lastError.code === "TIMEOUT" ? 10000 :
          3000;
        const backoffMs = Math.min(baseDelay * Math.pow(1.5, attempt), 60000);
        const waitMs = addJitter(backoffMs);
        log(`${Math.round(waitMs)}ms 후 재시도...`);
        await delay(waitMs);
      }
    }
  }

  throw lastError || new TranslationError(
    "재번역에 실패했습니다. 다시 시도해주세요.",
    "MAX_RETRIES",
    false
  );
}

// ============================================
// AI 표현 개선 (윤문 지원)
// ============================================

export interface ExpressionSuggestion {
  text: string;
  reason: string;
}

/**
 * 선택한 텍스트에 대해 3가지 대안 표현을 제안합니다.
 */
export async function improveExpression(
  selectedText: string,
  context: string,
  genres: string[] = []
): Promise<ExpressionSuggestion[]> {
  const genreNote = genres.length > 0
    ? `이 작품의 장르는 ${genres.join(", ")}입니다. 장르 분위기에 맞는 표현을 제안하세요.`
    : "";

  const systemPrompt = `당신은 전문 한국어 윤문가입니다. 사용자가 선택한 텍스트에 대해 더 나은 3가지 대안 표현을 제안하세요.

규칙:
- 원문의 의미를 정확히 유지하면서 표현력을 높이세요
- 자연스러운 한국어 문체를 사용하세요
- 각 제안은 서로 다른 스타일/뉘앙스를 가져야 합니다
- 번역 투가 아닌 자연스러운 한국어를 사용하세요
${genreNote}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON 배열만 반환하세요:
[
  { "text": "대안 표현 1", "reason": "변경 이유 (10자 이내)" },
  { "text": "대안 표현 2", "reason": "변경 이유 (10자 이내)" },
  { "text": "대안 표현 3", "reason": "변경 이유 (10자 이내)" }
]`;

  const userPrompt = context
    ? `문맥:\n${context}\n\n개선할 텍스트: "${selectedText}"`
    : `개선할 텍스트: "${selectedText}"`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const IMPROVE_TIMEOUT_MS = 30000; // 30초
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await rateLimiter.acquire();

      const result = await withTimeout(
        model.generateContent({
          contents: [
            { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] },
          ],
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        }),
        IMPROVE_TIMEOUT_MS,
        "AI 표현 개선"
      );

      const responseText = result.response.text().trim();

      // Parse JSON from response (handle possible markdown code block wrapping)
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .filter(
          (item: unknown): item is ExpressionSuggestion =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as ExpressionSuggestion).text === "string" &&
            typeof (item as ExpressionSuggestion).reason === "string"
        )
        .slice(0, 3);
    } catch (error) {
      // Last attempt — throw
      if (attempt === MAX_RETRIES - 1) {
        if (error instanceof TranslationError) {
          throw new Error(error.message);
        }
        const mapped = analyzeError(error);
        throw new Error(mapped.message);
      }
      // Retry on transient errors
      console.warn(`[AI Improve] 시도 ${attempt + 1} 실패, 재시도:`, error instanceof Error ? error.message : error);
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  return [];
}
