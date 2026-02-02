import { GoogleGenerativeAI } from "@google/generative-ai";
import { CharacterRole, TermCategory, EventType } from "@prisma/client";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("[CRITICAL] GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.");
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || "MISSING_API_KEY");

// 조건부 로깅
const isDev = process.env.NODE_ENV === "development";
const log = (...args: unknown[]) => {
  if (isDev) console.log("[BibleGenerator]", ...args);
};
const logError = (...args: unknown[]) => {
  console.error("[BibleGenerator]", ...args);
};

// 재시도 설정
const MAX_RETRIES = 3; // 모델당 3회 재시도
const BASE_DELAY_MS = 5000; // 5초 (Vercel Pro에서 더 빠른 재시도)

// 모델 우선순위 (fallback)
const MODEL_PRIORITY = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

// 딜레이 함수
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 토큰 추정 (CJK 문자는 대략 1.5 토큰, 영문은 4자당 1토큰)
function estimateTokens(text: string): number {
  const cjkPattern = /[\u4e00-\u9fff\u3400-\u4dbf\uac00-\ud7af\u3040-\u309f\u30a0-\u30ff]/g;
  const cjkMatches = text.match(cjkPattern);
  const cjkCount = cjkMatches?.length ?? 0;
  const nonCjkCount = text.length - cjkCount;
  return Math.ceil(cjkCount * 1.5 + nonCjkCount * 0.25);
}

// 토큰 기반 최적 배치 계획
// Gemini 2.5 Flash 입력 한도: 1M 토큰
// 설정집은 입력 토큰이 병목 (출력은 압축된 JSON)
// 타임아웃(180초) 고려하여 입력 토큰 한도의 90% = 900K 타겟
const BIBLE_INPUT_TOKEN_LIMIT = 1_000_000;
const BIBLE_TARGET_INPUT_TOKENS = Math.floor(BIBLE_INPUT_TOKEN_LIMIT * 0.9); // 900K
const PROMPT_OVERHEAD_TOKENS = 2000; // 프롬프트 오버헤드

/**
 * 챕터 목록을 토큰 예산에 맞게 최적 배치로 분할
 * @returns 각 배치에 포함될 챕터 번호 배열의 배열
 */
