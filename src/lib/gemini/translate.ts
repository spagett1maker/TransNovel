import { translationLogger } from "@/lib/translation-logger";
import {
  genAI,
  log,
  logError,
  API_TIMEOUT_MS,
  CHUNK_MAX_RETRIES,
  MAX_CONSECUTIVE_FAILURES,
  MAX_FAILURE_RATE,
  MIN_FAILURES_FOR_RATE_CHECK,
  MODEL_PRIORITY,
  TranslationLoggingContext,
} from "./client";
import {
  circuitBreaker,
  rateLimiter,
  withTimeout,
  addJitter,
  delay,
  TranslationError,
  analyzeError,
} from "./resilience";
import {
  TranslationContext,
  filterContextForContent,
  buildSystemPrompt,
} from "./prompt";
import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const TITLE_MARKER = "【제목】";

/**
 * 원문 앞에 제목 마커를 붙여서 Gemini가 함께 번역하도록 함
 */
export function prependChapterTitle(content: string, title: string | null | undefined): string {
  if (!title || !title.trim()) return content;
  return `${TITLE_MARKER}${title.trim()}\n\n${content}`;
}

/**
 * 번역 결과에서 제목 마커를 파싱하여 제목과 본문을 분리
 */
export function extractTranslatedTitle(translatedContent: string): {
  translatedTitle: string | null;
  content: string;
} {
  const match = translatedContent.match(/^【제목】(.+)\n\n?/);
  if (match) {
    return {
      translatedTitle: match[1].trim(),
      content: translatedContent.slice(match[0].length),
    };
  }
  return { translatedTitle: null, content: translatedContent };
}

/**
 * 단일 모델로 청크 번역 시도
 */
async function tryTranslateChunkWithModel(
  modelName: string,
  content: string,
  systemPrompt: string,
  maxRetries: number
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });

  let lastError: TranslationError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    log(`[${modelName}] 청크 번역 시도 ${attempt + 1}/${maxRetries}`);
    try {
      // 0. Circuit Breaker 확인
      circuitBreaker.check();

      // 1. Rate Limiter 토큰 획득 (초당 요청 수 제한)
      await rateLimiter.acquire();

      const startTime = Date.now();

      // 2. API 호출에 타임아웃 적용
      const result = await withTimeout(
        model.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                { text: systemPrompt },
                {
                  text: `
═══════════════════════════════════════════════════════════════
[원문 시작]
═══════════════════════════════════════════════════════════════

${content}

═══════════════════════════════════════════════════════════════
[원문 끝]
═══════════════════════════════════════════════════════════════`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            topP: 0.85,
            topK: 40,
            maxOutputTokens: 65536,
          },
          safetySettings,
        }),
        API_TIMEOUT_MS,
        "청크 번역 API 호출"
      );

      const elapsed = Date.now() - startTime;
      log(`[${modelName}] 청크 번역 API 응답 수신 (${elapsed}ms 소요)`);

      const response = result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        logError(`[${modelName}] 빈 응답 수신됨`);
        throw new TranslationError(
          "AI가 빈 응답을 반환했습니다.",
          "EMPTY_RESPONSE",
          true
        );
      }

      log(`[${modelName}] 청크 번역 성공, 결과 길이:`, text.length);
      circuitBreaker.onSuccess();
      return text;
    } catch (error) {
      lastError = error instanceof TranslationError ? error : analyzeError(error);

      logError(`[${modelName}] 청크 번역 시도 ${attempt + 1} 실패:`, {
        code: lastError.code,
        message: lastError.message,
      });

      // Circuit Breaker 실패 보고 (AUTH/MODEL 에러는 즉시 차단)
      const isCritical = lastError.code === "AUTH_ERROR" || lastError.code === "MODEL_ERROR";
      if (lastError.code !== "CIRCUIT_OPEN") {
        circuitBreaker.onFailure(isCritical);
      }

      // Rate limit 에러 시 rate limiter에 알림
      if (lastError.code === "RATE_LIMIT") {
        rateLimiter.onRateLimitError();
      }

      // 503/overloaded 에러면 다음 모델로 넘어가기 위해 throw
      const is503 = lastError.message.includes("503") || lastError.message.includes("overloaded");
      if (is503) {
        throw lastError;
      }

      // 재시도 불가능한 오류는 즉시 실패
      if (!lastError.retryable) {
        throw lastError;
      }

      // 마지막 시도가 아니면 지수 백오프로 대기 (jitter 포함)
      if (attempt < maxRetries - 1) {
        // Rate limit/타임아웃 에러는 더 긴 대기 시간
        const baseDelay =
          lastError.code === "RATE_LIMIT" ? 30000 :  // 30초
          lastError.code === "TIMEOUT" ? 10000 :      // 10초
          lastError.code === "CIRCUIT_OPEN" ? 5000 :   // 5초 (circuit breaker 대기)
          3000;                                        // 3초

        const backoffMs = Math.min(baseDelay * Math.pow(1.5, attempt), 120000); // 최대 2분
        const waitMs = addJitter(backoffMs);
        log(`[${modelName}] ${Math.round(waitMs)}ms 후 재시도...`);
        await delay(waitMs);
      }
    }
  }

  throw lastError || new TranslationError(
    `${modelName} 청크 번역 실패`,
    "MAX_RETRIES",
    false
  );
}

