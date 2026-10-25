import { uniqueEmail } from "./fixtures/demo";
import { expect, latestEmailCode, test } from "./fixtures/test";

test("a guest signs up with an emailed code and lands on their customer home", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("signup");
  const password = "a-strong-e2e-password";

  await page.goto("/register");
  await page.getByLabel("Your name").fill("Kavya Raman");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/Create a password/).fill(password);
  await page.getByRole("button", { name: "Continue with email" }).click();

  await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
  // NODE_ENV=test never returns the code in the API response, so the code is
  // read from the mock outbox the way a person reads their inbox.
  await expect(page.getByText("Local mock code")).toHaveCount(0);
  const code = await latestEmailCode(request, email);

  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify and create account" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("Kavya Raman", { exact: true })).toBeVisible();
  await expect(page.getByText("Customer account")).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore the menu" })).toBeVisible();
});

test("a wrong code keeps the account pending and explains why", async ({ page, request }) => {
  const email = uniqueEmail("wrongcode");

  await page.goto("/register");
  await page.getByLabel("Your name").fill("Imran Sheikh");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/Create a password/).fill("another-e2e-password");
  await page.getByRole("button", { name: "Continue with email" }).click();
  const code = await latestEmailCode(request, email);
  const wrong = code === "000000" ? "111111" : "000000";

  await page.getByLabel("Verification code").fill(wrong);
  await page.getByRole("button", { name: "Verify and create account" }).click();

  await expect(page.locator("p.auth-error[role=alert]")).toBeVisible();
  await expect(page).toHaveURL(/\/register/);
});
