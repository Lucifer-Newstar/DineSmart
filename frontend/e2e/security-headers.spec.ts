import { expect, signInAs, test } from "./fixtures/test";

test("pages send a Content Security Policy that forbids framing", async ({ page }) => {
  const response = await page.goto("/");
  const policy = response?.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
});

test("the app runs under the policy without a single violation", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`Refused to load ${event.blockedURI} (${event.violatedDirective})`);
    });
  });

  for (const path of ["/", "/menu", "/book", "/login", "/register", "/orders"]) {
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
  }
  // The dashboard opens the WebSocket, the strictest connect-src case.
  await signInAs(page, "Manager");
  await expect(page.getByRole("button", { name: /^Notifications/ })).toBeVisible();
  await expect(page.locator(".connection-pill")).toHaveText("Live", { timeout: 15_000 });

  expect(violations).toEqual([]);
});