/**
 * 청크 번역 (모델 Fallback 지원)
 */
export async function translateText(
  content: string,
  context: TranslationContext,
  maxRetries: number = 5
): Promise<string> {
  log("translateText 시작", { contentLength: content.length, title: context.titleKo });

  // 프롬프트 최적화: 청크에 등장하는 용어/인물만 포함
  const filteredContext = filterContextForContent(context, content);
  const systemPrompt = buildSystemPrompt(filteredContext);
  log("시스템 프롬프트 생성 완료 (필터링 적용), 길이:", systemPrompt.length);

  let lastError: TranslationError | null = null;

  // 모델 순서대로 시도 (Fallback)
  for (const modelName of MODEL_PRIORITY) {
    try {
      log(`청크 번역 모델 시도: ${modelName}`);
      return await tryTranslateChunkWithModel(modelName, content, systemPrompt, maxRetries);
    } catch (error) {
      lastError = error instanceof TranslationError ? error : analyzeError(error);
      logError(`청크 번역 모델 ${modelName} 실패:`, lastError.message);

      // 503/overloaded 에러면 다음 모델로
      const is503 = lastError.message.includes("503") || lastError.message.includes("overloaded");
      if (!is503 && !lastError.retryable) {
        throw lastError;
      }

      log(`다음 모델로 fallback...`);
    }
  }

  // 모든 모델 실패
  logError("청크 번역 모든 모델 실패");
  throw lastError || new TranslationError(
    "번역에 실패했습니다. 다시 시도해주세요.",
    "ALL_MODELS_FAILED",
    false
  );
}

// 토큰 기반 동적 청크 사이징
// Gemini 2.5 Flash 출력 한도: 65536 토큰
// 번역은 출력 ≈ 입력이므로 출력 토큰이 병목
const MAX_OUTPUT_TOKENS = 65536;
const TARGET_CHUNK_TOKENS = Math.floor(MAX_OUTPUT_TOKENS * 0.9); // ~59000 토큰

/**
 * 토큰 예산에 맞는 최대 글자 수를 계산
 * 텍스트의 CJK 비율을 측정하여 글자당 토큰 비율을 역산
 */
function maxCharsForTokenBudget(sampleText: string, tokenBudget: number): number {
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/g;
  const cjkMatches = sampleText.match(cjkPattern);
  const cjkCount = cjkMatches?.length ?? 0;
  const totalChars = sampleText.length || 1;
  const cjkRatio = cjkCount / totalChars;

  // 가중 평균 토큰/글자 비율: CJK=1.5, non-CJK=0.25
  const avgTokensPerChar = cjkRatio * 1.5 + (1 - cjkRatio) * 0.25;
  const maxChars = Math.floor(tokenBudget / avgTokensPerChar);

  log("maxCharsForTokenBudget", {
    cjkRatio: (cjkRatio * 100).toFixed(1) + "%",
    avgTokensPerChar: avgTokensPerChar.toFixed(3),
    tokenBudget,
    maxChars,
  });

  return maxChars;
}

// 동적 청크 임계값 계산 (최소 8000자 보장)
export function getChunkThreshold(text: string): number {
  return Math.max(8000, maxCharsForTokenBudget(text, TARGET_CHUNK_TOKENS));
}

export function getChunkSize(text: string): number {
  return Math.max(8000, maxCharsForTokenBudget(text, TARGET_CHUNK_TOKENS));
}

// 대형 챕터 임계값 (이 이상이면 청크 분할 처리)
export const LARGE_CHAPTER_THRESHOLD = 40000; // 약 10청크 이상

// 대형 챕터 진행 상태 타입
export interface LargeChapterProgress {
  isLargeChapter: true;
  totalChunks: number;
  processedChunks: number;
  partialResults: string[];
}

