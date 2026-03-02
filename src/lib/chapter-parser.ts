export interface ParsedChapter {
  number: number;
  title?: string;
  content: string;
  volume?: string;       // 볼륨 이름: "正文", "红顶" 등
  volumeNumber?: number; // 볼륨 내 원래 챕터 번호
}

// 한자 숫자 → 아라비아 숫자 변환
const CJK_DIGITS: Record<string, number> = {
  零: 0, 〇: 0,
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
};

const CJK_UNITS: Record<string, number> = {
  十: 10, 百: 100, 千: 1000, 万: 10000, 萬: 10000,
};

function chineseToNumber(str: string): number {
  // 아라비아 숫자만 있으면 바로 반환
  const arabicMatch = str.match(/\d+/);
  if (arabicMatch && arabicMatch[0] === str.replace(/[^\d]/g, "")) {
    const num = parseInt(arabicMatch[0], 10);
    if (!isNaN(num)) return num;
  }

  // 한자 숫자 변환
  let result = 0;
  let current = 0;

  for (const char of str) {
    if (char in CJK_DIGITS) {
      current = CJK_DIGITS[char];
    } else if (char in CJK_UNITS) {
      const unit = CJK_UNITS[char];
      if (current === 0) current = 1; // 十 = 10 (not 0 * 10)
      result += current * unit;
      current = 0;
    }
  }

  result += current; // 남은 일의 자리

  return result || NaN;
}

