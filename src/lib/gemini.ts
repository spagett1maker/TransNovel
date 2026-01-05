import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

interface TranslationContext {
  titleKo: string;
  genres: string[];
  ageRating: string;
  synopsis: string;
  glossary?: Array<{ original: string; translated: string }>;
}

const GENRE_GUIDES: Record<string, string> = {
  무협: "무협 장르 특성에 맞게 무공 명칭, 문파 명칭 등을 자연스러운 한국어 무협체로 번역합니다.",
  로맨스: "감성적이고 서정적인 문체로 번역하며, 감정 표현을 섬세하게 살립니다.",
  로판: "로맨스 판타지 특유의 우아하고 품격 있는 문체를 유지합니다.",
  판타지: "판타지 세계관의 용어와 설정을 일관되게 번역합니다.",
  BL: "BL 장르 특성에 맞는 감성적인 문체와 표현을 사용합니다.",
  액션: "박진감 넘치는 문체로 액션 장면의 긴장감을 살립니다.",
  스릴러: "긴장감과 서스펜스를 유지하는 문체로 번역합니다.",
  기타: "일반적인 소설 문체로 자연스럽게 번역합니다.",
};

const AGE_GUIDES: Record<string, string> = {
  ALL: "전체 연령가에 적합한 순화된 표현을 사용합니다.",
  FIFTEEN: "15세 이상 적합한 수준의 표현을 사용합니다.",
  NINETEEN: "성인 대상 콘텐츠에 적합한 표현을 사용합니다.",
};

function buildSystemPrompt(context: TranslationContext): string {
  const genreGuides = context.genres
    .map((g) => GENRE_GUIDES[g] || GENRE_GUIDES["기타"])
    .join("\n");
  const ageGuide = AGE_GUIDES[context.ageRating] || AGE_GUIDES["ALL"];

  let glossarySection = "";
  if (context.glossary && context.glossary.length > 0) {
    glossarySection = `

## 용어집 (반드시 이 번역어를 사용하세요)
${context.glossary.map((g) => `- ${g.original} → ${g.translated}`).join("\n")}`;
  }

  return `당신은 ${context.genres.join(", ")} 장르의 중국어 웹소설을 한국어로 번역하는 전문 번역가입니다.

## 작품 정보
- 제목: ${context.titleKo}
- 줄거리: ${context.synopsis}

## 장르별 지침
${genreGuides}

## 연령등급
${ageGuide}
${glossarySection}

## 번역 규칙
1. 원문의 뉘앙스와 감정을 최대한 살려 자연스러운 한국어로 번역합니다.
2. 직역보다 의역을 우선하되, 원문의 의미를 왜곡하지 않습니다.
3. 캐릭터별 말투와 어조의 일관성을 유지합니다.
4. 중국어 특유의 표현은 한국 독자가 이해하기 쉽게 로컬라이징합니다.
5. 문화적 맥락이 필요한 경우 적절히 의역합니다.
6. 용어집에 있는 단어는 반드시 지정된 번역어를 사용합니다.
7. 대화문의 존칭과 반말은 캐릭터 관계에 맞게 자연스럽게 처리합니다.

## 출력 형식
- 번역문만 출력합니다. 설명이나 주석은 포함하지 않습니다.
- 원문의 문단 구조를 유지합니다.`;
}

export async function translateText(
  content: string,
  context: TranslationContext
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const systemPrompt = buildSystemPrompt(context);

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: systemPrompt },
          { text: `\n\n다음 중국어 원문을 한국어로 번역해주세요:\n\n${content}` },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 8192,
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
