import { API_ORIGIN, uniqueEmail } from "./fixtures/demo";
import { expect, latestEmailCode, registerCustomer, test } from "./fixtures/test";

test("a customer resets a forgotten password; the new one works and the old one fails", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("reset");
  const oldPassword = "the-original-password";
  const newPassword = "a-brand-new-password-26";
  await registerCustomer(request, { name: "Farah Ali", email, password: oldPassword });

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password." })).toBeVisible();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("button", { name: "Send reset code" }).click();

  await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
  const code = await latestEmailCode(request, email);
  await page.getByLabel("Six-digit code").fill(code);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Set new password" }).click();

  await expect(page.getByRole("heading", { name: "Password updated." })).toBeVisible();
  await page.getByRole("link", { name: "Go to sign in" }).click();

  const headers = { origin: "http://localhost:3000" };
  const oldLogin = await request.post(`${API_ORIGIN}/api/v1/auth/login`, {
    headers,
    data: { email, password: oldPassword },
  });
  expect(oldLogin.status()).toBe(401);

  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(newPassword);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByText("Farah Ali", { exact: true })).toBeVisible();
});

test("an unknown email gets the same neutral answer as a real one", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByRole("textbox", { name: "Email address" }).fill(uniqueEmail("nobody"));
  await page.getByRole("button", { name: "Send reset code" }).click();
  // No account enumeration: the flow moves on exactly as it does for a real account.
  await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
});