export function getOptimalBatchPlan(
  chapters: { number: number; contentLength: number }[]
): number[][] {
  const budgetPerBatch = BIBLE_TARGET_INPUT_TOKENS - PROMPT_OVERHEAD_TOKENS;
  const batches: number[][] = [];
  let currentBatch: number[] = [];
  let currentTokens = 0;

  for (const ch of chapters) {
    // contentLength 기반으로 토큰 추정 (CJK 가정 → 1.5 토큰/글자)
    const chTokens = Math.ceil(ch.contentLength * 1.5);

    if (currentBatch.length > 0 && currentTokens + chTokens > budgetPerBatch) {
      batches.push(currentBatch);
      currentBatch = [ch.number];
      currentTokens = chTokens;
    } else {
      currentBatch.push(ch.number);
      currentTokens += chTokens;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  log("getOptimalBatchPlan", {
    totalChapters: chapters.length,
    totalBatches: batches.length,
    batchSizes: batches.map((b) => b.length),
    tokenBudget: budgetPerBatch,
  });

  return batches;
}

// Jitter 추가 (thundering herd 방지)
function addJitter(baseMs: number, jitterFraction: number = 0.2): number {
  const jitter = baseMs * jitterFraction * (Math.random() - 0.5) * 2;
  return Math.max(0, baseMs + jitter);
}

// 재시도 가능한 에러인지 확인
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // 503 Service Unavailable, 429 Rate Limit, 500 Server Error
    if (message.includes("503") || message.includes("overloaded") ||
        message.includes("429") || message.includes("rate") ||
        message.includes("500") || message.includes("server") ||
        message.includes("timeout") || message.includes("시간 초과")) {
      return true;
    }
    // JSON 파싱 실패도 재시도 (AI가 다시 더 나은 응답을 줄 수 있음)
    if (message.includes("파싱") || message.includes("json") ||
        message.includes("unexpected token") || message.includes("syntax")) {
      return true;
    }
  }
  return false;
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
      reject(new Error(`${operation} 시간 초과 (${timeoutMs / 1000}초)`));
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

// AI 분석 결과 타입
export interface AnalyzedCharacter {
  nameOriginal: string;
  nameKorean: string;
  nameHanja?: string;
  titles: string[];
  aliases: string[];
  personality?: string;
  speechStyle?: string;
  role: CharacterRole;
  description?: string;
  relationships?: Record<string, string>;
  firstAppearance?: number;
}

export interface AnalyzedTerm {
  original: string;
  translated: string;
  category: TermCategory;
  note?: string;
  context?: string;
  firstAppearance?: number;
}

export interface AnalyzedEvent {
  title: string;
  description: string;
  chapterStart: number;
  chapterEnd?: number;
  eventType: EventType;
  importance: number;
  isForeshadowing: boolean;
  foreshadowNote?: string;
  involvedCharacters: string[];
}

export interface BibleAnalysisResult {
  characters: AnalyzedCharacter[];
  terms: AnalyzedTerm[];
  events: AnalyzedEvent[];
  translationNotes: string;
}

interface WorkInfo {
  title: string;
  genres: string[];
  synopsis: string;
  sourceLanguage: string;
}

// 설정집 분석 프롬프트 생성
function buildBibleAnalysisPrompt(
  workInfo: WorkInfo,
  chaptersText: string,
  chapterRange: { start: number; end: number }
): string {
  return `당신은 웹소설 설정 분석 전문가입니다. 아래 작품의 ${chapterRange.start}~${chapterRange.end}화 내용을 분석하여 번역에 필요한 설정집(Setting Bible)을 생성해주세요.

═══════════════════════════════════════════════════════════════
[작품 정보]
제목: ${workInfo.title}
장르: ${workInfo.genres.join(", ")}
원작 언어: ${workInfo.sourceLanguage}
줄거리: ${workInfo.synopsis}
═══════════════════════════════════════════════════════════════

[분석 요청]
아래 원문을 읽고 다음 정보를 JSON 형식으로 추출해주세요:

1. **characters** (인물): 등장인물 정보
   - nameOriginal: 원문 이름 (필수)
   - nameKorean: 한국어 번역명 (필수)
   - nameHanja: 한자 표기 (있는 경우)
   - titles: 직위/칭호 배열
   - aliases: 별명/이명 배열
   - personality: 성격 특성
   - speechStyle: 말투 특징 (번역 시 참고)
   - role: 역할 (PROTAGONIST, ANTAGONIST, SUPPORTING, MINOR 중 하나)
   - description: 인물 설명
   - relationships: 관계 정보 (키: 다른 인물명, 값: 관계 설명)
   - firstAppearance: 첫 등장 회차 번호

2. **terms** (용어): 번역이 필요한 고유 용어
   - original: 원문 (필수)
   - translated: 한국어 번역 (필수)
   - category: 분류 (CHARACTER, PLACE, ORGANIZATION, RANK_TITLE, SKILL_TECHNIQUE, ITEM, OTHER 중 하나)
   - note: 번역 시 참고사항
   - context: 용어가 사용되는 맥락
   - firstAppearance: 첫 등장 회차 번호

3. **events** (이벤트): 주요 사건 및 복선
   - title: 이벤트 제목 (필수)
   - description: 상세 설명 (필수)
   - chapterStart: 시작 회차 (필수)
   - chapterEnd: 종료 회차 (진행 중이면 null)
   - eventType: 유형 (PLOT, CHARACTER_DEV, FORESHADOWING, REVEAL, WORLD_BUILDING 중 하나)
   - importance: 중요도 (1-5, 5가 가장 중요)
   - isForeshadowing: 복선 여부
   - foreshadowNote: 복선 관련 메모 (나중에 밝혀질 내용 힌트)
   - involvedCharacters: 관련 인물 원문명 배열

4. **translationNotes** (번역 가이드): 전체적인 번역 방향 및 주의사항

═══════════════════════════════════════════════════════════════
[분석 대상 원문 - ${chapterRange.start}~${chapterRange.end}화]
═══════════════════════════════════════════════════════════════

${chaptersText}

═══════════════════════════════════════════════════════════════
[출력 형식]
반드시 아래 JSON 형식으로만 출력하세요. 다른 설명 없이 JSON만 출력합니다.

\`\`\`json
{
  "characters": [...],
  "terms": [...],
  "events": [...],
  "translationNotes": "..."
}
\`\`\``;
}

// 불완전한 JSON 복구 시도
function repairJson(jsonStr: string): string {
  let repaired = jsonStr.trim();

  // 열린 괄호와 닫힌 괄호 개수 세기
  let braceCount = 0;  // {}
  let bracketCount = 0; // []
  let inString = false;
  let escaped = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') braceCount++;
    else if (char === '}') braceCount--;
    else if (char === '[') bracketCount++;
    else if (char === ']') bracketCount--;
  }

  log("JSON 복구: 괄호 불균형", { braceCount, bracketCount, inString });

  // 문자열이 열려있으면 닫기
  if (inString) {
    repaired += '"';
  }

  // 마지막이 쉼표면 제거 (trailing comma)
  repaired = repaired.replace(/,\s*$/, '');

  // 불완전한 객체/배열 닫기
  // 먼저 현재 컨텍스트를 분석해서 닫아야 할 것들 결정
  const lastChars = repaired.slice(-50);

  // characters, terms, events 배열이 열려있을 수 있음
  if (bracketCount > 0 || braceCount > 0) {
    // 가장 마지막 요소가 불완전한 객체인지 확인
    const lastBrace = repaired.lastIndexOf('{');
    const lastCloseBrace = repaired.lastIndexOf('}');

    // 열린 객체가 있고 안 닫혔으면 제거하거나 닫기
    if (lastBrace > lastCloseBrace) {
      // 불완전한 마지막 객체 제거
      const beforeLastObject = repaired.lastIndexOf(',', lastBrace);
      if (beforeLastObject > 0) {
        repaired = repaired.substring(0, beforeLastObject);
        log("JSON 복구: 불완전한 마지막 객체 제거");
      }
    }
  }

  // 누락된 닫는 괄호 추가
  for (let i = 0; i < bracketCount; i++) {
    repaired += ']';
  }
  for (let i = 0; i < braceCount; i++) {
    repaired += '}';
  }

  // 필수 필드가 없으면 추가
  try {
    const test = JSON.parse(repaired);
    if (!test.characters) test.characters = [];
    if (!test.terms) test.terms = [];
    if (!test.events) test.events = [];
    if (!test.translationNotes) test.translationNotes = "";
    return JSON.stringify(test);
  } catch {
    // 그래도 실패하면 최소한의 구조 반환 시도
    log("JSON 복구: 복구 후에도 파싱 실패, 기본 구조 반환");
  }

  return repaired;
}

