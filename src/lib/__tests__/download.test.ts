import { describe, it, expect } from "vitest";
import {
  generateTXT,
  generateDOCX,
  generateEPUB,
  generateFilename,
  getMimeType,
  type ChapterContent,
} from "@/lib/download";

describe("generateTXT", () => {
  it("UTF-8 BOM을 포함한다", () => {
    const chapters: ChapterContent[] = [
      { number: 1, title: "첫 화", content: "내용" },
    ];
    const buffer = generateTXT(chapters, "테스트");
    const text = buffer.toString("utf-8");

    expect(text.charCodeAt(0)).toBe(0xFEFF);
  });

  it("한글 작품 제목과 회차 정보를 올바르게 생성한다", () => {
    const chapters: ChapterContent[] = [
      { number: 1, title: "강호의 새벽", content: "이것은 무림의 중심이었다." },
      { number: 2, title: "폭풍의 시작", content: "검기가 하늘을 갈랐다." },
    ];
    const buffer = generateTXT(chapters, "무림 전사의 귀환");
    const text = buffer.toString("utf-8");

    expect(text).toContain("『무림 전사의 귀환』");
    expect(text).toContain("1화 - 강호의 새벽");
    expect(text).toContain("이것은 무림의 중심이었다.");
    expect(text).toContain("2화 - 폭풍의 시작");
    expect(text).toContain("검기가 하늘을 갈랐다.");
  });

  it("제목이 없는 회차를 처리한다", () => {
    const chapters: ChapterContent[] = [
      { number: 5, title: null, content: "본문 내용" },
    ];
    const buffer = generateTXT(chapters, "작품명");
    const text = buffer.toString("utf-8");

    expect(text).toContain("5화");
    expect(text).not.toContain("5화 -");
  });

  it("특수문자가 포함된 한글 콘텐츠를 정상 처리한다", () => {
    const content = "「여기가 어디지?」\n『무림세가』의 장원이었다.\n\u201C살아있다\u2026!\u201D";
    const chapters: ChapterContent[] = [
      { number: 1, title: "시작", content },
    ];
    const buffer = generateTXT(chapters, "귀환");
    const text = buffer.toString("utf-8");

    expect(text).toContain("「여기가 어디지?」");
    expect(text).toContain("『무림세가』");
    expect(text).toContain("\u201C살아있다\u2026!\u201D");
  });
});

describe("generateDOCX", () => {
  it("유효한 DOCX (ZIP) 형식을 생성한다", async () => {
    const chapters: ChapterContent[] = [
      { number: 1, title: "테스트", content: "한글 내용입니다." },
    ];
    const buffer = await generateDOCX(chapters, "테스트 작품");

    // DOCX는 ZIP → PK 시그니처
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer.length).toBeGreaterThan(100);
  });

  it("HTML 콘텐츠를 올바르게 처리한다", async () => {
    const chapters: ChapterContent[] = [
      {
        number: 1,
        title: "HTML 테스트",
        content: "<p><strong>강조</strong>된 <em>기울임</em> 텍스트</p><p>두 번째 문단</p>",
      },
    ];
    const buffer = await generateDOCX(chapters, "HTML 작품");

    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("여러 회차를 하나의 DOCX로 생성한다", async () => {
    const chapters: ChapterContent[] = [
      { number: 1, title: "1화", content: "첫 번째 내용" },
      { number: 2, title: "2화", content: "두 번째 내용" },
      { number: 3, title: "3화", content: "세 번째 내용" },
    ];
    const buffer = await generateDOCX(chapters, "연재 작품");

    expect(buffer.length).toBeGreaterThan(100);
  });
});

describe("generateEPUB", () => {
  it("유효한 EPUB (ZIP) 형식을 생성한다", async () => {
    const chapters: ChapterContent[] = [
      { number: 1, title: "첫 화", content: "한글 전자책 내용입니다." },
    ];
    const buffer = await generateEPUB(chapters, {
      title: "테스트 전자책",
      author: "작가명",
      language: "ko",
    });

    // EPUB은 ZIP → PK 시그니처
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer.length).toBeGreaterThan(100);
  });

  it("단일 회차 EPUB을 생성할 수 있다", async () => {
    const chapters: ChapterContent[] = [
      {
        number: 42,
        title: "폭풍의 시작",
        content: "<p>검기가 허공을 갈랐다.</p><p>세상이 변하기 시작했다.</p>",
      },
    ];
    const buffer = await generateEPUB(chapters, {
      title: "무림 전사의 귀환 - 42화",
      author: "무림 전사의 귀환",
      language: "ko",
    });

    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("빈 문단(<p></p>)이 포함된 HTML 콘텐츠를 처리한다", async () => {
    // toEditorHtml 수정 후 빈 줄이 <p></p>로 저장됨
    const chapters: ChapterContent[] = [
      {
        number: 1,
        title: "빈 줄 테스트",
        content: "<p>문단1</p><p></p><p>문단2</p>",
      },
    ];
    const buffer = await generateEPUB(chapters, {
      title: "빈 줄 EPUB",
      author: "테스트",
      language: "ko",
    });

    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer.length).toBeGreaterThan(100);
  });

  it("레거시 <p><br></p> 빈 줄도 EPUB에서 처리한다", async () => {
    const chapters: ChapterContent[] = [
      {
        number: 1,
        title: "레거시 빈 줄",
        content: "<p>문단1</p><p><br></p><p>문단2</p>",
      },
    ];
    const buffer = await generateEPUB(chapters, {
      title: "레거시 EPUB",
      author: "테스트",
      language: "ko",
    });

    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("한글 특수문자가 포함된 콘텐츠를 처리한다", async () => {
    const chapters: ChapterContent[] = [
      {
        number: 1,
        title: "「시작」",
        content: "「안녕하세요?」라고 말했다.\n\n『무림세가』에서 온 사람이었다.",
      },
    ];
    const buffer = await generateEPUB(chapters, {
      title: "특수문자 테스트",
      author: "저자",
      language: "ko",
    });

    expect(buffer.length).toBeGreaterThan(100);
  });
});

describe("generateFilename", () => {
  it("회차 번호 포함 파일명을 생성한다", () => {
    const filename = generateFilename("무림 전사의 귀환", 42, "txt");
    expect(filename).toBe("무림 전사의 귀환_제42화.txt");
  });

  it("회차 번호 없이 전체 번역본 파일명을 생성한다", () => {
    const filename = generateFilename("테스트 작품", undefined, "docx");
    expect(filename).toBe("테스트 작품_번역본.docx");
  });

  it("파일명에 사용할 수 없는 문자를 치환한다", () => {
    const filename = generateFilename('작품/제목:불가?"문자', 1, "txt");
    expect(filename).not.toContain("/");
    expect(filename).not.toContain(":");
    expect(filename).not.toContain("?");
    expect(filename).not.toContain('"');
    expect(filename).toContain("_제1화.txt");
  });

  it("EPUB 확장자를 올바르게 처리한다", () => {
    const filename = generateFilename("작품", 1, "epub");
    expect(filename).toBe("작품_제1화.epub");
  });
});

describe("getMimeType", () => {
  it("TXT MIME 타입을 반환한다", () => {
    expect(getMimeType("txt")).toBe("text/plain; charset=utf-8");
  });

  it("DOCX MIME 타입을 반환한다", () => {
    expect(getMimeType("docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  it("EPUB MIME 타입을 반환한다", () => {
    expect(getMimeType("epub")).toBe("application/epub+zip");
  });
});
