import { vi } from "vitest";

// 모델별 mock 생성 헬퍼
function createModelMock() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    upsert: vi.fn(),
  };
}

export const mockDb = {
  user: createModelMock(),
  work: createModelMock(),
  chapter: createModelMock(),
  glossaryItem: createModelMock(),
  creator: createModelMock(),
  settingBible: createModelMock(),
  activeTranslationJob: createModelMock(),
  translationLog: createModelMock(),
  projectContract: createModelMock(),
  projectListing: createModelMock(),
  editorProfile: createModelMock(),
  chapterSnapshot: createModelMock(),
  chapterActivity: createModelMock(),
  translationJobHistory: createModelMock(),
  $transaction: vi.fn(async (arg: unknown) => {
    // callback 방식: fn(tx) → tx를 mockDb 자체로 전달
    if (typeof arg === "function") {
      return arg(mockDb);
    }
    // 배열 방식: Promise.all
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  }),
};

// dbTransaction mock (콜백 방식)
export const mockDbTransaction = vi.fn(async (fn: (tx: typeof mockDb) => unknown) => {
  return fn(mockDb);
});

/** 모든 mock 초기화 */
export function resetMockDb() {
  const models = [
    "user", "work", "chapter", "glossaryItem", "creator",
    "settingBible", "activeTranslationJob", "translationLog",
    "projectContract", "projectListing", "editorProfile",
    "chapterSnapshot", "chapterActivity", "translationJobHistory",
  ] as const;

  for (const model of models) {
    const m = mockDb[model];
    for (const method of Object.values(m)) {
      (method as ReturnType<typeof vi.fn>).mockReset();
    }
  }
  mockDb.$transaction.mockReset();
  mockDb.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return arg(mockDb);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  });
  mockDbTransaction.mockReset();
  mockDbTransaction.mockImplementation(async (fn: (tx: typeof mockDb) => unknown) => {
    return fn(mockDb);
  });
}
