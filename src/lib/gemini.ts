import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

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

export async function translateText(
  content: string,
  context: TranslationContext
): Promise<string> {
  // Gemini 2.5 Flash 모델 사용 (빠르고 고품질)
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

  const systemPrompt = buildSystemPrompt(context);

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
      temperature: 0.4, // 약간의 창의성 허용 (각색을 위해)
      topP: 0.85,
      topK: 40,
      maxOutputTokens: 16384, // 긴 출력 허용
    },
  });

  const response = result.response;
  return response.text();
}

export async function translateChunks(
  chunks: string[],
  context: TranslationContext,
  onProgress?: (current: number, total: number) => void
): Promise<string[]> {
  const results: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const translated = await translateText(chunks[i], context);
    results.push(translated);
    onProgress?.(i + 1, chunks.length);
  }

  return results;
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