// JSON 추출 헬퍼 - 여러 패턴 시도
function extractJson(text: string): string {
  // 1. ```json ... ``` 패턴 (가장 일반적)
  const jsonCodeBlock = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonCodeBlock && jsonCodeBlock[1]) {
    log("JSON 추출: ```json 블록에서 추출");
    return jsonCodeBlock[1].trim();
  }

  // 2. ``` ... ``` 패턴 (언어 명시 없는 코드 블록)
  const codeBlock = text.match(/```\s*([\s\S]*?)\s*```/);
  if (codeBlock && codeBlock[1] && codeBlock[1].trim().startsWith("{")) {
    log("JSON 추출: 일반 코드 블록에서 추출");
    return codeBlock[1].trim();
  }

  // 3. 첫 번째 { 부터 마지막 } 까지 추출
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    log("JSON 추출: 중괄호 범위에서 추출");
    return text.slice(firstBrace, lastBrace + 1);
  }

  // 4. 첫 번째 { 부터 끝까지 (불완전한 JSON일 수 있음)
  if (firstBrace !== -1) {
    log("JSON 추출: 첫 번째 중괄호부터 끝까지 (불완전할 수 있음)");
    return text.slice(firstBrace);
  }

  // 5. 그대로 반환 (마지막 시도)
  log("JSON 추출: 원본 텍스트 사용");
  return text.trim();
}

