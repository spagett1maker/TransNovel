import { GoogleGenerativeAI, GoogleGenerativeAIError } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

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

interface TranslationContext {
  titleKo: string;
  genres: string[];
  ageRating: string;
  synopsis: string;
  glossary?: Array<{ original: string; translated: string; note?: string }>;
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

  // 용어집 섹션 (캐릭터 톤&매너 포함 가능)
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
═══════════════════════════════════════════════════════════════

[PART 5. 출력 형식]

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

    // Invalid API key
    if (message.includes("api key") || message.includes("authentication") || message.includes("401")) {
      return new TranslationError(
        "API 인증 실패. 관리자에게 문의하세요.",
        "AUTH_ERROR",
        false
      );
    }

    // Model not available
    if (message.includes("model") || message.includes("not found") || message.includes("404")) {
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
  console.log("[Gemini] translateText 시작", {
    contentLength: content.length,
    title: context.titleKo,
    maxRetries,
  });

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-preview-05-20",
  });

  console.log("[Gemini] 모델 초기화 완료: gemini-2.5-flash-preview-05-20");

  const systemPrompt = buildSystemPrompt(context);
  console.log("[Gemini] 시스템 프롬프트 생성 완료, 길이:", systemPrompt.length);

  let lastError: TranslationError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    console.log(`[Gemini] 번역 시도 ${attempt + 1}/${maxRetries}`);
    try {
      console.log("[Gemini] API 요청 시작...");
      const result = await model.generateContent({
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
          maxOutputTokens: 16384,
        },
      });

      console.log("[Gemini] API 응답 수신");
      const response = result.response;
      const text = response.text();
      console.log("[Gemini] 응답 텍스트 길이:", text?.length || 0);

      if (!text || text.trim().length === 0) {
        console.error("[Gemini] 빈 응답 수신됨");
        throw new TranslationError(
          "AI가 빈 응답을 반환했습니다.",
          "EMPTY_RESPONSE",
          true
        );
      }

      console.log("[Gemini] 번역 성공, 결과 길이:", text.length);
      return text;
    } catch (error) {
      lastError = analyzeError(error);

      console.error(`Translation attempt ${attempt + 1} failed:`, {
        code: lastError.code,
        message: lastError.message,
        retryable: lastError.retryable,
      });

      // 재시도 불가능한 오류는 즉시 실패
      if (!lastError.retryable) {
        throw lastError;
      }

      // 마지막 시도가 아니면 지수 백오프로 대기
      if (attempt < maxRetries - 1) {
        // Rate limit 에러는 더 긴 대기 시간 (최소 15초, 최대 60초)
        const baseDelay = lastError.code === "RATE_LIMIT" ? 15000 : 2000;
        const backoffMs = Math.min(baseDelay * Math.pow(2, attempt), 60000);
        console.log(`[Gemini] ${backoffMs}ms 후 재시도...`);
        await delay(backoffMs);
      }
    }
  }

  // 모든 재시도 실패
  throw lastError || new TranslationError(
    "번역에 실패했습니다. 다시 시도해주세요.",
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

export async function translateChunks(
  chunks: string[],
  context: TranslationContext,
  onProgress?: (current: number, total: number, result: ChunkTranslationResult) => void
): Promise<{ results: string[]; failedChunks: number[] }> {
  console.log("[Gemini] translateChunks 시작", {
    totalChunks: chunks.length,
    title: context.titleKo,
  });

  const results: string[] = [];
  const failedChunks: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    // Rate limit 방지: 첫 번째 청크가 아니면 딜레이 추가
    if (i > 0) {
      const delayMs = 6000; // 6초 딜레이 (Gemini free tier: 10 RPM)
      console.log(`[Gemini] Rate limit 방지 딜레이: ${delayMs}ms`);
      await delay(delayMs);
    }

    console.log(`[Gemini] 청크 ${i + 1}/${chunks.length} 번역 시작, 길이: ${chunks[i].length}`);
    try {
      const translated = await translateText(chunks[i], context);
      console.log(`[Gemini] 청크 ${i + 1} 번역 완료`);
      results.push(translated);

      onProgress?.(i + 1, chunks.length, {
        index: i,
        success: true,
        content: translated,
      });
    } catch (error) {
      const translationError = error instanceof TranslationError
        ? error
        : analyzeError(error);

      console.error(`[Gemini] 청크 ${i + 1} 번역 실패:`, {
        code: translationError.code,
        message: translationError.message,
        retryable: translationError.retryable,
      });

      // 실패한 청크는 원문으로 대체하고 표시
      results.push(`[번역 실패: ${translationError.message}]\n\n${chunks[i]}`);
      failedChunks.push(i);

      onProgress?.(i + 1, chunks.length, {
        index: i,
        success: false,
        error: translationError.message,
      });

      // 재시도 불가능한 오류가 연속으로 발생하면 중단
      if (!translationError.retryable && failedChunks.length >= 3) {
        console.error("[Gemini] 연속 오류로 번역 중단");
        throw new TranslationError(
          `연속 오류로 번역 중단: ${translationError.message}`,
          "CONSECUTIVE_FAILURES",
          false
        );
      }
    }
  }

  console.log("[Gemini] translateChunks 완료", {
    totalResults: results.length,
    failedCount: failedChunks.length,
  });

  return { results, failedChunks };
}

export function splitIntoChunks(text: string, maxLength: number = 3000): string[] {
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
  console.log("[Gemini] retranslateText 시작", {
    originalLength: originalContent.length,
    translationLength: currentTranslation.length,
    feedbackLength: feedback.length,
    hasSelectedText: !!selectedText,
  });

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-preview-05-20",
  });

  const prompt = buildRetranslatePrompt(
    originalContent,
    currentTranslation,
    feedback,
    selectedText,
    context
  );

  console.log("[Gemini] 재번역 프롬프트 생성 완료, 길이:", prompt.length);

  let lastError: TranslationError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    console.log(`[Gemini] 재번역 시도 ${attempt + 1}/${maxRetries}`);
    try {
      const result = await model.generateContent({
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
          maxOutputTokens: 16384,
        },
      });

      console.log("[Gemini] 재번역 API 응답 수신");
      const response = result.response;
      const text = response.text();

      if (!text || text.trim().length === 0) {
        throw new TranslationError(
          "AI가 빈 응답을 반환했습니다.",
          "EMPTY_RESPONSE",
          true
        );
      }

      console.log("[Gemini] 재번역 성공, 결과 길이:", text.length);
      return text;
    } catch (error) {
      lastError = analyzeError(error);

      console.error(`[Gemini] 재번역 시도 ${attempt + 1} 실패:`, {
        code: lastError.code,
        message: lastError.message,
        retryable: lastError.retryable,
      });

      if (!lastError.retryable) {
        throw lastError;
      }

      if (attempt < maxRetries - 1) {
        const baseDelay = lastError.code === "RATE_LIMIT" ? 5000 : 1000;
        const backoffMs = Math.min(baseDelay * Math.pow(2, attempt), 30000);
        console.log(`[Gemini] ${backoffMs}ms 후 재시도...`);
        await delay(backoffMs);
      }
    }
  }

  throw lastError || new TranslationError(
    "재번역에 실패했습니다. 다시 시도해주세요.",
    "MAX_RETRIES",
    false
  );
}
