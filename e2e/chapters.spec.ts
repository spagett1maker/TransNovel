import { test, expect } from "./fixtures/auth";

const mockChapters = [
  {
    id: "ch1",
    number: 1,
    title: "제 1화",
    status: "PENDING",
    wordCount: 1500,
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
  },
  {
    id: "ch2",
    number: 2,
    title: "제 2화",
    status: "TRANSLATED",
    wordCount: 2000,
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
  },
  {
    id: "ch3",
    number: 3,
    title: "제 3화",
    status: "APPROVED",
    wordCount: 1800,
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
  },
];

test.describe("챕터 플로우", () => {
  test.beforeEach(async ({ authorPage: page }) => {
    // 작품 상세 API mock
    await page.route("**/api/works/w1", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "w1",
          titleKo: "테스트 작품",
          titleOriginal: "Test Work",
          status: "BIBLE_CONFIRMED",
          authorId: "author-1",
          author: { id: "author-1", name: "작가님" },
          editor: null,
          creators: [],
          chapters: mockChapters,
          _count: { chapters: 3 },
        }),
      })
    );
  });

  test("회차 목록을 조회한다", async ({ authorPage: page }) => {
    await page.route("**/api/works/w1/chapters*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chapters: mockChapters,
          pagination: { page: 1, limit: 50, total: 3, totalPages: 1, hasNext: false, hasPrev: false },
        }),
      })
    );

    await page.goto("/works/w1/chapters");
    await expect(page.getByText("제 1화")).toBeVisible();
    await expect(page.getByText("제 2화")).toBeVisible();
    await expect(page.getByText("제 3화")).toBeVisible();
  });

  test("회차 상세 콘텐츠를 표시한다", async ({ authorPage: page }) => {
    await page.route("**/api/works/w1/chapters/1", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "ch1",
          number: 1,
          title: "제 1화",
          originalContent: "원문 내용입니다.",
          translatedContent: null,
          editedContent: null,
          status: "PENDING",
          wordCount: 8,
        }),
      })
    );

    await page.goto("/works/w1/chapters/1");
    // 원문 또는 제목이 표시되는지 확인
    await expect(page.getByText("제 1화").or(page.getByText("원문"))).toBeVisible();
  });

  test("상태 뱃지가 표시된다", async ({ authorPage: page }) => {
    await page.route("**/api/works/w1/chapters*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chapters: mockChapters,
          pagination: { page: 1, limit: 50, total: 3, totalPages: 1, hasNext: false, hasPrev: false },
        }),
      })
    );

    await page.goto("/works/w1/chapters");

    // 상태 뱃지 텍스트 (한국어 라벨 또는 영문 상태) 확인
    const statusTexts = ["대기", "번역완료", "승인", "PENDING", "TRANSLATED", "APPROVED"];
    let foundStatus = false;
    for (const text of statusTexts) {
      const el = page.getByText(text, { exact: false });
      if (await el.first().isVisible().catch(() => false)) {
        foundStatus = true;
        break;
      }
    }
    expect(foundStatus).toBe(true);
  });
});