// JSON 파싱 헬퍼
function parseAnalysisResult(text: string): BibleAnalysisResult {
  // JSON 블록 추출
  let jsonStr = extractJson(text);
  log("추출된 JSON 길이:", jsonStr.length, "시작:", jsonStr.substring(0, 50));

  let parsed: Record<string, unknown>;

  // 1차 파싱 시도
  try {
    parsed = JSON.parse(jsonStr);
  } catch (firstError) {
    log("1차 파싱 실패, JSON 복구 시도...");

    // 2차: JSON 복구 후 재시도
    try {
      const repairedJson = repairJson(jsonStr);
      log("복구된 JSON 길이:", repairedJson.length);
      parsed = JSON.parse(repairedJson);
      log("JSON 복구 성공!");
    } catch (repairError) {
      // 최종 실패
      logError("JSON 파싱 실패:", firstError);
      logError("JSON 복구도 실패:", repairError);
      logError("파싱 시도한 JSON (처음 500자):", jsonStr.substring(0, 500));
      logError("파싱 시도한 JSON (마지막 200자):", jsonStr.substring(jsonStr.length - 200));
      throw new Error(`AI 응답 파싱에 실패했습니다: ${firstError instanceof Error ? firstError.message : String(firstError)}`);
    }
  }

  // 역할 유효성 검증 및 변환
  const validRoles = ["PROTAGONIST", "ANTAGONIST", "SUPPORTING", "MINOR"];
  const validCategories = ["CHARACTER", "PLACE", "ORGANIZATION", "RANK_TITLE", "SKILL_TECHNIQUE", "ITEM", "OTHER"];
  const validEventTypes = ["PLOT", "CHARACTER_DEV", "FORESHADOWING", "REVEAL", "WORLD_BUILDING"];

  const characters = ((parsed.characters || []) as Record<string, unknown>[]).map((c) => ({
    nameOriginal: String(c.nameOriginal || ""),
    nameKorean: String(c.nameKorean || c.nameOriginal || ""),
    nameHanja: c.nameHanja ? String(c.nameHanja) : undefined,
    titles: Array.isArray(c.titles) ? c.titles.map(String) : [],
    aliases: Array.isArray(c.aliases) ? c.aliases.map(String) : [],
    personality: c.personality ? String(c.personality) : undefined,
    speechStyle: c.speechStyle ? String(c.speechStyle) : undefined,
    role: validRoles.includes(String(c.role)) ? String(c.role) as CharacterRole : "SUPPORTING" as CharacterRole,
    description: c.description ? String(c.description) : undefined,
    relationships: typeof c.relationships === "object" ? c.relationships as Record<string, string> : undefined,
    firstAppearance: typeof c.firstAppearance === "number" ? c.firstAppearance : undefined,
  })).filter((c: AnalyzedCharacter) => c.nameOriginal);

  const terms = ((parsed.terms || []) as Record<string, unknown>[]).map((t) => ({
    original: String(t.original || ""),
    translated: String(t.translated || t.original || ""),
    category: validCategories.includes(String(t.category)) ? String(t.category) as TermCategory : "OTHER" as TermCategory,
    note: t.note ? String(t.note) : undefined,
    context: t.context ? String(t.context) : undefined,
    firstAppearance: typeof t.firstAppearance === "number" ? t.firstAppearance : undefined,
  })).filter((t: AnalyzedTerm) => t.original);

  const events = ((parsed.events || []) as Record<string, unknown>[]).map((e) => ({
    title: String(e.title || ""),
    description: String(e.description || ""),
    chapterStart: typeof e.chapterStart === "number" ? e.chapterStart : 1,
    chapterEnd: typeof e.chapterEnd === "number" ? e.chapterEnd : undefined,
    eventType: validEventTypes.includes(String(e.eventType)) ? String(e.eventType) as EventType : "PLOT" as EventType,
    importance: typeof e.importance === "number" ? Math.min(5, Math.max(1, e.importance)) : 1,
    isForeshadowing: Boolean(e.isForeshadowing),
    foreshadowNote: e.foreshadowNote ? String(e.foreshadowNote) : undefined,
    involvedCharacters: Array.isArray(e.involvedCharacters) ? e.involvedCharacters.map(String) : [],
  })).filter((e: AnalyzedEvent) => e.title && e.description);

  return {
    characters,
    terms,
    events,
    translationNotes: String(parsed.translationNotes || ""),
  };
}

// 단일 모델로 분석 시도
async function tryAnalyzeWithModel(
  modelName: string,
  prompt: string
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      log(`[${modelName}] 분석 시도 ${attempt + 1}/${MAX_RETRIES}`);

      const result = await withTimeout(
        model.generateContent({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            topP: 0.85,
            topK: 40,
            maxOutputTokens: 65536, // Gemini 2.5 Flash 최대 출력
          },
        }),
        180000, // 3분 타임아웃 (Vercel Pro)
        "설정집 분석"
      );

      const response = result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new Error("AI가 빈 응답을 반환했습니다.");
      }

      log(`[${modelName}] 성공! 응답 길이:`, text.length);
      return text;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logError(`[${modelName}] 시도 ${attempt + 1} 실패:`, lastError.message);

      // 503 에러가 아니면 재시도하지 않음 (다른 모델로 넘어감)
      const is503 = lastError.message.includes("503") || lastError.message.includes("overloaded");
      if (!is503 && !isRetryableError(error)) {
        throw error;
      }

      // 마지막 시도가 아니면 대기
      if (attempt < MAX_RETRIES - 1) {
        const backoffMs = BASE_DELAY_MS * Math.pow(1.5, attempt);
        const waitMs = addJitter(backoffMs);
        log(`[${modelName}] ${Math.round(waitMs / 1000)}초 후 재시도...`);
        await delay(waitMs);
      }
    }
  }

  throw lastError || new Error(`${modelName} 분석 실패`);
}

