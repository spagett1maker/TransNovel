// 클라이언트 측 번역 유틸리티
// Vercel Hobby 플랜 (10초 제한)에서 동작하도록 설계됨

interface TranslationContext {
  titleKo: string;
  genres: string[];
  ageRating: string;
  synopsis: string;
  glossary?: Array<{ original: string; translated: string; note?: string }>;
}

interface TranslationProgress {
  currentChapter: number;
  totalChapters: number;
  currentChunk: number;
  totalChunks: number;
  completedChapters: number;
  failedChapters: number;
  status: "idle" | "translating" | "completed" | "failed" | "cancelled";
  error?: string;
}

type ProgressCallback = (progress: TranslationProgress) => void;

// 텍스트를 청크로 분할 (서버 로직과 동일, Vercel Hobby 플랜용 500자)
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

  return chunks;
}

// 긴 문단을 문장 단위로 분할
function splitLongParagraph(paragraph: string, maxLength: number): string[] {
  if (paragraph.length <= maxLength) {
    return [paragraph];
  }

  const results: string[] = [];
  const sentenceDelimiters = /([。！？.!?]+["」』"']*)\s*/g;
  const sentences: string[] = [];
  let lastIndex = 0;

  let match;
  while ((match = sentenceDelimiters.exec(paragraph)) !== null) {
    const sentence = paragraph.slice(lastIndex, match.index + match[0].length);
    sentences.push(sentence.trim());
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < paragraph.length) {
    const remaining = paragraph.slice(lastIndex).trim();
    if (remaining) {
      sentences.push(remaining);
    }
  }

  if (sentences.length === 0) {
    sentences.push(paragraph);
  }

  let currentChunk = "";
  for (const sentence of sentences) {
    if (sentence.length > maxLength) {
      if (currentChunk) {
        results.push(currentChunk.trim());
        currentChunk = "";
      }
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

// 단일 청크 번역
async function translateChunk(
  text: string,
  context: TranslationContext,
  retries: number = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch("/api/translation/translate-chunk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context }),
      });

      // 504 Gateway Timeout 처리
      if (response.status === 504) {
        throw new Error("서버 응답 시간 초과. 잠시 후 다시 시도합니다.");
      }

      // 비-JSON 응답 처리 (Vercel 에러 페이지 등)
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("비-JSON 응답:", text.substring(0, 200));
        throw new Error("서버 오류가 발생했습니다. 잠시 후 다시 시도합니다.");
      }

      const data = await response.json();

      if (!response.ok) {
        // 503은 재시도 가능
        if (response.status === 503 && data.retryable && attempt < retries - 1) {
          // 지수 백오프
          await new Promise((r) => setTimeout(r, 3000 * Math.pow(2, attempt)));
          continue;
        }
        throw new Error(data.error || "번역 실패");
      }

      return data.translated;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 재시도 (마지막 시도가 아닐 때만)
      if (attempt < retries - 1) {
        console.log(`번역 재시도 ${attempt + 1}/${retries}:`, lastError.message);
        await new Promise((r) => setTimeout(r, 3000 * Math.pow(2, attempt)));
        continue;
      }
    }
  }

  throw lastError || new Error("번역 실패");
}

// 챕터 저장
async function saveChapter(
  chapterId: string,
  translatedContent: string,
  workId: string
): Promise<void> {
  const response = await fetch("/api/translation/save-chapter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapterId, translatedContent, workId }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "챕터 저장 실패");
  }
}

// 작품 컨텍스트 가져오기
export async function getTranslationContext(
  workId: string
): Promise<TranslationContext> {
  const response = await fetch(`/api/translation/context?workId=${workId}`);

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "컨텍스트 조회 실패");
  }

  return response.json();
}

// 취소 토큰 인터페이스
export interface CancelToken {
  cancelled: boolean;
  cancel: () => void;
}

export function createCancelToken(): CancelToken {
  return {
    cancelled: false,
    cancel() {
      this.cancelled = true;
    },
  };
}

// 챕터 정보 (원문 없이)
interface ChapterInfo {
  id: string;
  number: number;
}

// 챕터 원문 가져오기
async function fetchChapterContent(
  workId: string,
  chapterNumber: number
): Promise<string> {
  const response = await fetch(`/api/works/${workId}/chapters/${chapterNumber}`);
  if (!response.ok) {
    throw new Error(`${chapterNumber}화 콘텐츠를 가져오는데 실패했습니다.`);
  }
  const data = await response.json();
  return data.originalContent;
}

// 클라이언트 측 번역 실행 (챕터 원문은 필요할 때만 가져옴)
export async function translateChaptersClient(
  workId: string,
  chapters: ChapterInfo[],
  onProgress: ProgressCallback,
  cancelToken?: CancelToken
): Promise<{ completedChapters: number; failedChapters: number[] }> {
  // 컨텍스트 가져오기
  const context = await getTranslationContext(workId);

  const progress: TranslationProgress = {
    currentChapter: 0,
    totalChapters: chapters.length,
    currentChunk: 0,
    totalChunks: 0,
    completedChapters: 0,
    failedChapters: 0,
    status: "translating",
  };

  const failedChapterNumbers: number[] = [];

  for (let i = 0; i < chapters.length; i++) {
    // 취소 확인
    if (cancelToken?.cancelled) {
      progress.status = "cancelled";
      onProgress(progress);
      break;
    }

    const chapter = chapters[i];
    progress.currentChapter = chapter.number;
    progress.currentChunk = 0;
    progress.totalChunks = 0;
    onProgress(progress);

    try {
      // 번역할 때 원문 가져오기 (메모리 효율)
      const originalContent = await fetchChapterContent(workId, chapter.number);

      // 청크 분할
      const chunks = splitIntoChunks(originalContent);
      progress.totalChunks = chunks.length;
      onProgress(progress);

      const translatedChunks: string[] = [];

      for (let j = 0; j < chunks.length; j++) {
        // 취소 확인
        if (cancelToken?.cancelled) {
          progress.status = "cancelled";
          onProgress(progress);
          throw new Error("cancelled");
        }

        progress.currentChunk = j + 1;
        onProgress(progress);

        // 청크 번역 (각 호출이 10초 내에 완료됨)
        const translated = await translateChunk(chunks[j], context);
        translatedChunks.push(translated);

        // 청크 간 약간의 딜레이 (rate limit 방지)
        if (j < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      // 번역 결과 조합 및 저장
      const translatedContent = translatedChunks.join("\n\n");
      await saveChapter(chapter.id, translatedContent, workId);

      progress.completedChapters++;
    } catch (error) {
      if (cancelToken?.cancelled) {
        break;
      }

      console.error(`챕터 ${chapter.number} 번역 실패:`, error);
      progress.failedChapters++;
      failedChapterNumbers.push(chapter.number);
    }

    onProgress(progress);

    // 챕터 간 딜레이
    if (i < chapters.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // 최종 상태
  if (!cancelToken?.cancelled) {
    progress.status = failedChapterNumbers.length === chapters.length ? "failed" : "completed";
    onProgress(progress);
  }

  return {
    completedChapters: progress.completedChapters,
    failedChapters: failedChapterNumbers,
  };
}
