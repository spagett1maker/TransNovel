import { GoogleGenerativeAI, GoogleGenerativeAIError } from "@google/generative-ai";
import { translationLogger } from "@/lib/translation-logger";

// API 키 검증 - 빈 문자열 기본값 대신 명확한 에러 발생
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("[CRITICAL] GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.");
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "MISSING_API_KEY");

// 번역 컨텍스트에 로깅 정보 추가
export interface TranslationLoggingContext {
  jobId?: string;
  workId?: string;
  chapterId?: string;
  chapterNum?: number;
  userId?: string;
  userEmail?: string;
}

// 조건부 로깅 - 프로덕션에서는 비활성화
const isDev = process.env.NODE_ENV === "development";
const log = (...args: unknown[]) => {
  if (isDev) console.log("[Gemini]", ...args);
};
const logError = (...args: unknown[]) => {
  console.error("[Gemini]", ...args);
};

// ============================================
// API 타임아웃 및 Rate Limiter 설정
// ============================================

// Vercel Pro 플랜: 최대 300초 (5분) 함수 실행 시간
// 챕터 전체 번역을 위해 타임아웃 대폭 증가
const API_TIMEOUT_MS = 180000; // 180초 (3분) - 긴 챕터 대응
const RATE_LIMIT_RPM = 10; // 분당 최대 요청 수 (안정성을 위해 10으로 제한)
const RATE_LIMIT_WINDOW_MS = 60000; // 1분 윈도우

// 실패 임계값 설정
const MAX_CONSECUTIVE_FAILURES = 5; // 연속 실패 허용 횟수 (기존 3 -> 5)
const MAX_FAILURE_RATE = 0.3; // 최대 실패율 30% (기존 20% -> 30%)
const MIN_FAILURES_FOR_RATE_CHECK = 10; // 실패율 체크 시작 최소 실패 수 (기존 5 -> 10)

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

const circuitBreaker =
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
};

const rateLimiter =
  globalForRateLimiter.geminiRateLimiter ?? new RateLimiter(RATE_LIMIT_RPM);

if (process.env.NODE_ENV !== "production") {
  globalForRateLimiter.geminiRateLimiter = rateLimiter;
}

