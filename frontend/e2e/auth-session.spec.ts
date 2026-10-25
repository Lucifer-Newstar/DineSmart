import { API_ORIGIN, DEMO_ACCOUNTS } from "./fixtures/demo";
import { expect, signInAs, test } from "./fixtures/test";

test("a manager signs in, keeps the session across a reload and signs out", async ({ page }) => {
  await signInAs(page, "Manager");
  await expect(
    page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), Maya/ }),
  ).toBeVisible();

  // The access token lives only in memory; a reload must restore the session
  // from the HttpOnly refresh cookie.
  const refreshed = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/auth/refresh") && response.status() === 200,
  );
  await page.reload();
  await refreshed;
  await expect(page.getByText(DEMO_ACCOUNTS.Manager.name, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  await expect(page.getByText(DEMO_ACCOUNTS.Manager.name, { exact: true })).toHaveCount(0);

  // The revoked refresh cookie cannot restore the session after sign-out.
  await page.reload();
  await expect(page.getByText(DEMO_ACCOUNTS.Manager.name, { exact: true })).toHaveCount(0);
});

test("an expired access token is renewed without signing the user out", async ({ page }) => {
  await signInAs(page, "Manager");

  // Until the client renews its session, every authenticated call to the
  // tables API fails the way an expired token does.
  let renewed = false;
  let forced = 0;
  page.on("response", (response) => {
    if (response.url().endsWith("/api/v1/auth/refresh") && response.status() === 200) {
      renewed = true;
    }
  });
  await page.route("**/api/v1/tables**", async (route) => {
    if (!renewed && route.request().headers().authorization) {
      forced += 1;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "token_expired", message: "Expired." } }),
      });
      return;
    }
    await route.continue();
  });

  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Reservations" })
    .click();

  await expect.poll(() => renewed, { message: "the client renewed its token" }).toBe(true);
  expect(forced).toBeGreaterThan(0);
  await expect(page.getByText(DEMO_ACCOUNTS.Manager.name, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("a wrong password is refused without creating a session", async ({ page, request }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(DEMO_ACCOUNTS.Reception.email);
  await page.getByLabel("Password").fill("not-the-right-password");
  await page.getByRole("button", { name: "Sign in securely" }).click();

  await expect(page.locator("p.auth-error[role=alert]")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  const refresh = await request.post(`${API_ORIGIN}/api/v1/auth/refresh`, {
    headers: { origin: "http://localhost:3000" },
  });
  expect(refresh.status()).toBe(401);
});
