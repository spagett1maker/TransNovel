import { describe, it, expect } from "vitest";
import {
  canTransitionStatus,
  canAccessWork,
  canEditWork,
  canTranslate,
  canReviewChapter,
  canAssignEditor,
  canEditChapterContent,
  canApplyTrackChanges,
  getAvailableNextStatuses,
  getRoleDisplayName,
  getStatusDisplayName,
} from "../permissions";

// Prisma enum 값을 직접 사용 (빌드 없이 테스트 가능하도록)
const UserRole = { AUTHOR: "AUTHOR", EDITOR: "EDITOR", ADMIN: "ADMIN" } as const;
const ChapterStatus = {
  PENDING: "PENDING",
  TRANSLATING: "TRANSLATING",
  TRANSLATED: "TRANSLATED",
  REVIEWING: "REVIEWING",
  EDITED: "EDITED",
  APPROVED: "APPROVED",
} as const;

// ─── canTransitionStatus ─────────────────────────────────
describe("canTransitionStatus", () => {
  describe("ADMIN", () => {
    it("모든 상태 전이를 허용한다", () => {
      expect(canTransitionStatus(UserRole.ADMIN, ChapterStatus.PENDING, ChapterStatus.TRANSLATING)).toBe(true);
      expect(canTransitionStatus(UserRole.ADMIN, ChapterStatus.TRANSLATED, ChapterStatus.REVIEWING)).toBe(true);
      expect(canTransitionStatus(UserRole.ADMIN, ChapterStatus.EDITED, ChapterStatus.APPROVED)).toBe(true);
    });
  });

  describe("AUTHOR", () => {
    it("PENDING → TRANSLATING 전이를 허용한다", () => {
      expect(canTransitionStatus(UserRole.AUTHOR, ChapterStatus.PENDING, ChapterStatus.TRANSLATING)).toBe(true);
    });

    it("EDITED → APPROVED 전이를 허용한다", () => {
      expect(canTransitionStatus(UserRole.AUTHOR, ChapterStatus.EDITED, ChapterStatus.APPROVED)).toBe(true);
    });

    it("TRANSLATED → REVIEWING 전이를 불허한다 (AUTHOR의 from에 TRANSLATED 없음)", () => {
      expect(canTransitionStatus(UserRole.AUTHOR, ChapterStatus.TRANSLATED, ChapterStatus.REVIEWING)).toBe(false);
    });

    it("REVIEWING → EDITED 전이를 불허한다 (EDITOR만 가능)", () => {
      expect(canTransitionStatus(UserRole.AUTHOR, ChapterStatus.REVIEWING, ChapterStatus.EDITED)).toBe(false);
    });
  });

  describe("EDITOR", () => {
    it("TRANSLATED → REVIEWING 전이를 허용한다", () => {
      expect(canTransitionStatus(UserRole.EDITOR, ChapterStatus.TRANSLATED, ChapterStatus.REVIEWING)).toBe(true);
    });

    it("REVIEWING → EDITED 전이를 허용한다", () => {
      expect(canTransitionStatus(UserRole.EDITOR, ChapterStatus.REVIEWING, ChapterStatus.EDITED)).toBe(true);
    });

    it("PENDING → TRANSLATING 전이를 불허한다 (AUTHOR만 가능)", () => {
      expect(canTransitionStatus(UserRole.EDITOR, ChapterStatus.PENDING, ChapterStatus.TRANSLATING)).toBe(false);
    });

    it("EDITED → APPROVED 전이를 불허한다 (AUTHOR만 가능)", () => {
      expect(canTransitionStatus(UserRole.EDITOR, ChapterStatus.EDITED, ChapterStatus.APPROVED)).toBe(false);
    });
  });

  it("유효하지 않은 상태 전이를 거부한다", () => {
    // PENDING에서 바로 APPROVED로 갈 수 없음
    expect(canTransitionStatus(UserRole.AUTHOR, ChapterStatus.PENDING, ChapterStatus.APPROVED)).toBe(false);
    // APPROVED에서는 어디로도 갈 수 없음 (최종 상태)
    expect(canTransitionStatus(UserRole.ADMIN, ChapterStatus.APPROVED, ChapterStatus.PENDING)).toBe(true);
    // ADMIN은 항상 true이므로 AUTHOR로 테스트
    expect(canTransitionStatus(UserRole.AUTHOR, ChapterStatus.APPROVED, ChapterStatus.PENDING)).toBe(false);
  });
});

