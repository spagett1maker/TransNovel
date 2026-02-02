// 팩토리 함수: 기본값 + overrides 패턴

let _id = 0;
function nextId(prefix = "id") {
  return `${prefix}-${++_id}`;
}

export function resetFactoryId() {
  _id = 0;
}

export function buildUser(overrides: Record<string, unknown> = {}) {
  const id = nextId("user");
  return {
    id,
    name: `사용자 ${id}`,
    email: `${id}@test.com`,
    password: "hashed-password",
    role: "AUTHOR" as const,
    emailVerified: null,
    image: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

export function buildWork(overrides: Record<string, unknown> = {}) {
  const id = nextId("work");
  return {
    id,
    titleKo: `테스트 작품 ${id}`,
    titleOriginal: `Test Work ${id}`,
    publisher: "테스트 출판사",
    ageRating: "ALL" as const,
    status: "REGISTERED" as const,
    synopsis: "이것은 테스트 작품의 줄거리입니다. 열 자 이상이어야 합니다.",
    genres: ["판타지"],
    originalStatus: "ONGOING" as const,
    sourceLanguage: "ZH" as const,
    expectedChapters: 100,
    platformName: null,
    platformUrl: null,
    totalChapters: 0,
    authorId: "author-1",
    editorId: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

export function buildChapter(overrides: Record<string, unknown> = {}) {
  const id = nextId("chapter");
  return {
    id,
    workId: "work-1",
    number: 1,
    title: `제 1화`,
    originalContent: "원문 내용입니다.",
    translatedContent: null,
    editedContent: null,
    status: "PENDING" as const,
    wordCount: 8,
    translationMeta: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}

export function buildGlossaryItem(overrides: Record<string, unknown> = {}) {
  const id = nextId("glossary");
  return {
    id,
    workId: "work-1",
    original: "原文",
    translated: "원문",
    category: null,
    note: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  };
}
