// Barrel re-export — @/lib/gemini 경로 호환성 유지

// client
export {
  getNextGeminiApiKey,
  getGeminiApiKeyByIndex,
  getApiKeyPoolStatus,
  getApiKeyCount,
  genAI,
  createGenAIClient,
  log,
  logError,
  API_TIMEOUT_MS,
  RATE_LIMIT_RPM,
  RATE_LIMIT_WINDOW_MS,
  CHUNK_MAX_RETRIES,
  MODEL_PRIORITY,
  MAX_CONSECUTIVE_FAILURES,
  MAX_FAILURE_RATE,
  MIN_FAILURES_FOR_RATE_CHECK,
} from "./client";
export type { TranslationLoggingContext } from "./client";

// resilience
export {
  CircuitBreaker,
  circuitBreaker,
  getCircuitBreakerState,
  rateLimiter,
  getRateLimiterForKey,
  getAllRateLimiterStatus,
  withTimeout,
  addJitter,
  TranslationError,
  delay,
  logCriticalError,
  analyzeError,
} from "./resilience";

// prompt
export {
  filterContextForContent,
  buildSystemPrompt,
  buildRetranslatePrompt,
} from "./prompt";
export type { TranslationContext } from "./prompt";

// translate
export {
  translateText,
  getChunkThreshold,
  getChunkSize,
  LARGE_CHAPTER_THRESHOLD,
  translateChapter,
  translateChunks,
  splitIntoChunks,
  prependChapterTitle,
  extractTranslatedTitle,
} from "./translate";
export type {
  LargeChapterProgress,
  LargeChapterProgressCallback,
  ChunkTranslationResult,
  ChunkProgressCallback,
} from "./translate";

// retranslate
export {
  retranslateText,
  improveExpression,
} from "./retranslate";
export type { ExpressionSuggestion } from "./retranslate";
