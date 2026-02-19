import { GoogleGenerativeAIError } from "@google/generative-ai";
import { translationLogger } from "@/lib/translation-logger";
import {
  RATE_LIMIT_RPM,
  RATE_LIMIT_WINDOW_MS,
  getApiKeyCount,
  log,
  logError,
} from "./client";

// ============================================
// Circuit Breaker (API 연속 실패 시 자동 차단)
// ============================================

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;

  constructor(options?: { failureThreshold?: number; resetTimeoutMs?: number }) {
    this.failureThreshold = options?.failureThreshold ?? 5;
    this.resetTimeoutMs = options?.resetTimeoutMs ?? 60000; // 60초
  }

  /**
   * 요청 전 호출 — OPEN 상태면 에러를 던짐
   */
  check(): void {
    if (this.state === "CLOSED") return;

    if (this.state === "OPEN") {
      // 타임아웃 경과 시 HALF_OPEN으로 전환
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = "HALF_OPEN";
        log("Circuit breaker: OPEN → HALF_OPEN (시험 요청 허용)");
        return;
      }
      const remainingSec = Math.ceil((this.resetTimeoutMs - (Date.now() - this.lastFailureTime)) / 1000);
      throw new TranslationError(
        `API 서비스가 일시적으로 중단되었습니다. ${remainingSec}초 후 자동 복구를 시도합니다.`,
        "CIRCUIT_OPEN",
        true
      );
    }

    // HALF_OPEN: 통과 허용 (1건만)
  }

  /**
   * 요청 성공 시 호출
   */
  onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      log("Circuit breaker: HALF_OPEN → CLOSED (복구 성공)");
    }
    this.state = "CLOSED";
    this.failureCount = 0;
  }

  /**
   * 요청 실패 시 호출
   * @param immediate true면 즉시 OPEN (AUTH_ERROR, MODEL_ERROR 등)
   */
  onFailure(immediate: boolean = false): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      log("Circuit breaker: HALF_OPEN → OPEN (복구 실패)");
      return;
    }

    if (immediate || this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      log(`Circuit breaker: CLOSED → OPEN (${immediate ? "치명적 에러" : `연속 ${this.failureCount}회 실패`})`);
    }
  }

  isOpen(): boolean {
    if (this.state !== "OPEN") return false;
    // 타임아웃 경과 확인
    if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
      return false; // check()에서 HALF_OPEN으로 전환됨
    }
    return true;
  }

  getState(): { state: CircuitState; failureCount: number } {
    return { state: this.state, failureCount: this.failureCount };
  }

  // 테스트용 리셋
  reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}

// 글로벌 circuit breaker 인스턴스 (HMR에서도 유지)
const globalForCircuitBreaker = globalThis as unknown as {
  geminiCircuitBreaker: CircuitBreaker | undefined;
};

export const circuitBreaker =
  globalForCircuitBreaker.geminiCircuitBreaker ??
  new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 60000 });

if (process.env.NODE_ENV !== "production") {
  globalForCircuitBreaker.geminiCircuitBreaker = circuitBreaker;
}

// 외부에서 circuit breaker 상태 조회용
export function getCircuitBreakerState() {
  return circuitBreaker.getState();
}

// 글로벌 Rate Limiter (싱글톤) - Promise 기반 큐로 경쟁 조건 방지
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // 밀리초당 토큰 리필 속도
  private pendingQueue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];
  private isProcessing: boolean = false;

  constructor(requestsPerMinute: number) {
    this.maxTokens = requestsPerMinute;
    this.tokens = requestsPerMinute;
    this.lastRefill = Date.now();
    this.refillRate = requestsPerMinute / RATE_LIMIT_WINDOW_MS;
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  private getWaitTimeMs(): number {
    if (this.tokens >= 1) return 0;
    return Math.ceil((1 - this.tokens) / this.refillRate);
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.pendingQueue.length > 0) {
      this.refillTokens();

      if (this.tokens >= 1) {
        // 토큰 사용 가능 - 즉시 처리
        this.tokens -= 1;
        const next = this.pendingQueue.shift();
        next?.resolve();
      } else {
        // 토큰 부족 - 대기 후 재시도
        const waitTime = this.getWaitTimeMs();
        log(`Rate limiter: ${waitTime}ms 대기 중 (큐 대기: ${this.pendingQueue.length})`);
        await new Promise((r) => setTimeout(r, waitTime));
      }
    }

    this.isProcessing = false;
  }

  async acquire(): Promise<void> {
    // 먼저 리필 시도
    this.refillTokens();

    // 큐가 비어있고 토큰이 있으면 즉시 반환 (빠른 경로)
    if (this.pendingQueue.length === 0 && this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // 그 외에는 큐에 추가하고 대기
    return new Promise<void>((resolve, reject) => {
      this.pendingQueue.push({ resolve, reject });
      this.processQueue();
    });
  }

  // Rate limit 에러 시 토큰을 0으로 리셋하고 추가 대기
  onRateLimitError(): void {
    this.tokens = 0;
    this.lastRefill = Date.now();
    log("Rate limiter: API rate limit 에러로 토큰 리셋");
  }

  // 현재 상태 조회 (디버깅용)
  getStatus(): { tokens: number; queueLength: number } {
    this.refillTokens();
    return {
      tokens: Math.floor(this.tokens * 100) / 100,
      queueLength: this.pendingQueue.length,
    };
  }
}

// 글로벌 rate limiter 인스턴스 (HMR에서도 유지)
const globalForRateLimiter = globalThis as unknown as {
  geminiRateLimiter: RateLimiter | undefined;
  geminiRateLimiters: Map<number, RateLimiter> | undefined;
};