// 타임아웃 래퍼 함수
async function withTimeout<T>(
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
function addJitter(baseMs: number, jitterFraction: number = 0.2): number {
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

interface CharacterInfo {
  nameOriginal: string;
  nameKorean: string;
  role: string;
  speechStyle?: string;
  personality?: string;
}

export interface TranslationContext {
  titleKo: string;
  genres: string[];
  ageRating: string;
  synopsis: string;
  glossary?: Array<{ original: string; translated: string; note?: string }>;
  characters?: CharacterInfo[];
  translationGuide?: string;
}

// 장르별 번역 스타일 가이드
const GENRE_GUIDES: Record<string, string> = {
  무협: `- 무공 명칭, 문파 명칭은 한자 음독을 살리되 자연스러운 한국어 무협체로 번역
- 내공, 기, 경지 등 무협 고유 용어는 기존 한국 무협소설 관례를 따름
- 고어체와 현대어를 적절히 혼용하여 무협 특유의 분위기 연출
- 싸움/비무 장면은 슬로모션처럼 임팩트 있게 묘사`,
  로맨스: `- 감성적이고 서정적인 문체로 감정 표현을 섬세하게 살림
- 설렘, 긴장감 등 감정의 미묘한 결을 살려 번역
- 대화문에서 캐릭터 간 감정선과 케미스트리 강조`,
  로판: `- 로맨스 판타지 특유의 우아하고 품격 있는 문체 유지
- 귀족/궁정 배경의 격식체와 존칭 체계 일관되게 적용
- 여주인공의 당당함과 지적인 매력을 살리는 표현 선택`,
  판타지: `- 판타지 세계관의 용어(마법, 스킬, 레벨 등)를 일관되게 번역
- 이세계/게임 판타지의 경우 한국 웹소설 트렌드에 맞게 현지화
- 스탯, 스킬창, 시스템 메시지 등은 간결하고 직관적으로`,
  현대판타지: `- 현실 배경에 판타지 요소가 섞인 장르의 특성 살림
- 일상적 대화와 초월적 상황의 대비를 통해 재미 극대화
- 힘숨찐(힘을 숨긴 찐) 주인공의 이중적 말투 잘 표현`,
  BL: `- BL 장르 특성에 맞는 감성적인 문체와 표현 사용
- 캐릭터 간 관계성과 감정선을 세밀하게 묘사
- 수위에 따른 적절한 표현 조절`,
  액션: `- 박진감 넘치는 문체로 액션 장면의 긴장감을 살림
- 짧고 임팩트 있는 문장으로 속도감 연출
- 전투 장면은 영화적 연출처럼 시각적으로 묘사`,
  스릴러: `- 긴장감과 서스펜스를 유지하는 문체로 번역
- 복선과 반전의 뉘앙스를 놓치지 않고 전달
- 불안감과 긴박감을 조성하는 단어 선택`,
  기타: `- 일반적인 소설 문체로 자연스럽게 번역
- 원작의 톤앤매너를 최대한 유지`,
};

// 연령등급별 표현 가이드
const AGE_GUIDES: Record<string, string> = {
  ALL: `- 전체 연령가에 적합한 순화된 표현 사용
- 폭력/선정적 묘사는 암시적으로만 처리
- 욕설은 순화하거나 '**' 처리`,
  FIFTEEN: `- 15세 이상 적합한 수준의 표현 사용
- 가벼운 폭력/로맨스 묘사 허용
- 심한 욕설은 순화 처리`,
  NINETEEN: `- 성인 대상 콘텐츠에 적합한 표현 사용
- 원작의 수위를 유지하되 지나친 노출은 조절
- 자극적 표현도 문맥에 맞게 살림`,
};

function buildSystemPrompt(context: TranslationContext): string {
  const genreGuides = context.genres
    .map((g) => GENRE_GUIDES[g] || GENRE_GUIDES["기타"])
    .join("\n\n");
  const ageGuide = AGE_GUIDES[context.ageRating] || AGE_GUIDES["ALL"];

  // 용어집 섹션
  let glossarySection = "";
  if (context.glossary && context.glossary.length > 0) {
    glossarySection = `
[PART 4. 용어집 (Setting Bible)]
아래 용어는 반드시 지정된 번역어를 사용하십시오.

| 원문 | 번역 | 비고 |
|------|------|------|
${context.glossary.map((g) => `| ${g.original} | ${g.translated} | ${g.note || ""} |`).join("\n")}
`;
  }

  // 인물 정보 섹션
  let characterSection = "";
  if (context.characters && context.characters.length > 0) {
    const mainCharacters = context.characters.filter(
      (c) => c.role === "PROTAGONIST" || c.role === "ANTAGONIST"
    );
    const supportingCharacters = context.characters.filter(
      (c) => c.role === "SUPPORTING"
    );

    characterSection = `
[PART 5. 인물 정보 (Character Bible)]
번역 시 각 인물의 말투와 성격을 일관되게 유지하십시오.

## 주요 인물
${mainCharacters.map((c) => `- **${c.nameOriginal}** → **${c.nameKorean}** (${c.role === "PROTAGONIST" ? "주인공" : "적대자"})
  ${c.speechStyle ? `말투: ${c.speechStyle}` : ""}
  ${c.personality ? `성격: ${c.personality}` : ""}`).join("\n\n")}

${supportingCharacters.length > 0 ? `## 조연
${supportingCharacters.slice(0, 10).map((c) => `- **${c.nameOriginal}** → **${c.nameKorean}**${c.speechStyle ? ` (${c.speechStyle})` : ""}`).join("\n")}` : ""}
`;
  }

  // 번역 가이드 섹션
  let translationGuideSection = "";
  if (context.translationGuide) {
    translationGuideSection = `
[PART 6. 작품별 번역 가이드]
${context.translationGuide}
`;
  }

  return `[System Role]
당신은 대한민국 웹소설 시장(카카오페이지, 네이버 시리즈)에서 활동하는 **'S급 ${context.genres.join("/")} 전문 각색 번역가'**입니다.
원작의 재미를 살리면서 한국 독자 트렌드(사이다 전개, 빠른 호흡, 감정이입)에 맞춰 **'초월 번역(Transcreation)'** 및 **'윤문(Polishing)'**을 수행합니다.

═══════════════════════════════════════════════════════════════

[PART 1. 절대 원칙 (Critical Protocol)]
⚠️ 이 항목은 타협 불가능한 최우선 명령입니다.

1. **창작 금지 (NO IMPROVISATION)**
   - 입력받은 원문 텍스트의 범위 내에서만 번역 및 각색을 수행
   - 원문에 없는 사건, 대사, 엔딩, 다음 화 예고 등을 상상하여 추가 금지
   - 입력된 텍스트가 끝나면 그 즉시 번역을 멈출 것

2. **원작 왜곡 금지**
   - 로컬라이징은 표현과 문화적 배경을 한국식으로 바꾸는 것
   - 사건의 결과나 캐릭터의 본질을 변경하지 말 것
   - 주인공이 지는 장면을 이기게 하거나, 죽는 캐릭터를 살리지 말 것

3. **일관성 유지**
   - 용어집(Setting Bible)의 번역어를 반드시 준수
   - 캐릭터별 말투와 어조의 일관성 유지
   - 한번 정한 고유명사는 끝까지 동일하게 사용

═══════════════════════════════════════════════════════════════

[PART 2. 작품 정보]
- 제목: ${context.titleKo}
- 장르: ${context.genres.join(", ")}
- 연령등급: ${context.ageRating}
- 줄거리: ${context.synopsis}

═══════════════════════════════════════════════════════════════

[PART 3. 번역 스타일 가이드]

## 3-1. 장르별 지침
${genreGuides}

## 3-2. 연령등급 지침
${ageGuide}

## 3-3. 문체 및 서술 가이드 (웹소설 스타일)

**간결체 사용**
- 문장은 짧고 호흡이 빠르게 끊어주십시오
- 만연체(길고 복잡한 문장)는 지양
- 한 문장에 하나의 정보만 담기

**사이다 전개 강조**
- 주인공이 무시당하는 구간은 짧게
- 반격/능력 과시 장면은 임팩트 있게 (슬로모션처럼) 묘사
- 통쾌한 순간에는 짧은 문장으로 타격감 연출

**가독성 최적화**
- 문단을 자주 나누십시오 (벽돌 텍스트 금지)
- 대화문 위주로 속도감 있게 전개
- 독백이나 상황 묘사는 'Show, Don't Tell' 방식
- 지루한 설명은 과감히 축약

**현지화 (로컬라이징)**
- 중국식 관용구/유머는 한국 독자가 이해하기 쉽게 의역
- 문화적 맥락이 필요한 경우 자연스럽게 치환
- 화폐, 단위, 제도 등은 한국 독자 기준으로 환산 또는 설명

## 3-4. 리스크 제거 가이드

**공중도덕 관련**
- 공공장소 흡연: "밖에서 피우고 들어왔다", "흡연 구역에서" 등으로 수정
- 음주운전, 약물 등 불법 행위 묘사는 순화 또는 결과 강조

**젠더 감수성**
- 불필요한 성적 묘사나 시대착오적 표현은 현대 감성에 맞게 조절
- 여성 캐릭터를 단순 외모로만 묘사하지 않도록 주의

**폭력의 정당성**
- 싸움 장면은 상대가 먼저 선을 넘어서 '어쩔 수 없이 방어(참교육)'하는 구도로 서술
- 일방적 가해는 지양

═══════════════════════════════════════════════════════════════
${glossarySection}
${characterSection}
${translationGuideSection}
═══════════════════════════════════════════════════════════════

[PART 7. 출력 형식]

1. **번역문만 출력** - 설명, 주석, 번역 노트 포함 금지
2. **원문의 문단 구조 유지** - 단, 가독성을 위해 긴 문단은 분리 가능
3. **대화문 형식 유지** - 따옴표, 줄바꿈 등 원문 형식 준수

═══════════════════════════════════════════════════════════════

이제 입력되는 중국어 원문을 위 지침에 따라 한국어로 번역하십시오.`;
}

// 재시도 로직을 위한 딜레이 함수
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 치명적 에러 로깅 (관리자 알림용)
async function logCriticalError(code: string, message: string, details?: Record<string, unknown>): Promise<void> {
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
function analyzeError(error: unknown): TranslationError {
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

export async function translateText(
  content: string,
  context: TranslationContext,
  maxRetries: number = 5
): Promise<string> {
  log("translateText 시작", { contentLength: content.length, title: context.titleKo });

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const systemPrompt = buildSystemPrompt(context);
  log("시스템 프롬프트 생성 완료, 길이:", systemPrompt.length);

  let lastError: TranslationError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    log(`번역 시도 ${attempt + 1}/${maxRetries}`);
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
        }),
        API_TIMEOUT_MS,
        "번역 API 호출"
      );

      const elapsed = Date.now() - startTime;
      log(`API 응답 수신 (${elapsed}ms 소요)`);

      const response = result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        logError("빈 응답 수신됨");
        throw new TranslationError(
          "AI가 빈 응답을 반환했습니다.",
          "EMPTY_RESPONSE",
          true
        );
      }

      log("번역 성공, 결과 길이:", text.length);
      circuitBreaker.onSuccess();
      return text;
    } catch (error) {
      lastError = error instanceof TranslationError ? error : analyzeError(error);

      logError(`번역 시도 ${attempt + 1} 실패:`, {
        code: lastError.code,
        message: lastError.message,
        retryable: lastError.retryable,
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
        log(`${Math.round(waitMs)}ms 후 재시도... (attempt ${attempt + 1})`);
        await delay(waitMs);
      }
    }
  }

  // 모든 재시도 실패
  logError("모든 재시도 실패");
  throw lastError || new TranslationError(
    "번역에 실패했습니다. 다시 시도해주세요.",
    "MAX_RETRIES",
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
function getChunkThreshold(text: string): number {
  return Math.max(8000, maxCharsForTokenBudget(text, TARGET_CHUNK_TOKENS));
}

function getChunkSize(text: string): number {
  return Math.max(8000, maxCharsForTokenBudget(text, TARGET_CHUNK_TOKENS));
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
 * 소형 챕터를 한 번에 번역
 */
async function translateSingleChapter(
  content: string,
  context: TranslationContext,
  maxRetries: number
): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const systemPrompt = buildSystemPrompt(context);
  log("시스템 프롬프트 생성 완료, 길이:", systemPrompt.length);

  let lastError: TranslationError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    log(`챕터 번역 시도 ${attempt + 1}/${maxRetries}`);
    try {
      // 0. Circuit Breaker 확인
      circuitBreaker.check();

      // 1. Rate Limiter 토큰 획득
      await rateLimiter.acquire();

      const startTime = Date.now();

      // 2. API 호출에 타임아웃 적용 (챕터 전체 번역이므로 긴 타임아웃)
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
            maxOutputTokens: 65536, // 충분한 출력 토큰 (챕터 전체 대응)
          },
        }),
        API_TIMEOUT_MS,
        "챕터 번역 API 호출"
      );

      const elapsed = Date.now() - startTime;
      log(`챕터 번역 API 응답 수신 (${elapsed}ms 소요)`);

      const response = result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        logError("챕터 번역 빈 응답 수신됨");
        throw new TranslationError(
          "AI가 빈 응답을 반환했습니다.",
          "EMPTY_RESPONSE",
          true
        );
      }

      log("챕터 번역 성공, 결과 길이:", text.length);
      circuitBreaker.onSuccess();
      return text;
    } catch (error) {
      lastError = error instanceof TranslationError ? error : analyzeError(error);

      logError(`챕터 번역 시도 ${attempt + 1} 실패:`, {
        code: lastError.code,
        message: lastError.message,
        retryable: lastError.retryable,
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

      // 재시도 불가능한 오류는 즉시 실패
      if (!lastError.retryable) {
        throw lastError;
      }

      // 마지막 시도가 아니면 지수 백오프로 대기 (jitter 포함)
      if (attempt < maxRetries - 1) {
        const baseDelay =
          lastError.code === "RATE_LIMIT" ? 30000 :  // 30초
          lastError.code === "TIMEOUT" ? 15000 :     // 15초 (챕터 번역은 더 긴 대기)
          lastError.code === "CIRCUIT_OPEN" ? 5000 :  // 5초
          5000;                                       // 5초

        const backoffMs = Math.min(baseDelay * Math.pow(1.5, attempt), 120000); // 최대 2분
        const waitMs = addJitter(backoffMs);
        log(`${Math.round(waitMs)}ms 후 재시도... (attempt ${attempt + 1})`);
        await delay(waitMs);
      }
    }
  }

  // 모든 재시도 실패
  logError("챕터 번역 모든 재시도 실패");
  throw lastError || new TranslationError(
    "챕터 번역에 실패했습니다. 다시 시도해주세요.",
    "MAX_RETRIES",
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
    // 500회 × 2청크 = 1000개 요청을 안정적으로 처리하기 위해 2초 딜레이
    if (i > startFromChunk) {
      const chunkDelay = addJitter(2000); // 2초 + jitter
      await delay(chunkDelay);
    }

    log(`청크 ${i + 1}/${chunks.length} 번역 시작`);
    try {
      const translated = await translateText(chunks[i], context);
      results.push(translated);
      consecutiveFailures = 0; // 성공하면 연속 실패 리셋

      // 콜백에 현재까지의 결과 전달 (중간 저장용)
      if (onProgress) {
        await onProgress(i + 1, chunks.length, {
          index: i,
          success: true,
          content: translated,
        }, results);
      }
    } catch (error) {
      const translationError = error instanceof TranslationError
        ? error
        : analyzeError(error);

      logError(`청크 ${i + 1} 번역 실패:`, {
        code: translationError.code,
        message: translationError.message,
      });

      // DB에 에러 로깅
      await logToDb(
        `청크 ${i + 1}/${chunks.length} 번역 실패: ${translationError.message}`,
        translationError.code,
        i,
        consecutiveFailures
      );

      // 실패한 청크는 원문으로 대체하고 표시
      results.push(`[번역 실패: ${translationError.message}]\n\n${chunks[i]}`);
      failedChunks.push(i);
      consecutiveFailures++;

      if (onProgress) {
        await onProgress(i + 1, chunks.length, {
          index: i,
          success: false,
          error: translationError.message,
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
      if (!translationError.retryable && consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logError("연속 비재시도 오류로 번역 중단", {
          failedChunks,
          consecutiveFailures,
          threshold: MAX_CONSECUTIVE_FAILURES,
        });
        throw new TranslationError(
          `연속 오류로 번역 중단: ${translationError.message}`,
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

// 재번역 프롬프트 생성
function buildRetranslatePrompt(
  originalContent: string,
  currentTranslation: string,
  feedback: string,
  selectedText: string | undefined,
  context: TranslationContext
): string {
  let selectedSection = "";
  if (selectedText) {
    selectedSection = `
[특별 주의 구간]
사용자가 아래 부분을 특히 수정해달라고 요청했습니다:
"""
${selectedText}
"""
이 부분을 피드백에 맞게 특히 신경써서 수정해주세요.
`;
  }

  return `[System Role]
당신은 웹소설 번역 수정 전문가입니다.
기존 번역본을 사용자의 피드백을 반영하여 개선해야 합니다.

[작품 정보]
- 제목: ${context.titleKo}
- 장르: ${context.genres.join(", ")}
- 연령등급: ${context.ageRating}

[용어집]
${context.glossary?.map((g) => `- ${g.original} → ${g.translated}`).join("\n") || "없음"}

═══════════════════════════════════════════════════════════════

[사용자 피드백]
${feedback}
${selectedSection}
═══════════════════════════════════════════════════════════════

[원문]
${originalContent}

═══════════════════════════════════════════════════════════════

[현재 번역본]
${currentTranslation}

═══════════════════════════════════════════════════════════════

[지시사항]
1. 위 피드백을 반영하여 번역을 수정하세요
2. 피드백에서 지적한 부분을 중점적으로 개선하세요
3. 나머지 부분은 원래 번역의 스타일을 유지하세요
4. 수정된 전체 번역문만 출력하세요 (설명 없이)
5. 용어집의 번역어를 준수하세요

수정된 번역문:`;
}

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
