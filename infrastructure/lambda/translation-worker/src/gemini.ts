/**
 * Gemini API wrapper for Lambda
 * Simplified version of src/lib/gemini.ts for Lambda environment
 */

import { GoogleGenerativeAI, GoogleGenerativeAIError, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// Configuration
const API_TIMEOUT_MS = 180000; // 3 minutes
const MAX_OUTPUT_TOKENS = 65536;
const TARGET_CHUNK_TOKENS = Math.floor(MAX_OUTPUT_TOKENS * 0.9);

// Model priority for fallback
const MODEL_PRIORITY = [
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

export interface TranslationContext {
  titleKo: string;
  genres: string[];
  ageRating: string;
  synopsis: string;
  glossary?: Array<{ original: string; translated: string; note?: string }>;
  characters?: Array<{
    nameOriginal: string;
    nameKorean: string;
    role: string;
    speechStyle?: string;
    personality?: string;
  }>;
  translationGuide?: string;
  customSystemPrompt?: string;
}

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

// ─── 장르별 번역 스타일 가이드 (웹앱과 동일) ───
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

// ─── 동적 섹션 빌더 ───

function buildGlossarySection(context: TranslationContext): string {
  if (!context.glossary || context.glossary.length === 0) return "";
  return `
[PART 4. 용어집 (Setting Bible)]
아래 용어는 반드시 지정된 번역어를 사용하십시오.

| 원문 | 번역 | 비고 |
|------|------|------|
${context.glossary.map((g) => `| ${g.original} | ${g.translated} | ${g.note || ""} |`).join("\n")}
`;
}

function buildCharacterSection(context: TranslationContext): string {
  if (!context.characters || context.characters.length === 0) return "";
  const mainCharacters = context.characters.filter(
    (c) => c.role === "PROTAGONIST" || c.role === "ANTAGONIST"
  );
  const supportingCharacters = context.characters.filter(
    (c) => c.role === "SUPPORTING"
  );

  return `
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

function buildGuideSection(context: TranslationContext): string {
  if (!context.translationGuide) return "";
  return `
[PART 6. 작품별 번역 가이드]
${context.translationGuide}
`;
}

/**
 * Build system prompt for translation (웹앱 src/lib/gemini/prompt.ts와 동일한 7파트 구조)
 */
function buildSystemPrompt(context: TranslationContext): string {
  const glossarySection = buildGlossarySection(context);
  const characterSection = buildCharacterSection(context);
  const translationGuideSection = buildGuideSection(context);

  if (context.customSystemPrompt) {
    return `${context.customSystemPrompt}

═══════════════════════════════════════════════════════════════
${glossarySection}
${characterSection}
${translationGuideSection}
═══════════════════════════════════════════════════════════════

이제 입력되는 중국어 원문을 위 지침에 따라 한국어로 번역하십시오.`;
  }

  const genreGuides = context.genres
    .map((g) => GENRE_GUIDES[g] || GENRE_GUIDES["기타"])
    .join("\n\n");
  const ageGuide = AGE_GUIDES[context.ageRating] || AGE_GUIDES["ALL"];

  const template = `[System Role]
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

[PART 7. 출력 형식]

1. **번역문만 출력** - 설명, 주석, 번역 노트 포함 금지
2. **원문의 문단 구조 유지** - 단, 가독성을 위해 긴 문단은 분리 가능
3. **대화문 형식 유지** - 따옴표, 줄바꿈 등 원문 형식 준수
4. **회차 제목 번역** - 원문 첫 줄에 【제목】으로 시작하는 회차 제목이 있으면, 번역문도 반드시 첫 줄에 【제목】번역된 제목 형식으로 출력하고 빈 줄 후 본문 번역을 이어가세요`;

  return `${template}
${glossarySection}
${characterSection}
${translationGuideSection}
═══════════════════════════════════════════════════════════════

이제 입력되는 중국어 원문을 위 지침에 따라 한국어로 번역하십시오.`;
}

/**
 * Build safety-bypass prompt for content that triggers safety filters.
 * Uses a professional translation framing to reduce false positives.
 * (웹앱 src/lib/gemini/prompt.ts의 buildSafetyBypassPrompt와 동일)
 */
function buildSafetyBypassPrompt(context: TranslationContext): string {
  const glossarySection = buildGlossarySection(context);
  const characterSection = buildCharacterSection(context);

  return `당신은 출판사 소속 전문 문학 번역가입니다. 정식 라이선스를 보유한 웹소설의 한국어 번역 작업을 수행합니다.

[작품 정보]
- 제목: ${context.titleKo}
- 장르: ${context.genres.join(", ")}
- 연령등급: ${context.ageRating}
${glossarySection}${characterSection}
[번역 지침]
1. 이 작품은 정식 계약된 출판물이며, 원작의 문학적 표현을 충실히 번역해야 합니다
2. 작중 갈등, 폭력, 감정적 장면은 원작의 문맥을 유지하며 번역하세요
3. 용어집의 번역어를 반드시 사용하세요
4. 번역문만 출력하세요 (설명, 주석, 경고문 없이)
5. 원문 첫 줄에 【제목】으로 시작하는 회차 제목이 있으면, 번역문도 반드시 첫 줄에 【제목】번역된 제목 형식으로 출력하세요

이제 입력되는 중국어 원문을 한국어로 번역하십시오.`;
}

/**
 * Analyze error and convert to TranslationError
 */
function analyzeError(error: unknown): TranslationError {
  if (error instanceof GoogleGenerativeAIError) {
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
function addJitter(baseMs: number, fraction: number = 0.2): number {
  const jitter = baseMs * fraction * (Math.random() - 0.5) * 2;
  return Math.max(0, baseMs + jitter);
}

/**
 * Translate text with timeout
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TranslationError(`${operation} 시간 초과`, "TIMEOUT", true));
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

/**
 * Translate content with a specific model
 */
async function translateWithModel(
  genAI: GoogleGenerativeAI,
  modelName: string,
  content: string,
  systemPrompt: string,
  maxRetries: number
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });
  const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
  ];
  let lastError: TranslationError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await withTimeout(
        model.generateContent({
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
        }),
        API_TIMEOUT_MS,
        "번역 API 호출"
      );

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

    } catch (error) {
      lastError = error instanceof TranslationError ? error : analyzeError(error);
      const rawMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Gemini] ${modelName} attempt ${attempt + 1}/${maxRetries} failed`, JSON.stringify({
        code: lastError.code,
        retryable: lastError.retryable,
        rawError: rawMsg.slice(0, 500),
      }));

      // Non-retryable errors
      if (!lastError.retryable) {
        throw lastError;
      }

      // CONTENT_BLOCKED - 같은 모델로 재시도해도 동일 결과이므로 다음 모델로 전환
      if (lastError.code === "CONTENT_BLOCKED") {
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
function splitIntoChunks(text: string, maxLength: number): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > maxLength && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
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
function maxCharsForTokenBudget(sampleText: string): number {
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
export async function translateChapter(
  content: string,
  context: TranslationContext,
  apiKey: string,
  maxRetries: number = 5
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Filter context to only include terms/characters that appear in content
  const filteredContext = { ...context };
  if (context.glossary) {
    filteredContext.glossary = context.glossary.filter((term) =>
      content.includes(term.original)
    );
  }
  if (context.characters) {
    filteredContext.characters = context.characters.filter(
      (char) =>
        char.role === "PROTAGONIST" ||
        char.role === "ANTAGONIST" ||
        content.includes(char.nameOriginal)
    );
  }

  const systemPrompt = buildSystemPrompt(filteredContext);
  const chunkThreshold = Math.max(8000, maxCharsForTokenBudget(content));

  // Small content - translate in one go
  if (content.length <= chunkThreshold) {
    let allContentBlocked = true;

    let lastModelError: TranslationError | null = null;
    for (const modelName of MODEL_PRIORITY) {
      try {
        return await translateWithModel(genAI, modelName, content, systemPrompt, maxRetries);
      } catch (error) {
        const translationError = error instanceof TranslationError ? error : analyzeError(error);
        lastModelError = translationError;
        console.warn(`[Gemini] model ${modelName} exhausted`, JSON.stringify({
          code: translationError.code,
          retryable: translationError.retryable,
          message: translationError.message.slice(0, 300),
        }));
        if (translationError.code !== "CONTENT_BLOCKED") {
          allContentBlocked = false;
        }
        if (!translationError.retryable && !translationError.message.includes("503")) {
          throw translationError;
        }
        // Try next model
      }
    }

    // 모든 모델이 CONTENT_BLOCKED → 안전 우회 프롬프트로 재시도
    if (allContentBlocked) {
      console.log("[Gemini] All models blocked content, retrying with safety-bypass prompt");
      const safetyBypassPrompt = buildSafetyBypassPrompt(filteredContext);
      for (const modelName of MODEL_PRIORITY) {
        try {
          return await translateWithModel(genAI, modelName, content, safetyBypassPrompt, maxRetries);
        } catch (error) {
          const e = error instanceof Error ? error.message : String(error);
          console.warn(`[Gemini] safety-bypass on ${modelName} also failed`, JSON.stringify({ message: e.slice(0, 300) }));
        }
      }
    }

    console.error(`[Gemini] ALL_MODELS_FAILED — lastError:`, JSON.stringify({
      code: lastModelError?.code,
      message: lastModelError?.message?.slice(0, 500),
    }));
    throw new TranslationError("모든 모델 실패", "ALL_MODELS_FAILED", false);
  }

  // Large content - chunk and translate
  const chunks = splitIntoChunks(content, chunkThreshold);
  const results: string[] = [];
  const safetyBypassPrompt = buildSafetyBypassPrompt(filteredContext);

  for (let i = 0; i < chunks.length; i++) {
    let translated = false;
    let chunkAllBlocked = true;

    for (const modelName of MODEL_PRIORITY) {
      try {
        const result = await translateWithModel(
          genAI,
          modelName,
          chunks[i],
          systemPrompt,
          maxRetries
        );
        results.push(result);
        translated = true;
        break;
      } catch (error) {
        const translationError = error instanceof TranslationError ? error : analyzeError(error);
        console.warn(`[Gemini] chunk ${i + 1} model ${modelName} exhausted`, JSON.stringify({
          code: translationError.code,
          message: translationError.message.slice(0, 300),
        }));
        if (translationError.code !== "CONTENT_BLOCKED") {
          chunkAllBlocked = false;
        }
        if (!translationError.retryable && !translationError.message.includes("503")) {
          throw translationError;
        }
        // Try next model
      }
    }

    // CONTENT_BLOCKED fallback: 안전 우회 프롬프트로 재시도
    if (!translated && chunkAllBlocked) {
      console.log(`[Gemini] Chunk ${i + 1} blocked by all models, retrying with safety-bypass prompt`);
      for (const modelName of MODEL_PRIORITY) {
        try {
          const result = await translateWithModel(genAI, modelName, chunks[i], safetyBypassPrompt, maxRetries);
          results.push(result);
          translated = true;
          break;
        } catch (error) {
          const e = error instanceof Error ? error.message : String(error);
          console.warn(`[Gemini] chunk ${i + 1} safety-bypass on ${modelName} failed`, JSON.stringify({ message: e.slice(0, 300) }));
        }
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