// 대형 챕터 청크 진행률 콜백
export type LargeChapterProgressCallback = (
  currentChunk: number,
  totalChunks: number
) => void | Promise<void>;

/**
 * 챕터 전체를 번역 (Vercel Pro 플랜용)
 * - 토큰 예산 이내: 한 번에 번역하여 맥락 유지 및 품질 향상
 * - 토큰 예산 초과: 자동으로 청크 분할 후 번역하여 타임아웃 방지
 */
export async function translateChapter(
  content: string,
  context: TranslationContext,
  maxRetries: number = 5,
  onChunkProgress?: LargeChapterProgressCallback
): Promise<string> {
  const chunkThreshold = getChunkThreshold(content);
  log("translateChapter 시작", {
    contentLength: content.length,
    chunkThreshold,
    title: context.titleKo,
  });

  // 대형 챕터는 자동으로 청크 분할
  if (content.length > chunkThreshold) {
    log(`대형 챕터 감지 (${content.length}자 > ${chunkThreshold}자), 청크 분할 번역 진행`);
    return translateLargeChapter(content, context, maxRetries, onChunkProgress);
  }

  // 소형 챕터는 한 번에 번역
  return translateSingleChapter(content, context, maxRetries);
}

/**
 * 대형 챕터를 청크로 분할하여 번역
 */
async function translateLargeChapter(
  content: string,
  context: TranslationContext,
  maxRetries: number,
  onChunkProgress?: LargeChapterProgressCallback
): Promise<string> {
  const dynamicChunkSize = getChunkSize(content);
  const chunks = splitIntoChunks(content, dynamicChunkSize);
  log(`대형 챕터 청크 분할: ${chunks.length}개 청크`, {
    contentLength: content.length,
    chunkSizes: chunks.map(c => c.length),
  });

  // 청크 진행률을 콜백으로 전달
  const { results, failedChunks } = await translateChunks(
    chunks,
    context,
    onChunkProgress
      ? async (current, total) => {
          await onChunkProgress(current, total);
        }
      : undefined
  );

  if (failedChunks.length > 0) {
    logError(`대형 챕터 번역 중 ${failedChunks.length}개 청크 실패`, {
      failedChunks,
      totalChunks: chunks.length,
    });
  }

  return results.join("\n\n");
}

/**
 * 단일 모델로 챕터 번역 시도
 */
async function tryTranslateWithModel(
  modelName: string,
  content: string,
  systemPrompt: string,
  maxRetries: number
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });

  let lastError: TranslationError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    log(`[${modelName}] 챕터 번역 시도 ${attempt + 1}/${maxRetries}`);
    try {
      // 0. Circuit Breaker 확인
      circuitBreaker.check();

      // 1. Rate Limiter 토큰 획득
      await rateLimiter.acquire();

      const startTime = Date.now();

      // 2. API 호출에 타임아웃 적용
      const result = await withTimeout(
        model.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                { text: systemPrompt },
                {
                  text: `
═══════════════════════════════════════════════════════════════
[원문 시작]
═══════════════════════════════════════════════════════════════

${content}

═══════════════════════════════════════════════════════════════
[원문 끝]
═══════════════════════════════════════════════════════════════`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            topP: 0.85,
            topK: 40,
            maxOutputTokens: 65536,
          },
          safetySettings,
        }),
        API_TIMEOUT_MS,
        "챕터 번역 API 호출"
      );

      const elapsed = Date.now() - startTime;
      log(`[${modelName}] 챕터 번역 API 응답 수신 (${elapsed}ms 소요)`);

      const response = result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new TranslationError(
          "AI가 빈 응답을 반환했습니다.",
          "EMPTY_RESPONSE",
          true
        );
      }

      log(`[${modelName}] 챕터 번역 성공, 결과 길이:`, text.length);
      circuitBreaker.onSuccess();
      return text;
    } catch (error) {
      lastError = error instanceof TranslationError ? error : analyzeError(error);

      logError(`[${modelName}] 챕터 번역 시도 ${attempt + 1} 실패:`, {
        code: lastError.code,
        message: lastError.message,
      });

      // Circuit Breaker 실패 보고
      const isCritical = lastError.code === "AUTH_ERROR" || lastError.code === "MODEL_ERROR";
      if (lastError.code !== "CIRCUIT_OPEN") {
        circuitBreaker.onFailure(isCritical);
      }

      // Rate limit 에러 시 rate limiter에 알림
      if (lastError.code === "RATE_LIMIT") {
        rateLimiter.onRateLimitError();
      }

      // 503/overloaded 에러면 다음 모델로 넘어가기 위해 throw
      const is503 = lastError.message.includes("503") || lastError.message.includes("overloaded");
      if (is503) {
        throw lastError;
      }

      // 재시도 불가능한 오류는 즉시 실패
      if (!lastError.retryable) {
        throw lastError;
      }

      // 마지막 시도가 아니면 지수 백오프로 대기
      if (attempt < maxRetries - 1) {
        const baseDelay =
          lastError.code === "RATE_LIMIT" ? 30000 :
          lastError.code === "TIMEOUT" ? 15000 :
          lastError.code === "CIRCUIT_OPEN" ? 5000 :
          5000;

        const backoffMs = Math.min(baseDelay * Math.pow(1.5, attempt), 120000);
        const waitMs = addJitter(backoffMs);
        log(`[${modelName}] ${Math.round(waitMs)}ms 후 재시도...`);
        await delay(waitMs);
      }
    }
  }

  throw lastError || new TranslationError(
    `${modelName} 번역 실패`,
    "MAX_RETRIES",
    false
  );
}

