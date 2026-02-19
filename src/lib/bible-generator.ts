import { CharacterRole, TermCategory, EventType } from "@prisma/client";
import { genAI, MODEL_PRIORITY } from "@/lib/gemini/client";
import { withTimeout, addJitter, delay } from "@/lib/gemini/resilience";

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


// 배치당 고정 챕터 수 (5챕터 × ~3000자 = ~15,000자, Gemini 15~30초 처리)
const CHAPTERS_PER_BATCH = 5;

/**
 * 챕터 번호 목록을 고정 크기 배치로 분할
 * @returns 각 배치에 포함될 챕터 번호 배열의 배열
 */
export function getOptimalBatchPlan(
  chapterNumbers: number[]
): number[][] {
  const batches: number[][] = [];

  for (let i = 0; i < chapterNumbers.length; i += CHAPTERS_PER_BATCH) {
    batches.push(chapterNumbers.slice(i, i + CHAPTERS_PER_BATCH));
  }

  log("getOptimalBatchPlan", {
    totalChapters: chapterNumbers.length,
    totalBatches: batches.length,
    chaptersPerBatch: CHAPTERS_PER_BATCH,
  });

  return batches;
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

// 설정집 분석 프롬프트 생성 (JSON 모드 최적화)
function buildBibleAnalysisPrompt(
  workInfo: WorkInfo,
  chaptersText: string,
  chapterRange: { start: number; end: number }
): string {
  return `웹소설 번역용 설정집 추출. ${chapterRange.start}~${chapterRange.end}화 분석.

[작품] ${workInfo.title} | ${workInfo.genres.join(", ")} | ${workInfo.sourceLanguage}
${workInfo.synopsis ? `줄거리: ${workInfo.synopsis.slice(0, 200)}` : ""}

[원문]
${chaptersText}

[추출 스키마]
{
  "characters": [{
    "nameOriginal": "원문명(필수)",
    "nameKorean": "한국어명(필수)",
    "nameHanja": "한자(선택)",
    "titles": ["직위/칭호"],
    "aliases": ["별명"],
    "personality": "성격",
    "speechStyle": "말투특징",
    "role": "PROTAGONIST|ANTAGONIST|SUPPORTING|MINOR",
    "description": "설명",
    "relationships": {"인물명": "관계"},
    "firstAppearance": 회차번호
  }],
  "terms": [{
    "original": "원문(필수)",
    "translated": "번역(필수)",
    "category": "PLACE|ORGANIZATION|RANK_TITLE|SKILL_TECHNIQUE|ITEM|OTHER",
    "note": "참고사항",
    "context": "맥락",
    "firstAppearance": 회차번호
  }],
  "events": [{
    "title": "제목(필수)",
    "description": "설명(필수)",
    "chapterStart": 시작회차,
    "chapterEnd": 종료회차,
    "eventType": "PLOT|CHARACTER_DEV|FORESHADOWING|REVEAL|WORLD_BUILDING",
    "importance": 1-5,
    "isForeshadowing": true/false,
    "foreshadowNote": "복선메모",
    "involvedCharacters": ["인물원문명"]
  }],
  "translationNotes": "번역 시 주의사항"
}`;
}

// 불완전한 JSON 복구 시도
function repairJson(jsonStr: string): string {
  let repaired = jsonStr.trim();

  // 1단계: 괄호 상태 분석
  function analyzeJson(str: string) {
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (char === '{') braceCount++;
      else if (char === '}') braceCount--;
      else if (char === '[') bracketCount++;
      else if (char === ']') bracketCount--;
    }
    return { braceCount, bracketCount, inString };
  }

  let state = analyzeJson(repaired);
  log("JSON 복구: 초기 상태", state);

  // 2단계: 열린 문자열 닫기
  if (state.inString) {
    // 문자열 끝에 이스케이프되지 않은 따옴표 추가
    repaired += '"';
    state = analyzeJson(repaired);
    log("JSON 복구: 문자열 닫음");
  }

  // 3단계: 불완전한 key-value 쌍 제거 (": 로 끝나는 경우)
  repaired = repaired.replace(/,?\s*"[^"]*":\s*$/, '');

  // 4단계: trailing comma 제거
  repaired = repaired.replace(/,\s*$/, '');

  // 5단계: 불완전한 중첩 객체 처리
  // 마지막 완전한 항목 이후의 불완전한 객체 제거 시도
  state = analyzeJson(repaired);

  if (state.braceCount > 1 || state.bracketCount > 0) {
    // 불완전한 마지막 객체/배열 찾아서 제거
    // 가장 마지막 완전한 객체 끝(})을 찾고, 그 이후의 불완전한 부분 제거
    let lastCompleteIndex = -1;
    let depth = 0;
    let inStr = false;
    let esc = false;

    for (let i = 0; i < repaired.length; i++) {
      const char = repaired[i];
      if (esc) { esc = false; continue; }
      if (char === '\\') { esc = true; continue; }
      if (char === '"') { inStr = !inStr; continue; }
      if (inStr) continue;

      if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') {
        depth--;
        if (depth === 1) {
          // 배열 내 객체가 완전히 닫힘
          lastCompleteIndex = i;
        }
      }
    }

    // 마지막 완전한 객체 이후에 불완전한 객체가 있으면 제거
    if (lastCompleteIndex > 0 && lastCompleteIndex < repaired.length - 10) {
      const afterComplete = repaired.substring(lastCompleteIndex + 1);
      // 새 객체가 시작됐는데 안 닫혔으면 제거
      if (afterComplete.includes('{') && !afterComplete.includes('}')) {
        const cutPoint = repaired.lastIndexOf(',', repaired.indexOf('{', lastCompleteIndex + 1));
        if (cutPoint > lastCompleteIndex) {
          repaired = repaired.substring(0, cutPoint);
          log("JSON 복구: 불완전한 마지막 객체 제거");
        }
      }
    }
  }

  // 6단계: trailing comma 다시 제거
  repaired = repaired.replace(/,\s*$/, '');

  // 7단계: 누락된 닫는 괄호 추가
  state = analyzeJson(repaired);
  for (let i = 0; i < state.bracketCount; i++) repaired += ']';
  for (let i = 0; i < state.braceCount; i++) repaired += '}';

  // 8단계: 파싱 테스트 및 필수 필드 보장
  try {
    const test = JSON.parse(repaired);
    if (!test.characters) test.characters = [];
    if (!test.terms) test.terms = [];
    if (!test.events) test.events = [];
    if (!test.translationNotes) test.translationNotes = "";
    return JSON.stringify(test);
  } catch (e) {
    log("JSON 복구: 1차 복구 실패, 공격적 복구 시도");

    // 9단계: 공격적 복구 - 마지막 완전한 배열 항목까지만 유지
    try {
      // characters, terms, events 배열을 개별적으로 추출 시도
      const charactersMatch = repaired.match(/"characters"\s*:\s*\[([\s\S]*?)\](?=\s*,?\s*"(?:terms|events|translationNotes)")/);
      const termsMatch = repaired.match(/"terms"\s*:\s*\[([\s\S]*?)\](?=\s*,?\s*"(?:events|translationNotes)")/);
      const eventsMatch = repaired.match(/"events"\s*:\s*\[([\s\S]*?)\](?=\s*,?\s*"translationNotes")/);
      const notesMatch = repaired.match(/"translationNotes"\s*:\s*"([^"]*)"/);

      const result: Record<string, unknown> = {
        characters: [],
        terms: [],
        events: [],
        translationNotes: notesMatch ? notesMatch[1] : ""
      };

      // 각 배열 파싱 시도
      if (charactersMatch) {
        try {
          result.characters = JSON.parse('[' + charactersMatch[1] + ']');
        } catch { /* 빈 배열 유지 */ }
      }
      if (termsMatch) {
        try {
          result.terms = JSON.parse('[' + termsMatch[1] + ']');
        } catch { /* 빈 배열 유지 */ }
      }
      if (eventsMatch) {
        try {
          result.events = JSON.parse('[' + eventsMatch[1] + ']');
        } catch { /* 빈 배열 유지 */ }
      }

      log("JSON 복구: 공격적 복구 성공", {
        characters: (result.characters as unknown[]).length,
        terms: (result.terms as unknown[]).length,
        events: (result.events as unknown[]).length
      });

      return JSON.stringify(result);
    } catch {
      log("JSON 복구: 공격적 복구도 실패");
    }
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
            maxOutputTokens: 16384, // 실측 기반: 배치당 ~1,600토큰, 최악 ~3,400토큰
            responseMimeType: "application/json", // JSON 모드: 유효한 JSON만 출력
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

  // 번역 노트: 새 배치의 노트가 있으면 교체, 없으면 기존 유지
  const translationNotes = newResult.translationNotes || existing.translationNotes;

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
