import { type APIRequestContext, test as base, expect, type Page } from "@playwright/test";
import { API_ORIGIN, DEMO_ACCOUNTS, DEMO_PASSWORD, type DemoRole } from "./demo";

/** Signs in through the real login form and waits for the role's home view. */
export async function signInAs(page: Page, role: DemoRole, password = DEMO_PASSWORD) {
  const account = DEMO_ACCOUNTS[role];
  await signInWith(page, { ...account, password });
  return account;
}

/** Signs any account in through the login form and waits for its name to show. */
export async function signInWith(
  page: Page,
  account: { email: string; password: string; name: string },
): Promise<void> {
  const { password } = account;
  await page.goto("/login");
  // Role queries skip the hidden copy of a page that a client-side navigation
  // can briefly leave mounted.
  await page.getByRole("textbox", { name: "Email address" }).fill(account.email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await expect(page.getByText(account.name, { exact: true }).first()).toBeVisible();
}

/** Signs in over the API and returns a bearer token for setup and assertions. */
export async function apiToken(
  request: APIRequestContext,
  role: DemoRole,
  password = DEMO_PASSWORD,
): Promise<string> {
  const response = await request.post(`${API_ORIGIN}/api/v1/auth/login`, {
    headers: { origin: "http://localhost:3000" },
    data: { email: DEMO_ACCOUNTS[role].email, password },
  });
  expect(response.status(), `API sign-in for ${role}`).toBe(200);
  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
}

/**
 * Reads the newest six-digit code the mock email transport "sent" to an
 * address. The outbox route exists only outside production.
 */
export async function latestEmailCode(request: APIRequestContext, email: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${API_ORIGIN}/api/v1/testing/outbox?to=${encodeURIComponent(email)}`,
        );
        if (!response.ok()) return undefined;
        const body = (await response.json()) as { messages: { text: string }[] };
        code = body.messages[0]?.text.match(/\b(\d{6})\b/)?.[1];
        return code;
      },
      { message: `an email code for ${email}`, timeout: 10_000 },
    )
    .toMatch(/^\d{6}$/);
  return code as string;
}

/** Creates and verifies a fresh Customer over the API; specs own its password. */
export async function registerCustomer(
  request: APIRequestContext,
  options: { name: string; email: string; password: string },
): Promise<void> {
  const headers = { origin: "http://localhost:3000" };
  const registered = await request.post(`${API_ORIGIN}/api/v1/auth/register`, {
    headers,
    data: options,
  });
  expect(registered.status(), "registration accepted").toBeLessThan(300);
  const code = await latestEmailCode(request, options.email);
  const verified = await request.post(`${API_ORIGIN}/api/v1/auth/otp/verify`, {
    headers,
    data: { email: options.email, code, password: options.password },
  });
  expect(verified.status(), "verification accepted").toBe(200);
}

export const test = base;
export { expect };