// 배치 분석 실행 (여러 모델 fallback)
export async function analyzeBatch(
  workInfo: WorkInfo,
  chapters: Array<{ number: number; originalContent: string }>,
  chapterRange: { start: number; end: number }
): Promise<BibleAnalysisResult> {
  log("analyzeBatch 시작", {
    title: workInfo.title,
    chapterRange,
    chaptersCount: chapters.length,
  });

  // 챕터 텍스트 합치기
  const chaptersText = chapters
    .map((ch) => `[${ch.number}화]\n${ch.originalContent}`)
    .join("\n\n═══════════════════════════════════════════════════════════════\n\n");

  const prompt = buildBibleAnalysisPrompt(workInfo, chaptersText, chapterRange);

  let lastError: Error | null = null;

  // 모델 순서대로 시도
  for (const modelName of MODEL_PRIORITY) {
    try {
      log(`모델 시도: ${modelName}`);
      const text = await tryAnalyzeWithModel(modelName, prompt);

      const analysisResult = parseAnalysisResult(text);

      log("분석 완료", {
        model: modelName,
        characters: analysisResult.characters.length,
        terms: analysisResult.terms.length,
        events: analysisResult.events.length,
      });

      return analysisResult;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logError(`모델 ${modelName} 실패:`, lastError.message);

      // 503 에러면 다음 모델로, 그 외 에러면 재시도 가능 여부 확인
      const is503 = lastError.message.includes("503") || lastError.message.includes("overloaded");
      if (!is503 && !isRetryableError(error)) {
        throw error;
      }

      log(`다음 모델로 fallback...`);
    }
  }

  // 모든 모델 실패
  logError("모든 모델 실패");
  throw lastError || new Error("설정집 분석에 실패했습니다. 잠시 후 다시 시도해주세요.");
}

// 기존 결과와 새 결과 병합
export function mergeAnalysisResults(
  existing: BibleAnalysisResult,
  newResult: BibleAnalysisResult
): BibleAnalysisResult {
  // 캐릭터 병합 (원문 이름 기준)
  const characterMap = new Map<string, AnalyzedCharacter>();
  for (const char of existing.characters) {
    characterMap.set(char.nameOriginal, char);
  }
  for (const char of newResult.characters) {
    const existingChar = characterMap.get(char.nameOriginal);
    if (existingChar) {
      // 기존 정보와 병합 (새 정보로 업데이트하되 빈 값은 기존 유지)
      characterMap.set(char.nameOriginal, {
        ...existingChar,
        ...Object.fromEntries(
          Object.entries(char).filter(([_, v]) => v !== undefined && v !== null && v !== "")
        ),
        titles: [...new Set([...existingChar.titles, ...char.titles])],
        aliases: [...new Set([...existingChar.aliases, ...char.aliases])],
      });
    } else {
      characterMap.set(char.nameOriginal, char);
    }
  }

  // 용어 병합 (원문 기준)
  const termMap = new Map<string, AnalyzedTerm>();
  for (const term of existing.terms) {
    termMap.set(term.original, term);
  }
  for (const term of newResult.terms) {
    const existingTerm = termMap.get(term.original);
    if (existingTerm) {
      termMap.set(term.original, {
        ...existingTerm,
        ...Object.fromEntries(
          Object.entries(term).filter(([_, v]) => v !== undefined && v !== null && v !== "")
        ),
      });
    } else {
      termMap.set(term.original, term);
    }
  }

  // 이벤트 병합 (제목 + 시작 회차 기준)
  const eventMap = new Map<string, AnalyzedEvent>();
  for (const event of existing.events) {
    const key = `${event.title}_${event.chapterStart}`;
    eventMap.set(key, event);
  }
  for (const event of newResult.events) {
    const key = `${event.title}_${event.chapterStart}`;
    const existingEvent = eventMap.get(key);
    if (existingEvent) {
      eventMap.set(key, {
        ...existingEvent,
        ...Object.fromEntries(
          Object.entries(event).filter(([_, v]) => v !== undefined && v !== null && v !== "")
        ),
        involvedCharacters: [...new Set([...existingEvent.involvedCharacters, ...event.involvedCharacters])],
      });
    } else {
      eventMap.set(key, event);
    }
  }

  // 번역 노트 병합
  const translationNotes = [existing.translationNotes, newResult.translationNotes]
    .filter(Boolean)
    .join("\n\n");

  return {
    characters: Array.from(characterMap.values()),
    terms: Array.from(termMap.values()),
    events: Array.from(eventMap.values()),
    translationNotes,
  };
}

// 빈 결과 생성
export function createEmptyAnalysisResult(): BibleAnalysisResult {
  return {
    characters: [],
    terms: [],
    events: [],
    translationNotes: "",
  };
}
