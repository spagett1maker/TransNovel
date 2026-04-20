import { describe, it, expect } from "vitest";
import { toEditorHtml } from "../toEditorHtml";

describe("toEditorHtml", () => {
  // ── Empty / falsy input ──
  it("빈 문자열은 그대로 반환한다", () => {
    expect(toEditorHtml("")).toBe("");
  });

  // ── Plain text conversion ──
  it("한 줄 텍스트를 <p>로 감싼다", () => {
    expect(toEditorHtml("안녕하세요")).toBe("<p>안녕하세요</p>");
  });

  it("여러 줄 텍스트를 각각 <p>로 감싼다", () => {
    expect(toEditorHtml("줄1\n줄2\n줄3")).toBe(
      "<p>줄1</p><p>줄2</p><p>줄3</p>",
    );
  });

  it("빈 줄(\\n\\n)을 <p></p>로 변환한다 (NOT <p><br></p>)", () => {
    const result = toEditorHtml("문단1\n\n문단2");
    expect(result).toBe("<p>문단1</p><p></p><p>문단2</p>");
    expect(result).not.toContain("<br");
  });

  it("연속 빈 줄도 각각 <p></p>로 변환한다", () => {
    const result = toEditorHtml("A\n\n\nB");
    expect(result).toBe("<p>A</p><p></p><p></p><p>B</p>");
  });

  // ── \r\n normalization ──
  it("Windows 줄바꿈(\\r\\n)을 정규화한다", () => {
    const result = toEditorHtml("줄1\r\n줄2");
    expect(result).toBe("<p>줄1</p><p>줄2</p>");
    expect(result).not.toContain("\r");
  });

  it("\\r\\n 빈 줄이 두 배로 늘어나지 않는다", () => {
    // 핵심 버그 시나리오: \r\n\r\n → 빈 줄 1개여야 함
    const result = toEditorHtml("문단1\r\n\r\n문단2");
    expect(result).toBe("<p>문단1</p><p></p><p>문단2</p>");
  });

  it("단독 \\r도 정규화한다 (구형 Mac 줄바꿈)", () => {
    const result = toEditorHtml("A\rB");
    expect(result).toBe("<p>A</p><p>B</p>");
  });

  // ── HTML passthrough ──
  it("HTML 콘텐츠는 그대로 통과한다", () => {
    const html = "<p>문단1</p><p>문단2</p>";
    expect(toEditorHtml(html)).toBe(html);
  });

  it("서식이 포함된 HTML도 통과한다", () => {
    const html = "<p><strong>굵게</strong> 일반</p><p><em>기울임</em></p>";
    expect(toEditorHtml(html)).toBe(html);
  });

  // ── Legacy <p><br></p> fix ──
  it("레거시 <p><br></p>를 <p></p>로 치환한다", () => {
    expect(toEditorHtml("<p>텍스트</p><p><br></p><p>더</p>")).toBe(
      "<p>텍스트</p><p></p><p>더</p>",
    );
  });

  it("<p><br/></p> (self-closing)도 치환한다", () => {
    expect(toEditorHtml("<p>A</p><p><br/></p><p>B</p>")).toBe(
      "<p>A</p><p></p><p>B</p>",
    );
  });

  it("<p><br /></p> (space before slash)도 치환한다", () => {
    expect(toEditorHtml("<p>A</p><p><br /></p><p>B</p>")).toBe(
      "<p>A</p><p></p><p>B</p>",
    );
  });

  it("텍스트가 있는 <p>text<br></p>는 건드리지 않는다", () => {
    const html = "<p>텍스트<br></p>";
    expect(toEditorHtml(html)).toBe(html);
  });

  it("여러 개의 레거시 빈 줄도 모두 치환한다", () => {
    expect(
      toEditorHtml("<p>A</p><p><br></p><p><br></p><p>B</p>"),
    ).toBe("<p>A</p><p></p><p></p><p>B</p>");
  });

  // ── Real-world scenarios ──
  it("실제 번역 결과 시나리오: 여러 문단 + 빈 줄", () => {
    const translatedText = [
      "그는 문을 열었다.",
      "밖에는 비가 내리고 있었다.",
      "",
      "\"여기가 어디지?\"",
      "",
      "목소리가 메아리쳤다.",
    ].join("\n");

    const result = toEditorHtml(translatedText);
    // 6줄 → 6개의 <p>, 빈 줄은 <p></p>
    expect(result).toBe(
      "<p>그는 문을 열었다.</p>" +
      "<p>밖에는 비가 내리고 있었다.</p>" +
      "<p></p>" +
      '<p>"여기가 어디지?"</p>' +
      "<p></p>" +
      "<p>목소리가 메아리쳤다.</p>",
    );
  });

  it("Windows 줄바꿈 원문에서 빈 줄이 보존된다", () => {
    const windowsText = "第一章\r\n\r\n他打开了门。\r\n外面下着雨。";
    const result = toEditorHtml(windowsText);
    expect(result).toBe(
      "<p>第一章</p><p></p><p>他打开了门。</p><p>外面下着雨。</p>",
    );
  });
});
