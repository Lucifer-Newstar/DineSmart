import { readFile } from "node:fs/promises";
import { API_ORIGIN, uniqueEmail } from "./fixtures/demo";
import { expect, registerCustomer, signInWith, test } from "./fixtures/test";

test("a guest edits their profile, downloads their data, changes password and deletes the account", async ({
  page,
  request,
}) => {
  const account = {
    name: `Meghna ${Date.now().toString(36).toUpperCase()}`,
    email: uniqueEmail("meghna"),
    password: "account-flow-password",
  };
  const newPassword = "a fresh account password";
  await registerCustomer(request, account);
  await signInWith(page, account);

  await page.getByRole("link", { name: "Account settings" }).click();
  await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
  await expect(page.getByText(account.email)).toBeVisible();

  // Profile and contact preferences.
  const renamed = `${account.name} R`;
  await page.getByRole("textbox", { name: "Name" }).fill(renamed);
  await page.getByRole("checkbox", { name: /Occasional offers/ }).check();
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(renamed);
  await expect(page.getByRole("checkbox", { name: /Occasional offers/ })).toBeChecked();

  // Export: a JSON file with this account in it.
  const downloadStarted = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my data" }).click();
  const download = await downloadStarted;
  expect(download.suggestedFilename()).toMatch(/^dinesmart-account-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(await readFile(await download.path(), "utf8")) as {
    account: { name: string; email: string; contactPreferences: { offers: boolean } };
    reservations: unknown[];
  };
  expect(exported.account.email).toBe(account.email);
  expect(exported.account.name).toBe(renamed);
  expect(exported.account.contactPreferences.offers).toBe(true);

  // Password change: a mismatch is caught in the form, then the real change works.
  await page.getByLabel("Current password").fill(account.password);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill("something else entirely");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("The passwords do not match.")).toBeVisible();
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(
    page.getByText("Password changed. Other devices have been signed out."),
  ).toBeVisible();
  const login = (password: string) =>
    request.post(`${API_ORIGIN}/api/v1/auth/login`, {
      headers: { origin: "http://localhost:3000" },
      data: { email: account.email, password },
    });
  expect((await login(account.password)).status()).toBe(401);
  expect((await login(newPassword)).status()).toBe(200);

  // Delete: the button stays disabled until DELETE and the password are entered.
  await page.getByRole("button", { name: "Delete account…" }).click();
  const confirm = page.getByRole("button", { name: "Delete my account" });
  await page.getByLabel("Type DELETE to confirm").fill("delete");
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(confirm).toBeDisabled();
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(newPassword);
  await confirm.click();
  await page.waitForURL((url) => url.pathname === "/");
  expect((await login(newPassword)).status()).toBe(401);

  // The same email can register again as a new account.
  await registerCustomer(request, { ...account, password: newPassword });
});
