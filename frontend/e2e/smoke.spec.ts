import { expect, test } from "@playwright/test";

test("the API and the frontend are both up", async ({ page, request }) => {
  const health = await request.get("http://127.0.0.1:3001/health");
  expect(health.ok()).toBe(true);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeAttached();
});