/**
 * 소형 챕터를 한 번에 번역 (모델 Fallback 지원)
 */
async function translateSingleChapter(
  content: string,
  context: TranslationContext,
  maxRetries: number
): Promise<string> {
  // 프롬프트 최적화: 챕터에 등장하는 용어/인물만 포함
  const filteredContext = filterContextForContent(context, content);
  const systemPrompt = buildSystemPrompt(filteredContext);
  log("시스템 프롬프트 생성 완료 (필터링 적용), 길이:", systemPrompt.length);

  let lastError: TranslationError | null = null;

  // 모델 순서대로 시도 (Fallback)
  for (const modelName of MODEL_PRIORITY) {
    try {
      log(`모델 시도: ${modelName}`);
      return await tryTranslateWithModel(modelName, content, systemPrompt, maxRetries);
    } catch (error) {
      lastError = error instanceof TranslationError ? error : analyzeError(error);
      logError(`모델 ${modelName} 실패:`, lastError.message);

      // 503/overloaded 에러면 다음 모델로
      const is503 = lastError.message.includes("503") || lastError.message.includes("overloaded");
      if (!is503 && !lastError.retryable) {
        throw lastError;
      }

      log(`다음 모델로 fallback...`);
    }
  }

  // 모든 모델 실패
  logError("챕터 번역 모든 모델 실패");
  throw lastError || new TranslationError(
    "챕터 번역에 실패했습니다. 다시 시도해주세요.",
    "ALL_MODELS_FAILED",
    false
  );
}

export interface ChunkTranslationResult {
  index: number;
  success: boolean;
  content?: string;
  error?: string;
}

// 중간 저장 콜백 타입 (async 지원)
export type ChunkProgressCallback = (
  current: number,
  total: number,
  result: ChunkTranslationResult,
  accumulatedResults: string[]  // 현재까지의 번역 결과
) => void | Promise<void>;