// 앞쪽 공백 + 마크다운 헤더 접두사 제거
function stripMarkdown(header: string): string {
  return header.replace(/^[\s\u3000]*#{1,6}\s+/, "").replace(/^[\s\u3000]+/, "");
}

// 헤더에서 번호 추출
function extractNumber(header: string): number {
  header = stripMarkdown(header);
  // 아라비아 숫자 먼저 시도
  const arabicMatch = header.match(/\d+/);
  if (arabicMatch) {
    return parseInt(arabicMatch[0], 10);
  }

  // 한자 숫자 추출 (第 다음 ~ 章/话 앞)
  const cjkMatch = header.match(/第([一二三四五六七八九十百千万萬零〇]+)/);
  if (cjkMatch) {
    return chineseToNumber(cjkMatch[1]);
  }

  return NaN;
}

// 헤더에서 인라인 제목 추출
function extractTitleFromHeader(header: string): string | undefined {
  header = stripMarkdown(header);
  // "第1章 黎明之前" / "第一章 黎明之前"
  const cjkTitle = header.match(
    /^第[一二三四五六七八九十百千万萬零〇\d]+[章话話節节回卷]\s*[:\-\s]\s*(.+)$/
  );
  if (cjkTitle?.[1]) return cjkTitle[1].trim();

  // "第1章黎明" (구분자 없이 바로 제목) — 제목이 숫자/기호로 시작하면 무시
  const cjkNoSep = header.match(
    /^第[一二三四五六七八九十百千万萬零〇\d]+[章话話節节回卷]([^\d\s].+)$/
  );
  if (cjkNoSep?.[1]) return cjkNoSep[1].trim();

  // "Chapter 1: The Beginning" / "Chapter 1 - The Beginning"
  const enTitle = header.match(
    /^(?:Chapter|Ch\.?|Episode|Part)\s*\d+\s*[:\-–—]\s*(.+)$/i
  );
  if (enTitle?.[1]) return enTitle[1].trim();

  // "제1화 - 새로운 시작" / "제1화 새로운 시작"
  const koTitle = header.match(
    /^제?\s*\d+\s*[화장회편]\s*[:\-–—\s]\s*(.+)$/
  );
  if (koTitle?.[1]) return koTitle[1].trim();

  // "1. 제목" / "1、제목"
  const numTitle = header.match(/^\d{1,4}[\.、]\s*(.+)$/);
  if (numTitle?.[1]) return numTitle[1].trim();

  return undefined;
}

// 접두사가 붙은 챕터 헤더를 정규화 (파싱 전 전처리)
// "正文 第285章 风雨" → "第285章 风雨"
// "红顶 第1章 南渡北归" → "第1章 南渡北归"
function normalizeChapterHeaders(text: string): string {
  return text.replace(
    /^([\s\u3000]*)((?:正文|[\u4e00-\u9fff]{2,4})\s+)(第[一二三四五六七八九十百千万萬零〇\d]+[章话話節节回].*)$/gm,
    (match, ws: string, prefix: string, chapterAndRest: string) => {
      // "正文"은 항상 섹션 라벨이므로 안전하게 제거
      if (prefix.trim() === "正文") return ws + chapterAndRest;
      // CJK 접두사: 짧은 줄(헤더)에서만 제거, 긴 줄(본문)은 유지
      // 소설 본문에서 "赵甲第 第7章..." 같은 false positive 방지
      if (match.trim().length <= 80) return ws + chapterAndRest;
      return match;
    }
  );
}

// 볼륨 마커 감지 (챕터가 아님)
// "第二卷红顶" → true (볼륨 마커)
// "第三卷" → false (이름 없음, 챕터일 수 있음)
function isVolumeMarker(header: string): boolean {
  const stripped = stripMarkdown(header);
  return /^第[一二三四五六七八九十百千万萬零〇\d]+卷\s*\S/.test(stripped);
}

// 볼륨 마커에서 이름 추출
// "第二卷红顶" → "红顶"
function extractVolumeName(header: string): string {
  const stripped = stripMarkdown(header);
  const match = stripped.match(/^第[一二三四五六七八九十百千万萬零〇\d]+卷\s*(.+)$/);
  return match?.[1]?.trim() || stripped;
}

// 프롤로그/에필로그 패턴
const PROLOGUE_PATTERN = /^(?:序章|序幕|プロローグ|Prologue|프롤로그)(?:\s*[:\-–—]\s*(.+))?$/gim;
const EPILOGUE_PATTERN = /^(?:終章|尾声|エピローグ|Epilogue|에필로그)(?:\s*[:\-–—]\s*(.+))?$/gim;

// 선택적 앞쪽 공백 + 마크다운 헤더 접두사 (### , ## , # 등)
const WS = "[ \\t\\u3000]*"; // 공백, 탭, 전각 공백
const MD = "(?:#{1,6}\\s+)?";

// 챕터 감지 패턴 (우선순위순)
const CHAPTER_PATTERNS = [
  // CJK 통합: 第X章/话/話/節/节/回/卷
  new RegExp(`^${WS}${MD}第[一二三四五六七八九十百千万萬零〇\\d]+[章话話節节回卷].*$`, "gm"),

  // 영어: Chapter / Ch. / Episode / Part
  new RegExp(`^${WS}${MD}(?:Chapter|Ch\\.?|Episode|Part)\\s*\\d+.*$`, "gim"),

  // 한국어: 제X화/장/회/편 또는 X화/장/회/편
  new RegExp(`^${WS}${MD}제?\\s*\\d+\\s*[화장회편].*$`, "gm"),

  // 숫자만: "1. Title" / "1、Title" (1~4자리, 뒤에 비숫자 문자 필수)
  new RegExp(`^${WS}${MD}\\d{1,4}[\\.、]\\s*\\S.*$`, "gm"),
];

/**
 * 텍스트에서 챕터를 자동 감지하여 분리
 */
export function parseChaptersFromText(
  text: string,
  separator?: string
): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];

  // 사용자 지정 구분자
  if (separator) {
    const parts = text.split(separator).filter((p) => p.trim());
    parts.forEach((part, index) => {
      const trimmed = part.trim();
      if (trimmed) {
        const lines = trimmed.split("\n");
        const firstLine = lines[0].trim();
        const content = lines.slice(1).join("\n").trim() || trimmed;

        chapters.push({
          number: index + 1,
          title: firstLine.length < 100 ? firstLine : undefined,
          content,
        });
      }
    });
    return chapters;
  }

  // 접두사에서 기본 볼륨 이름 사전 감지 (정규화 전)
  const hasMainTextPrefix = /^[\s\u3000]*正文\s+第/m.test(text);

  // 접두사 정규화 (正文 第X章, 红顶 第X章 → 第X章)
  text = normalizeChapterHeaders(text);

  // 프롤로그/에필로그 감지
  const prologueMatches = [...text.matchAll(new RegExp(PROLOGUE_PATTERN.source, "gim"))];
  const epilogueMatches = [...text.matchAll(new RegExp(EPILOGUE_PATTERN.source, "gim"))];

  // 가장 많이 매칭되는 챕터 패턴 찾기
  let bestPattern: RegExp | null = null;
  let maxMatches = 0;

  for (const pattern of CHAPTER_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > maxMatches) {
      maxMatches = matches.length;
      bestPattern = pattern;
    }
  }

  if (bestPattern && maxMatches >= 2) {
    // 매칭된 헤더와 위치 수집
    const headerMatches = [...text.matchAll(new RegExp(bestPattern.source, bestPattern.flags.includes("i") ? "gmi" : "gm"))];

    // 프롤로그/에필로그 + 챕터 헤더를 위치순으로 정렬
    interface HeaderInfo {
      index: number;
      header: string;
      type: "prologue" | "epilogue" | "chapter";
      volume?: string;
    }

    const allHeaders: HeaderInfo[] = [];

    for (const m of prologueMatches) {
      if (m.index !== undefined) {
        allHeaders.push({ index: m.index, header: m[0], type: "prologue" });
      }
    }
    for (const m of epilogueMatches) {
      if (m.index !== undefined) {
        allHeaders.push({ index: m.index, header: m[0], type: "epilogue" });
      }
    }
    for (const m of headerMatches) {
      if (m.index !== undefined) {
        // 본문 텍스트 false positive 필터: "第一节课下课期间..." 같은 긴 줄 제외
        if (m[0].trim().length > 120) continue;
        allHeaders.push({ index: m.index, header: m[0], type: "chapter" });
      }
    }

    allHeaders.sort((a, b) => a.index - b.index);

    // 볼륨 마커 필터링 + 볼륨 추적
    let currentVolume: string | undefined;
    let hasAnyVolume = false;
    const filteredHeaders: HeaderInfo[] = [];

    for (const h of allHeaders) {
      if (h.type === "chapter" && isVolumeMarker(h.header)) {
        currentVolume = extractVolumeName(h.header);
        hasAnyVolume = true;
        continue; // 볼륨 마커 자체는 챕터가 아니므로 제외
      }
      filteredHeaders.push({ ...h, volume: currentVolume });
    }

    // 볼륨이 존재하면 이전 챕터들에 기본 볼륨명 소급 적용
    if (hasAnyVolume) {
      const defaultVolume = hasMainTextPrefix ? "正文" : "正文";
      for (const h of filteredHeaders) {
        if (!h.volume) h.volume = defaultVolume;
      }
    }

    // 첫 헤더 이전 텍스트가 있으면 프롤로그로
    if (filteredHeaders.length > 0) {
      const beforeFirst = text.slice(0, filteredHeaders[0].index).trim();
      if (beforeFirst && beforeFirst.length > 50) {
        chapters.push({
          number: 0,
          title: "프롤로그",
          content: beforeFirst,
        });
      }
    }

    // 각 헤더별 콘텐츠 추출
    let maxChapterNum = 0;
    for (let i = 0; i < filteredHeaders.length; i++) {
      const current = filteredHeaders[i];
      const contentStart = current.index + current.header.length;
      const contentEnd = i < filteredHeaders.length - 1 ? filteredHeaders[i + 1].index : text.length;
      const content = text.slice(contentStart, contentEnd).trim();

      if (!content) continue;

      if (current.type === "prologue") {
        const titleMatch = current.header.match(/[:\-–—]\s*(.+)$/);
        chapters.push({
          number: 0,
          title: titleMatch?.[1]?.trim() || "프롤로그",
          content,
          volume: current.volume,
        });
      } else if (current.type === "epilogue") {
        // 에필로그는 마지막 챕터 번호 + 1
        const titleMatch = current.header.match(/[:\-–—]\s*(.+)$/);
        chapters.push({
          number: -1, // 나중에 재할당
          title: titleMatch?.[1]?.trim() || "에필로그",
          content,
          volume: current.volume,
        });
      } else {
        const num = extractNumber(current.header);
        const inlineTitle = extractTitleFromHeader(current.header);

        // 인라인 제목이 없으면 콘텐츠 첫 줄에서 제목 추출 시도
        let title = inlineTitle;
        let finalContent = content;

        if (!title) {
          const lines = content.split("\n");
          const firstLine = lines[0].trim();
          const isTitle =
            firstLine.length > 0 &&
            firstLine.length < 50 &&
            !firstLine.includes("。") &&
            !firstLine.includes(".");
          if (isTitle && lines.length > 1) {
            title = firstLine;
            finalContent = lines.slice(1).join("\n").trim();
          }
        }

        const chapterNum = isNaN(num) ? i + 1 : num;
        if (chapterNum > maxChapterNum) maxChapterNum = chapterNum;

        chapters.push({
          number: chapterNum,
          title,
          content: finalContent,
          volume: current.volume,
        });
      }
    }

    // 섹션 경계 감지: 챕터 번호가 급감하면 새 섹션(권)으로 간주하여 오프셋 적용
    // 예: 정본 1~310, 외전 1~60 → 정본 1~310, 외전 311~370
    let sectionOffset = 0;
    let maxRawInSection = 0;

    for (const ch of chapters) {
      if (ch.number <= 0) continue; // 프롤로그/에필로그 건너뛰기

      const rawNum = ch.number;

      if (
        maxRawInSection > 0 &&
        rawNum < maxRawInSection * 0.3 &&
        maxRawInSection - rawNum > 10
      ) {
        // 번호 리스타트 감지 → 새 섹션 시작
        sectionOffset += maxRawInSection;
        maxRawInSection = 0;
      }

      // 볼륨 내 원래 번호 보존 (오프셋 적용 전)
      if (hasAnyVolume) {
        ch.volumeNumber = rawNum;
      }

      ch.number = rawNum + sectionOffset;

      if (rawNum > maxRawInSection) {
        maxRawInSection = rawNum;
      }
    }

    // maxChapterNum 재계산 (오프셋 적용 후)
    maxChapterNum = 0;
    for (const ch of chapters) {
      if (ch.number > maxChapterNum) maxChapterNum = ch.number;
    }

    // 에필로그 번호 재할당
    for (const ch of chapters) {
      if (ch.number === -1) {
        ch.number = maxChapterNum + 1;
      }
    }
  } else {
    // 패턴을 찾지 못한 경우

    // 프롤로그/에필로그만 있는지 확인
    if (prologueMatches.length > 0 || epilogueMatches.length > 0) {
      const allSpecial = [
        ...prologueMatches.map((m) => ({ ...m, type: "prologue" as const })),
        ...epilogueMatches.map((m) => ({ ...m, type: "epilogue" as const })),
      ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      for (let i = 0; i < allSpecial.length; i++) {
        const current = allSpecial[i];
        if (current.index === undefined) continue;
        const contentStart = current.index + current[0].length;
        const contentEnd = i < allSpecial.length - 1 ? (allSpecial[i + 1].index ?? text.length) : text.length;
        const content = text.slice(contentStart, contentEnd).trim();
        if (!content) continue;

        chapters.push({
          number: current.type === "prologue" ? 0 : 1,
          title: current.type === "prologue" ? "프롤로그" : "에필로그",
          content,
        });
      }
    }

    // 여전히 비어있으면 전체를 하나의 챕터로
    if (chapters.length === 0) {
      chapters.push({
        number: 1,
        title: undefined,
        content: text.trim(),
      });
    }
  }

  return chapters;
}
