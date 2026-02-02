import { describe, it, expect } from "vitest";
import {
  CHAPTER_STATUS_CONFIG,
  getChapterStatusConfig,
  getChapterStatusLabel,
  getChapterStatusVariant,
} from "../chapter-status";

const ChapterStatus = {
  PENDING: "PENDING",
  TRANSLATING: "TRANSLATING",
  TRANSLATED: "TRANSLATED",
  REVIEWING: "REVIEWING",
  EDITED: "EDITED",
  APPROVED: "APPROVED",
} as const;

describe("CHAPTER_STATUS_CONFIG", () => {
  it("모든 ChapterStatus에 대해 설정이 존재한다", () => {
    for (const status of Object.values(ChapterStatus)) {
      expect(CHAPTER_STATUS_CONFIG[status]).toBeDefined();
      expect(CHAPTER_STATUS_CONFIG[status].label).toBeTruthy();
      expect(CHAPTER_STATUS_CONFIG[status].variant).toBeTruthy();
    }
  });
});

describe("getChapterStatusConfig", () => {
  it("올바른 설정을 반환한다", () => {
    const config = getChapterStatusConfig(ChapterStatus.PENDING);
    expect(config.label).toBe("대기");
    expect(config.variant).toBe("pending");
  });

  it("알 수 없는 상태에 대해 기본값을 반환한다", () => {
    const config = getChapterStatusConfig("UNKNOWN" as any);
    expect(config.variant).toBe("secondary");
  });
});

describe("getChapterStatusLabel", () => {
  it("각 상태의 한국어 라벨을 반환한다", () => {
    expect(getChapterStatusLabel(ChapterStatus.PENDING)).toBe("대기");
    expect(getChapterStatusLabel(ChapterStatus.TRANSLATING)).toBe("번역중");
    expect(getChapterStatusLabel(ChapterStatus.TRANSLATED)).toBe("번역완료");
    expect(getChapterStatusLabel(ChapterStatus.REVIEWING)).toBe("윤문중");
    expect(getChapterStatusLabel(ChapterStatus.EDITED)).toBe("윤문완료");
    expect(getChapterStatusLabel(ChapterStatus.APPROVED)).toBe("작가승인");
  });
});

describe("getChapterStatusVariant", () => {
  it("각 상태의 배지 variant를 반환한다", () => {
    expect(getChapterStatusVariant(ChapterStatus.PENDING)).toBe("pending");
    expect(getChapterStatusVariant(ChapterStatus.TRANSLATING)).toBe("progress");
    expect(getChapterStatusVariant(ChapterStatus.TRANSLATED)).toBe("info");
    expect(getChapterStatusVariant(ChapterStatus.REVIEWING)).toBe("warning");
    expect(getChapterStatusVariant(ChapterStatus.EDITED)).toBe("success");
    expect(getChapterStatusVariant(ChapterStatus.APPROVED)).toBe("success");
  });

  it("알 수 없는 상태에 대해 secondary를 반환한다", () => {
    expect(getChapterStatusVariant("UNKNOWN" as any)).toBe("secondary");
  });
});