// ─── canAccessWork ───────────────────────────────────────
describe("canAccessWork", () => {
  const work = { authorId: "author-1", editorId: "editor-1" };

  it("ADMIN은 모든 작품에 접근 가능하다", () => {
    expect(canAccessWork("random-user", UserRole.ADMIN, work)).toBe(true);
  });

  it("AUTHOR는 자신의 작품에만 접근 가능하다", () => {
    expect(canAccessWork("author-1", UserRole.AUTHOR, work)).toBe(true);
    expect(canAccessWork("author-2", UserRole.AUTHOR, work)).toBe(false);
  });

  it("EDITOR는 할당된 작품에만 접근 가능하다", () => {
    expect(canAccessWork("editor-1", UserRole.EDITOR, work)).toBe(true);
    expect(canAccessWork("editor-2", UserRole.EDITOR, work)).toBe(false);
  });

  it("EDITOR는 editorId가 null인 작품에 접근 불가하다", () => {
    expect(canAccessWork("editor-1", UserRole.EDITOR, { authorId: "a", editorId: null })).toBe(false);
  });
});

// ─── canEditWork ─────────────────────────────────────────
describe("canEditWork", () => {
  const work = { authorId: "author-1" };

  it("ADMIN은 모든 작품을 수정 가능하다", () => {
    expect(canEditWork("anyone", UserRole.ADMIN, work)).toBe(true);
  });

  it("AUTHOR는 자신의 작품만 수정 가능하다", () => {
    expect(canEditWork("author-1", UserRole.AUTHOR, work)).toBe(true);
    expect(canEditWork("author-2", UserRole.AUTHOR, work)).toBe(false);
  });

  it("EDITOR는 작품을 수정할 수 없다", () => {
    expect(canEditWork("editor-1", UserRole.EDITOR, work)).toBe(false);
  });
});

// ─── canTranslate ────────────────────────────────────────
describe("canTranslate", () => {
  const work = { authorId: "author-1" };

  it("ADMIN은 번역 가능하다", () => {
    expect(canTranslate("anyone", UserRole.ADMIN, work)).toBe(true);
  });

  it("AUTHOR는 자신의 작품만 번역 가능하다", () => {
    expect(canTranslate("author-1", UserRole.AUTHOR, work)).toBe(true);
    expect(canTranslate("author-2", UserRole.AUTHOR, work)).toBe(false);
  });

  it("EDITOR는 번역할 수 없다", () => {
    expect(canTranslate("editor-1", UserRole.EDITOR, work)).toBe(false);
  });
});

// ─── canReviewChapter ────────────────────────────────────
describe("canReviewChapter", () => {
  const work = { editorId: "editor-1" };

  it("ADMIN은 검토 가능하다", () => {
    expect(canReviewChapter("anyone", UserRole.ADMIN, work)).toBe(true);
  });

  it("EDITOR는 할당된 작품만 검토 가능하다", () => {
    expect(canReviewChapter("editor-1", UserRole.EDITOR, work)).toBe(true);
    expect(canReviewChapter("editor-2", UserRole.EDITOR, work)).toBe(false);
  });

  it("AUTHOR는 검토할 수 없다", () => {
    expect(canReviewChapter("author-1", UserRole.AUTHOR, work)).toBe(false);
  });
});

// ─── canAssignEditor ─────────────────────────────────────
describe("canAssignEditor", () => {
  const work = { authorId: "author-1" };

  it("ADMIN은 윤문가를 할당할 수 있다", () => {
    expect(canAssignEditor("anyone", UserRole.ADMIN, work)).toBe(true);
  });

  it("AUTHOR는 자신의 작품에 윤문가를 할당할 수 있다", () => {
    expect(canAssignEditor("author-1", UserRole.AUTHOR, work)).toBe(true);
    expect(canAssignEditor("author-2", UserRole.AUTHOR, work)).toBe(false);
  });

  it("EDITOR는 윤문가를 할당할 수 없다", () => {
    expect(canAssignEditor("editor-1", UserRole.EDITOR, work)).toBe(false);
  });
});

