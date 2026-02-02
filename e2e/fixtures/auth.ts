import { test as base, Page } from "@playwright/test";

/**
 * loginAs 헬퍼: API mock으로 인증 상태 시뮬레이션
 */
export async function loginAs(page: Page, role: "author" | "editor" | "admin") {
  const sessions: Record<string, object> = {
    author: {
      user: { id: "author-1", name: "작가님", email: "author@test.com", role: "AUTHOR" },
      expires: "2099-01-01T00:00:00.000Z",
    },
    editor: {
      user: { id: "editor-1", name: "윤문가님", email: "editor@test.com", role: "EDITOR" },
      expires: "2099-01-01T00:00:00.000Z",
    },
    admin: {
      user: { id: "admin-1", name: "관리자", email: "admin@test.com", role: "ADMIN" },
      expires: "2099-01-01T00:00:00.000Z",
    },
  };

  // next-auth 세션 API를 mock
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(sessions[role]),
    })
  );
}

// fixture: authorPage
export const test = base.extend<{
  authorPage: Page;
  editorPage: Page;
}>({
  authorPage: async ({ page }, use) => {
    await loginAs(page, "author");
    await use(page);
  },
  editorPage: async ({ page }, use) => {
    await loginAs(page, "editor");
    await use(page);
  },
});

export { expect } from "@playwright/test";