export async function translateChunks(
  chunks: string[],
  context: TranslationContext,
  onProgress?: ChunkProgressCallback,
  startFromChunk: number = 0,  // 이어서 번역할 시작 청크 인덱스
  loggingContext?: TranslationLoggingContext  // DB 로깅용 컨텍스트
): Promise<{ results: string[]; failedChunks: number[] }> {
  log("translateChunks 시작", {
    totalChunks: chunks.length,
    startFromChunk,
    title: context.titleKo
  });

  // 로깅 헬퍼
  const logToDb = async (message: string, errorCode?: string, chunkIndex?: number, retryCount?: number) => {
    if (loggingContext?.jobId) {
      await translationLogger.error(message, {
        category: "API_CALL" as const,
        jobId: loggingContext.jobId,
        workId: loggingContext.workId,
        chapterId: loggingContext.chapterId,
        chapterNum: loggingContext.chapterNum,
        chunkIndex,
        userId: loggingContext.userId,
        userEmail: loggingContext.userEmail,
        errorCode,
        retryCount,
      });
    }
  };

  const results: string[] = [];
  const failedChunks: number[] = [];
  let consecutiveFailures = 0; // 연속 실패 카운터

  for (let i = startFromChunk; i < chunks.length; i++) {
    // Rate limiter가 이미 속도를 제어하지만, 추가 안전 딜레이
    if (i > startFromChunk) {
      const chunkDelay = addJitter(2000); // 2초 + jitter (순차 처리 안정성)
      await delay(chunkDelay);
    }

    log(`청크 ${i + 1}/${chunks.length} 번역 시작`);

    // 청크 레벨 재시도 로직
    let chunkSuccess = false;
    let lastChunkError: TranslationError | null = null;

    for (let chunkRetry = 0; chunkRetry < CHUNK_MAX_RETRIES; chunkRetry++) {
      try {
        const translated = await translateText(chunks[i], context);
        results.push(translated);
        consecutiveFailures = 0; // 성공하면 연속 실패 리셋
        chunkSuccess = true;

        // 콜백에 현재까지의 결과 전달 (중간 저장용)
        if (onProgress) {
          await onProgress(i + 1, chunks.length, {
            index: i,
            success: true,
            content: translated,
          }, results);
        }
        break; // 성공 시 재시도 루프 탈출

      } catch (error) {
        lastChunkError = error instanceof TranslationError
          ? error
          : analyzeError(error);

        logError(`청크 ${i + 1} 번역 시도 ${chunkRetry + 1}/${CHUNK_MAX_RETRIES} 실패:`, {
          code: lastChunkError.code,
          message: lastChunkError.message,
        });

        // 재시도 불가능한 오류는 즉시 중단
        if (!lastChunkError.retryable) {
          log(`청크 ${i + 1}: 재시도 불가능한 오류로 재시도 중단`);
          break;
        }

        // 마지막 재시도가 아니면 대기 후 재시도
        if (chunkRetry < CHUNK_MAX_RETRIES - 1) {
          const retryDelay = addJitter(5000 * (chunkRetry + 1)); // 5초, 10초, 15초...
          log(`청크 ${i + 1}: ${Math.round(retryDelay)}ms 후 재시도 (${chunkRetry + 2}/${CHUNK_MAX_RETRIES})`);
          await delay(retryDelay);
        }
      }
    }

    // 청크 최종 실패 처리
    if (!chunkSuccess && lastChunkError) {
      // DB에 에러 로깅
      await logToDb(
        `청크 ${i + 1}/${chunks.length} 번역 실패 (${CHUNK_MAX_RETRIES}회 재시도 후): ${lastChunkError.message}`,
        lastChunkError.code,
        i,
        CHUNK_MAX_RETRIES
      );

      // 실패한 청크는 원문으로 대체하고 표시
      results.push(`[번역 실패: ${lastChunkError.message}]\n\n${chunks[i]}`);
      failedChunks.push(i);
      consecutiveFailures++;

      if (onProgress) {
        await onProgress(i + 1, chunks.length, {
          index: i,
          success: false,
          error: lastChunkError.message,
        }, results);
      }

      // 연속 실패 시 추가 대기 (rate limit 회복 시간)
      if (consecutiveFailures >= 2) {
        const recoveryDelay = addJitter(10000 * consecutiveFailures); // 연속 실패마다 10초씩 증가
        log(`연속 ${consecutiveFailures}회 실패, ${Math.round(recoveryDelay)}ms 추가 대기`);
        await delay(recoveryDelay);

        // 연속 실패 로깅
        await logToDb(
          `연속 ${consecutiveFailures}회 실패, ${Math.round(recoveryDelay)}ms 대기`,
          "CONSECUTIVE_WAIT",
          i
        );
      }

      // Circuit Breaker가 열렸으면 즉시 중단
      if (circuitBreaker.isOpen()) {
        logError("Circuit breaker OPEN 상태로 청크 번역 중단", {
          failedChunks,
          processedChunks: i - startFromChunk + 1,
          totalChunks: chunks.length,
        });
        break;
      }

      // 재시도 불가능한 오류가 연속 N회 이상이면 중단
      if (!lastChunkError.retryable && consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logError("연속 비재시도 오류로 번역 중단", {
          failedChunks,
          consecutiveFailures,
          threshold: MAX_CONSECUTIVE_FAILURES,
        });
        throw new TranslationError(
          `연속 오류로 번역 중단: ${lastChunkError.message}`,
          "CONSECUTIVE_FAILURES",
          false
        );
      }

      // 전체 실패율이 임계값 초과하면 중단
      const processedCount = i - startFromChunk + 1;
      if (failedChunks.length > processedCount * MAX_FAILURE_RATE && failedChunks.length >= MIN_FAILURES_FOR_RATE_CHECK) {
        logError(`실패율 ${MAX_FAILURE_RATE * 100}% 초과로 번역 중단`, {
          failedCount: failedChunks.length,
          processedChunks: processedCount,
          failureRate: (failedChunks.length / processedCount * 100).toFixed(1) + '%',
        });
        throw new TranslationError(
          `실패율이 너무 높습니다 (${failedChunks.length}/${processedCount} 실패)`,
          "HIGH_FAILURE_RATE",
          false
        );
      }
    }
  }

  log("translateChunks 완료", {
    totalResults: results.length,
    failedCount: failedChunks.length,
  });

  return { results, failedChunks };
}

