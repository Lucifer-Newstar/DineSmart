import { API_ORIGIN, DEMO_ACCOUNTS, type DemoRole } from "./fixtures/demo";
import { apiToken, expect, test } from "./fixtures/test";

test("the API and the frontend are both up", async ({ page, request }) => {
  const health = await request.get(`${API_ORIGIN}/health`);
  expect(health.ok()).toBe(true);

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeAttached();
});

test("every seeded demo account signs in with the e2e password", async ({ request }) => {
  for (const role of Object.keys(DEMO_ACCOUNTS) as DemoRole[]) {
    const token = await apiToken(request, role);
    expect(token.split(".")).toHaveLength(3);
  }
});