// ─── canEditChapterContent ───────────────────────────────
describe("canEditChapterContent", () => {
  it("ADMIN과 EDITOR는 모든 상태에서 편집 가능하다", () => {
    for (const status of Object.values(ChapterStatus)) {
      expect(canEditChapterContent(UserRole.ADMIN, status)).toBe(true);
      expect(canEditChapterContent(UserRole.EDITOR, status)).toBe(true);
    }
  });

  it("AUTHOR는 PENDING, TRANSLATING 상태에서만 편집 가능하다", () => {
    expect(canEditChapterContent(UserRole.AUTHOR, ChapterStatus.PENDING)).toBe(true);
    expect(canEditChapterContent(UserRole.AUTHOR, ChapterStatus.TRANSLATING)).toBe(true);
  });

  it("AUTHOR는 번역 완료 이후 상태에서 편집 불가하다", () => {
    expect(canEditChapterContent(UserRole.AUTHOR, ChapterStatus.TRANSLATED)).toBe(false);
    expect(canEditChapterContent(UserRole.AUTHOR, ChapterStatus.REVIEWING)).toBe(false);
    expect(canEditChapterContent(UserRole.AUTHOR, ChapterStatus.EDITED)).toBe(false);
    expect(canEditChapterContent(UserRole.AUTHOR, ChapterStatus.APPROVED)).toBe(false);
  });
});

// ─── canApplyTrackChanges ────────────────────────────────
describe("canApplyTrackChanges", () => {
  it("ADMIN은 항상 수정 추적을 적용할 수 있다", () => {
    expect(canApplyTrackChanges(UserRole.ADMIN, ChapterStatus.PENDING)).toBe(true);
  });

  it("AUTHOR는 EDITED/REVIEWING 상태에서만 적용 가능하다", () => {
    expect(canApplyTrackChanges(UserRole.AUTHOR, ChapterStatus.EDITED)).toBe(true);
    expect(canApplyTrackChanges(UserRole.AUTHOR, ChapterStatus.REVIEWING)).toBe(true);
    expect(canApplyTrackChanges(UserRole.AUTHOR, ChapterStatus.PENDING)).toBe(false);
    expect(canApplyTrackChanges(UserRole.AUTHOR, ChapterStatus.TRANSLATED)).toBe(false);
  });

  it("EDITOR는 적용할 수 없다", () => {
    expect(canApplyTrackChanges(UserRole.EDITOR, ChapterStatus.EDITED)).toBe(false);
  });
});

// ─── getAvailableNextStatuses ────────────────────────────
describe("getAvailableNextStatuses", () => {
  it("PENDING에서 ADMIN은 TRANSLATING으로 전이 가능하다", () => {
    expect(getAvailableNextStatuses(UserRole.ADMIN, ChapterStatus.PENDING)).toEqual([ChapterStatus.TRANSLATING]);
  });

  it("APPROVED에서는 다음 상태가 없다 (최종 상태)", () => {
    expect(getAvailableNextStatuses(UserRole.ADMIN, ChapterStatus.APPROVED)).toEqual([]);
  });

  it("EDITOR의 TRANSLATED에서 가능한 다음 상태를 반환한다", () => {
    const result = getAvailableNextStatuses(UserRole.EDITOR, ChapterStatus.TRANSLATED);
    expect(result).toContain(ChapterStatus.REVIEWING);
  });
});

// ─── Display Name helpers ────────────────────────────────
describe("getRoleDisplayName", () => {
  it("올바른 한국어 역할명을 반환한다", () => {
    expect(getRoleDisplayName(UserRole.AUTHOR)).toBe("작가");
    expect(getRoleDisplayName(UserRole.EDITOR)).toBe("윤문가");
    expect(getRoleDisplayName(UserRole.ADMIN)).toBe("관리자");
  });
});

describe("getStatusDisplayName", () => {
  it("올바른 한국어 상태명을 반환한다", () => {
    expect(getStatusDisplayName(ChapterStatus.PENDING)).toBe("대기");
    expect(getStatusDisplayName(ChapterStatus.TRANSLATING)).toBe("번역중");
    expect(getStatusDisplayName(ChapterStatus.TRANSLATED)).toBe("번역완료");
    expect(getStatusDisplayName(ChapterStatus.REVIEWING)).toBe("윤문중");
    expect(getStatusDisplayName(ChapterStatus.EDITED)).toBe("윤문완료");
    expect(getStatusDisplayName(ChapterStatus.APPROVED)).toBe("작가승인");
  });
});