// 토큰 추정 (CJK 문자는 대략 1-2 토큰, 영문은 4자당 1토큰)
function estimateTokens(text: string): number {
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/g;
  const cjkMatches = text.match(cjkPattern);
  const cjkCount = cjkMatches?.length ?? 0;
  const nonCjkCount = text.length - cjkCount;

  // CJK는 대략 1.5토큰/글자, 영문/숫자는 0.25토큰/글자
  return Math.ceil(cjkCount * 1.5 + nonCjkCount * 0.25);
}

// 긴 문단을 문장 단위로 분할
function splitLongParagraph(paragraph: string, maxLength: number): string[] {
  if (paragraph.length <= maxLength) {
    return [paragraph];
  }

  const results: string[] = [];
  // 중국어/한국어/일본어 문장 구분자
  const sentenceDelimiters = /([。！？.!?]+["」』"']*)\s*/g;
  const sentences: string[] = [];
  let lastIndex = 0;

  let match;
  while ((match = sentenceDelimiters.exec(paragraph)) !== null) {
    const sentence = paragraph.slice(lastIndex, match.index + match[0].length);
    sentences.push(sentence.trim());
    lastIndex = match.index + match[0].length;
  }

  // 마지막 남은 부분
  if (lastIndex < paragraph.length) {
    const remaining = paragraph.slice(lastIndex).trim();
    if (remaining) {
      sentences.push(remaining);
    }
  }

  // 문장이 분리되지 않으면 강제로 자르기
  if (sentences.length === 0) {
    sentences.push(paragraph);
  }

  // 문장들을 청크로 합치기
  let currentChunk = "";
  for (const sentence of sentences) {
    // 단일 문장이 maxLength를 초과하면 강제로 분할
    if (sentence.length > maxLength) {
      if (currentChunk) {
        results.push(currentChunk.trim());
        currentChunk = "";
      }
      // 강제 분할 (maxLength 단위로)
      for (let i = 0; i < sentence.length; i += maxLength) {
        results.push(sentence.slice(i, i + maxLength));
      }
      continue;
    }

    if (currentChunk.length + sentence.length > maxLength && currentChunk) {
      results.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk.trim()) {
    results.push(currentChunk.trim());
  }

  return results;
}

// Gemini 입력 토큰 한도 (안전 마진 포함)
const MAX_INPUT_TOKENS = 30000; // Gemini 2.5 Flash는 1M 토큰 지원, 안전하게 30K로 제한
const WARN_TOKEN_THRESHOLD = 20000;

// Vercel Hobby 플랜 (10초 제한)에서 안정적으로 동작하도록 500자로 설정
export function splitIntoChunks(text: string, maxLength: number = 500): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // 긴 문단은 먼저 분할
    const splitParagraphs = splitLongParagraph(paragraph, maxLength);

    for (const subParagraph of splitParagraphs) {
      if (currentChunk.length + subParagraph.length > maxLength && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = subParagraph;
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + subParagraph;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // 토큰 검증 및 로깅
  for (let i = 0; i < chunks.length; i++) {
    const tokens = estimateTokens(chunks[i]);
    if (tokens > MAX_INPUT_TOKENS) {
      logError(`청크 ${i + 1} 토큰 한도 초과! (${tokens} > ${MAX_INPUT_TOKENS})`, {
        chunkLength: chunks[i].length,
        estimatedTokens: tokens,
      });
    } else if (tokens > WARN_TOKEN_THRESHOLD) {
      log(`청크 ${i + 1} 토큰 경고: ${tokens}개 (높은 편)`, {
        chunkLength: chunks[i].length,
      });
    }
  }

  log("청크 분할 완료", {
    totalChunks: chunks.length,
    avgChunkLength: Math.round(chunks.reduce((acc, c) => acc + c.length, 0) / chunks.length),
    maxChunkLength: Math.max(...chunks.map(c => c.length)),
    totalEstimatedTokens: chunks.reduce((acc, c) => acc + estimateTokens(c), 0),
  });

  return chunks;
}
