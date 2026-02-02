import { describe, it, expect } from "vitest";
import {
  WORK_STATUS_CONFIG,
  getWorkStatusConfig,
  getWorkStatusLabel,
  getWorkStatusVariant,
  WORK_STATUS_TABS,
  canTransitionWorkStatus,
} from "../work-status";

const WorkStatus = {
  PREPARING: "PREPARING",
  ONGOING: "ONGOING",
  REGISTERED: "REGISTERED",
  BIBLE_GENERATING: "BIBLE_GENERATING",
  BIBLE_DRAFT: "BIBLE_DRAFT",
  BIBLE_CONFIRMED: "BIBLE_CONFIRMED",
  TRANSLATING: "TRANSLATING",
  TRANSLATED: "TRANSLATED",
  PROOFREADING: "PROOFREADING",
  COMPLETED: "COMPLETED",
} as const;

// ─── WORK_STATUS_CONFIG ──────────────────────────────────
describe("WORK_STATUS_CONFIG", () => {
  it("모든 WorkStatus에 대해 설정이 존재한다", () => {
    for (const status of Object.values(WorkStatus)) {
      expect(WORK_STATUS_CONFIG[status]).toBeDefined();
      expect(WORK_STATUS_CONFIG[status].label).toBeTruthy();
      expect(WORK_STATUS_CONFIG[status].variant).toBeTruthy();
    }
  });
});

// ─── getWorkStatusConfig ─────────────────────────────────
describe("getWorkStatusConfig", () => {
  it("올바른 설정을 반환한다", () => {
    const config = getWorkStatusConfig(WorkStatus.TRANSLATING);
    expect(config.label).toBe("번역중");
    expect(config.variant).toBe("progress");
  });

  it("알 수 없는 상태에 대해 기본값을 반환한다", () => {
    const config = getWorkStatusConfig("UNKNOWN" as any);
    expect(config.variant).toBe("secondary");
  });
});

// ─── getWorkStatusLabel / getWorkStatusVariant ───────────
describe("getWorkStatusLabel", () => {
  it("각 상태의 한국어 라벨을 반환한다", () => {
    expect(getWorkStatusLabel(WorkStatus.REGISTERED)).toBe("등록완료");
    expect(getWorkStatusLabel(WorkStatus.COMPLETED)).toBe("완료");
    expect(getWorkStatusLabel(WorkStatus.PROOFREADING)).toBe("윤문중");
  });
});

describe("getWorkStatusVariant", () => {
  it("각 상태의 배지 variant를 반환한다", () => {
    expect(getWorkStatusVariant(WorkStatus.COMPLETED)).toBe("success");
    expect(getWorkStatusVariant(WorkStatus.TRANSLATING)).toBe("progress");
    expect(getWorkStatusVariant(WorkStatus.BIBLE_DRAFT)).toBe("warning");
  });
});

// ─── WORK_STATUS_TABS ────────────────────────────────────
describe("WORK_STATUS_TABS", () => {
  it("all 탭은 statuses가 null이다", () => {
    expect(WORK_STATUS_TABS.all.statuses).toBeNull();
  });

  it("preparing 탭은 준비 관련 상태를 포함한다", () => {
    expect(WORK_STATUS_TABS.preparing.statuses).toContain("REGISTERED");
    expect(WORK_STATUS_TABS.preparing.statuses).toContain("BIBLE_GENERATING");
    expect(WORK_STATUS_TABS.preparing.statuses).toContain("BIBLE_DRAFT");
    expect(WORK_STATUS_TABS.preparing.statuses).toContain("BIBLE_CONFIRMED");
  });

  it("completed 탭은 COMPLETED만 포함한다", () => {
    expect(WORK_STATUS_TABS.completed.statuses).toEqual(["COMPLETED"]);
  });
});

// ─── canTransitionWorkStatus ─────────────────────────────
describe("canTransitionWorkStatus", () => {
  it("같은 상태로의 전이를 허용한다", () => {
    expect(canTransitionWorkStatus(WorkStatus.REGISTERED, WorkStatus.REGISTERED)).toBe(true);
  });

  describe("정상 워크플로우", () => {
    it("REGISTERED → BIBLE_GENERATING", () => {
      expect(canTransitionWorkStatus(WorkStatus.REGISTERED, WorkStatus.BIBLE_GENERATING)).toBe(true);
    });

    it("REGISTERED → BIBLE_CONFIRMED (바이블 스킵)", () => {
      expect(canTransitionWorkStatus(WorkStatus.REGISTERED, WorkStatus.BIBLE_CONFIRMED)).toBe(true);
    });

    it("BIBLE_GENERATING → BIBLE_DRAFT", () => {
      expect(canTransitionWorkStatus(WorkStatus.BIBLE_GENERATING, WorkStatus.BIBLE_DRAFT)).toBe(true);
    });

    it("BIBLE_DRAFT → BIBLE_CONFIRMED", () => {
      expect(canTransitionWorkStatus(WorkStatus.BIBLE_DRAFT, WorkStatus.BIBLE_CONFIRMED)).toBe(true);
    });

    it("BIBLE_CONFIRMED → TRANSLATING", () => {
      expect(canTransitionWorkStatus(WorkStatus.BIBLE_CONFIRMED, WorkStatus.TRANSLATING)).toBe(true);
    });

    it("TRANSLATING → TRANSLATED", () => {
      expect(canTransitionWorkStatus(WorkStatus.TRANSLATING, WorkStatus.TRANSLATED)).toBe(true);
    });

    it("TRANSLATED → PROOFREADING", () => {
      expect(canTransitionWorkStatus(WorkStatus.TRANSLATED, WorkStatus.PROOFREADING)).toBe(true);
    });

    it("PROOFREADING → COMPLETED", () => {
      expect(canTransitionWorkStatus(WorkStatus.PROOFREADING, WorkStatus.COMPLETED)).toBe(true);
    });
  });

  describe("롤백 전이", () => {
    it("BIBLE_GENERATING → REGISTERED (실패 시 롤백)", () => {
      expect(canTransitionWorkStatus(WorkStatus.BIBLE_GENERATING, WorkStatus.REGISTERED)).toBe(true);
    });

    it("TRANSLATING → BIBLE_CONFIRMED (번역 실패/일시정지)", () => {
      expect(canTransitionWorkStatus(WorkStatus.TRANSLATING, WorkStatus.BIBLE_CONFIRMED)).toBe(true);
    });

    it("TRANSLATED → TRANSLATING (재번역)", () => {
      expect(canTransitionWorkStatus(WorkStatus.TRANSLATED, WorkStatus.TRANSLATING)).toBe(true);
    });
  });

  describe("불허 전이", () => {
    it("COMPLETED에서는 어디로도 전이 불가하다", () => {
      expect(canTransitionWorkStatus(WorkStatus.COMPLETED, WorkStatus.REGISTERED)).toBe(false);
      expect(canTransitionWorkStatus(WorkStatus.COMPLETED, WorkStatus.TRANSLATING)).toBe(false);
    });

    it("REGISTERED에서 바로 TRANSLATING으로 전이 불가하다", () => {
      expect(canTransitionWorkStatus(WorkStatus.REGISTERED, WorkStatus.TRANSLATING)).toBe(false);
    });

    it("PENDING에서 바로 COMPLETED로 전이 불가하다", () => {
      expect(canTransitionWorkStatus(WorkStatus.REGISTERED, WorkStatus.COMPLETED)).toBe(false);
    });
  });
});