// 레거시 단일 rate limiter (기존 코드 호환)
export const rateLimiter =
  globalForRateLimiter.geminiRateLimiter ?? new RateLimiter(RATE_LIMIT_RPM);

// 키별 rate limiter 맵 (API 키 풀링용)
const keyRateLimiters =
  globalForRateLimiter.geminiRateLimiters ?? new Map<number, RateLimiter>();

if (process.env.NODE_ENV !== "production") {
  globalForRateLimiter.geminiRateLimiter = rateLimiter;
  globalForRateLimiter.geminiRateLimiters = keyRateLimiters;
}

/**
 * 특정 API 키 인덱스의 Rate Limiter 가져오기
 * 각 키가 독립적인 rate limit을 가짐 (총 용량 = 키 개수 × 800 RPM)
 */
export function getRateLimiterForKey(keyIndex: number): RateLimiter {
  const keyCount = getApiKeyCount();
  const normalizedIndex = keyIndex % keyCount;

  if (!keyRateLimiters.has(normalizedIndex)) {
    keyRateLimiters.set(normalizedIndex, new RateLimiter(RATE_LIMIT_RPM));
    log(`Rate limiter 생성: 키 인덱스 ${normalizedIndex}`);
  }

  return keyRateLimiters.get(normalizedIndex)!;
}

/**
 * 모든 키의 Rate Limiter 상태 조회
 */
export function getAllRateLimiterStatus(): Record<number, { tokens: number; queueLength: number }> {
  const status: Record<number, { tokens: number; queueLength: number }> = {};
  const keyCount = getApiKeyCount();

  for (let i = 0; i < keyCount; i++) {
    const limiter = keyRateLimiters.get(i);
    if (limiter) {
      status[i] = limiter.getStatus();
    }
  }

  return status;
}

// 타임아웃 래퍼 함수
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TranslationError(
        `${operation} 시간 초과 (${timeoutMs / 1000}초)`,
        "TIMEOUT",
        true // 타임아웃은 재시도 가능
      ));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// Jitter 추가 함수 (thundering herd 방지)
export function addJitter(baseMs: number, jitterFraction: number = 0.2): number {
  const jitter = baseMs * jitterFraction * (Math.random() - 0.5) * 2;
  return Math.max(0, baseMs + jitter);
}

// 에러 타입 정의
export class TranslationError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "TranslationError";
  }
}

// 재시도 로직을 위한 딜레이 함수
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 치명적 에러 로깅 (관리자 알림용)
export async function logCriticalError(code: string, message: string, details?: Record<string, unknown>): Promise<void> {
  console.error(`[CRITICAL ERROR] ${code}: ${message}`, details);

  // DB에 치명적 에러 로깅 (관리자 대시보드에서 확인 가능)
  try {
    await translationLogger.error(`[CRITICAL] ${message}`, {
      category: "SYSTEM" as const,
      errorCode: code,
      metadata: details,
    });
  } catch (e) {
    // 로깅 실패해도 계속 진행
    console.error("[CRITICAL ERROR] 로깅 실패:", e);
  }
}

// Gemini API 에러 분석
export function analyzeError(error: unknown): TranslationError {
  if (error instanceof GoogleGenerativeAIError) {
    const message = error.message.toLowerCase();

    // Rate limit
    if (message.includes("quota") || message.includes("rate") || message.includes("429")) {
      return new TranslationError(
        "API 요청 한도 초과. 잠시 후 다시 시도합니다.",
        "RATE_LIMIT",
        true
      );
    }

    // Content filtering
    if (message.includes("safety") || message.includes("blocked") || message.includes("filter")) {
      return new TranslationError(
        "콘텐츠 안전 정책으로 인해 번역이 거부되었습니다.",
        "CONTENT_BLOCKED",
        false
      );
    }

    // Invalid API key - 치명적 에러, 관리자 알림 필요
    if (message.includes("api key") || message.includes("authentication") || message.includes("401")) {
      // 비동기로 치명적 에러 로깅 (응답 대기 안 함)
      logCriticalError("AUTH_ERROR", "Gemini API 키 인증 실패", {
        originalMessage: error.message,
        timestamp: new Date().toISOString(),
      });
      return new TranslationError(
        "API 인증 실패. 관리자에게 문의하세요.",
        "AUTH_ERROR",
        false
      );
    }

    // Model not available - 치명적 에러
    if (message.includes("model") || message.includes("not found") || message.includes("404")) {
      logCriticalError("MODEL_ERROR", "Gemini 모델 사용 불가", {
        originalMessage: error.message,
        timestamp: new Date().toISOString(),
      });
      return new TranslationError(
        "AI 모델을 사용할 수 없습니다. 관리자에게 문의하세요.",
        "MODEL_ERROR",
        false
      );
    }

    // Server error
    if (message.includes("500") || message.includes("503") || message.includes("server")) {
      return new TranslationError(
        "AI 서버 오류. 잠시 후 다시 시도합니다.",
        "SERVER_ERROR",
        true
      );
    }
  }

  // Network error
  if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("network"))) {
    return new TranslationError(
      "네트워크 연결 오류. 인터넷 연결을 확인하세요.",
      "NETWORK_ERROR",
      true
    );
  }

  // Unknown error
  const errorMessage = error instanceof Error ? error.message : String(error);
  return new TranslationError(
    `번역 중 오류 발생: ${errorMessage}`,
    "UNKNOWN_ERROR",
    false
  );
}
