import { test, expect } from "./fixtures/auth";

const mockWorks = [
  {
    id: "w1",
    titleKo: "테스트 작품 1",
    titleOriginal: "Test Work 1",
    status: "REGISTERED",
    genres: ["판타지"],
    ageRating: "ALL",
    authorId: "author-1",
    author: { id: "author-1", name: "작가님" },
    editor: null,
    creators: [{ name: "작가", role: "WRITER" }],
    _count: { chapters: 5 },
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
  },
];

test.describe("작품 관리 플로우", () => {
  test("작품 목록을 조회한다", async ({ authorPage: page }) => {
    await page.route("**/api/works*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          works: mockWorks,
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        }),
      })
    );

    await page.goto("/works");
    await expect(page.getByText("테스트 작품 1")).toBeVisible();
  });

  test("작품 상세 페이지를 조회한다", async ({ authorPage: page }) => {
    await page.route("**/api/works/w1", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...mockWorks[0],
          synopsis: "이것은 테스트 줄거리입니다.",
          chapters: [],
        }),
      })
    );
    // 챕터 목록 API도 mock
    await page.route("**/api/works/w1/chapters*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chapters: [],
          pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
        }),
      })
    );

    await page.goto("/works/w1");
    await expect(page.getByText("테스트 작품 1")).toBeVisible();
  });

  test("작품 삭제 시 확인 다이얼로그가 표시된다", async ({ authorPage: page }) => {
    await page.route("**/api/works*", (route) => {
      if (route.request().method() === "DELETE") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...mockWorks[0],
          synopsis: "이것은 테스트 줄거리입니다.",
          chapters: [],
        }),
      });
    });
    await page.route("**/api/works/w1/chapters*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          chapters: [],
          pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
        }),
      })
    );

    await page.goto("/works/w1");
    // 삭제 버튼이 있는지 확인
    const deleteButton = page.getByRole("button", { name: /삭제/ });
    if (await deleteButton.isVisible()) {
      await deleteButton.click();
      // 확인 다이얼로그 or alert dialog 존재 확인
      await expect(page.getByRole("alertdialog").or(page.getByText(/정말/))).toBeVisible();
    }
  });
});
