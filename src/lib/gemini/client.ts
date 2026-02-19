import { GoogleGenerativeAI } from "@google/generative-ai";

// ============================================
// API 키 풀링 설정
// ============================================

// API 키 풀 초기화 (최대 5개 키 지원)
const GEMINI_API_KEYS: string[] = [];

// 환경 변수에서 API 키 로드
if (process.env.GEMINI_API_KEY_1) GEMINI_API_KEYS.push(process.env.GEMINI_API_KEY_1);
if (process.env.GEMINI_API_KEY_2) GEMINI_API_KEYS.push(process.env.GEMINI_API_KEY_2);
if (process.env.GEMINI_API_KEY_3) GEMINI_API_KEYS.push(process.env.GEMINI_API_KEY_3);
if (process.env.GEMINI_API_KEY_4) GEMINI_API_KEYS.push(process.env.GEMINI_API_KEY_4);
if (process.env.GEMINI_API_KEY_5) GEMINI_API_KEYS.push(process.env.GEMINI_API_KEY_5);

// 레거시 단일 키 지원 (폴백)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (GEMINI_API_KEYS.length === 0 && GEMINI_API_KEY) {
  GEMINI_API_KEYS.push(GEMINI_API_KEY);
}

if (GEMINI_API_KEYS.length === 0) {
  console.error("[CRITICAL] Gemini API 키가 설정되지 않았습니다. GEMINI_API_KEY 또는 GEMINI_API_KEY_1~5를 설정하세요.");
}

// API 키 개수 환경 변수로 노출 (Lambda에서 사용)
if (typeof process.env.GEMINI_API_KEY_COUNT === "undefined") {
  process.env.GEMINI_API_KEY_COUNT = String(GEMINI_API_KEYS.length);
}

// 키별 사용량 추적 (라운드 로빈 + 최소 사용량 전략)
const keyUsageCount = new Map<number, number>();
let globalKeyIndex = 0;

/**
 * API 키 풀에서 다음 키를 가져옴
 * 라운드 로빈 방식으로 키를 분산 사용
 */
export function getNextGeminiApiKey(): string {
  if (GEMINI_API_KEYS.length === 0) {
    throw new Error("Gemini API 키가 설정되지 않았습니다.");
  }

  const keyIndex = globalKeyIndex % GEMINI_API_KEYS.length;
  globalKeyIndex++;

  // 사용량 추적
  const currentCount = keyUsageCount.get(keyIndex) || 0;
  keyUsageCount.set(keyIndex, currentCount + 1);

  return GEMINI_API_KEYS[keyIndex];
}

/**
 * 특정 인덱스의 API 키를 가져옴
 * Lambda 워커에서 키 로테이션에 사용
 */
export function getGeminiApiKeyByIndex(index: number): string {
  if (GEMINI_API_KEYS.length === 0) {
    throw new Error("Gemini API 키가 설정되지 않았습니다.");
  }

  const keyIndex = index % GEMINI_API_KEYS.length;
  return GEMINI_API_KEYS[keyIndex];
}

/**
 * API 키 풀 상태 조회 (디버깅/모니터링용)
 */
export function getApiKeyPoolStatus(): {
  totalKeys: number;
  usageCounts: Record<number, number>;
  currentIndex: number;
} {
  const usageCounts: Record<number, number> = {};
  keyUsageCount.forEach((count, index) => {
    usageCounts[index] = count;
  });

  return {
    totalKeys: GEMINI_API_KEYS.length,
    usageCounts,
    currentIndex: globalKeyIndex % GEMINI_API_KEYS.length,
  };
}

/**
 * API 키 풀 크기 반환
 */
export function getApiKeyCount(): number {
  return GEMINI_API_KEYS.length;
}

// 기본 GoogleGenerativeAI 인스턴스 (단일 키 레거시 호환)
export const genAI = new GoogleGenerativeAI(GEMINI_API_KEYS[0] || "MISSING_API_KEY");

/**
 * 특정 API 키로 GoogleGenerativeAI 인스턴스 생성
 */
export function createGenAIClient(apiKey?: string): GoogleGenerativeAI {
  const key = apiKey || getNextGeminiApiKey();
  return new GoogleGenerativeAI(key);
}

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
export const log = (...args: unknown[]) => {
  if (isDev) console.log("[Gemini]", ...args);
};
export const logError = (...args: unknown[]) => {
  console.error("[Gemini]", ...args);
};

// ============================================
// API 타임아웃 및 Rate Limiter 설정
// ============================================

// Vercel Pro 플랜: 최대 300초 (5분) 함수 실행 시간
// 챕터 전체 번역을 위해 타임아웃 대폭 증가
export const API_TIMEOUT_MS = 180000; // 180초 (3분) - 긴 챕터 대응
export const RATE_LIMIT_RPM = 800; // 분당 최대 요청 수 (Gemini Paid 1000 RPM의 80%, 여유 마진 확보)
export const RATE_LIMIT_WINDOW_MS = 60000; // 1분 윈도우

// 청크 레벨 재시도 설정
export const CHUNK_MAX_RETRIES = 3; // 청크별 최대 재시도 횟수

// 모델 우선순위 (fallback) - 설정집 분석과 동일
export const MODEL_PRIORITY = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

// 실패 임계값 설정
export const MAX_CONSECUTIVE_FAILURES = 5; // 연속 실패 허용 횟수 (기존 3 -> 5)
export const MAX_FAILURE_RATE = 0.3; // 최대 실패율 30% (기존 20% -> 30%)
export const MIN_FAILURES_FOR_RATE_CHECK = 10; // 실패율 체크 시작 최소 실패 수 (기존 5 -> 10)
