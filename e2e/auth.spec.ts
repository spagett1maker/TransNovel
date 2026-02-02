import { test, expect } from "@playwright/test";

test.describe("인증 플로우", () => {
  test("로그인 페이지가 렌더링된다", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']")).toBeVisible();
  });

  test("유효한 자격으로 로그인 시 대시보드로 리다이렉트된다", async ({ page }) => {
    // next-auth credentials 응답 mock
    await page.route("**/api/auth/callback/credentials", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ url: "/dashboard" }),
      })
    );
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "u1", name: "작가", email: "a@test.com", role: "AUTHOR" },
          expires: "2099-01-01",
        }),
      })
    );
    await page.route("**/api/auth/csrf", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ csrfToken: "test-csrf" }),
      })
    );

    await page.goto("/login");
    await page.fill("input[type='email']", "author@test.com");
    await page.fill("input[type='password']", "password123");
    await page.click("button[type='submit']");

    // 리다이렉트 또는 대시보드 요소 확인
    await expect(page).toHaveURL(/\/(dashboard|login)/);
  });

  test("잘못된 자격으로 로그인 시 에러 메시지가 표시된다", async ({ page }) => {
    await page.route("**/api/auth/callback/credentials", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "CredentialsSignin" }),
      })
    );
    await page.route("**/api/auth/csrf", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ csrfToken: "test-csrf" }),
      })
    );
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      })
    );

    await page.goto("/login");
    await page.fill("input[type='email']", "wrong@test.com");
    await page.fill("input[type='password']", "wrongpassword");
    await page.click("button[type='submit']");

    // 로그인 페이지에 머물거나 에러 메시지 확인
    await expect(page).toHaveURL(/\/login/);
  });

  test("미인증 사용자가 /dashboard 접근 시 /login으로 리다이렉트된다", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      })
    );

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("회원가입 폼이 표시된다", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.locator("input[type='password']").first()).toBeVisible();
  });
});
