import { DEMO_ACCOUNTS } from "./fixtures/demo";
import { expect, signInAs, test } from "./fixtures/test";

test("a manager sees both signed-in devices and signs the other one out", async ({ browser }) => {
  const laptop = await browser.newContext();
  const phone = await browser.newContext();
  try {
    const phonePage = await phone.newPage();
    await signInAs(phonePage, "Manager");
    const laptopPage = await laptop.newPage();
    await signInAs(laptopPage, "Manager");

    await laptopPage
      .getByRole("navigation", { name: "Workspace" })
      .getByRole("button", { name: /^Settings/ })
      .click();
    const devices = laptopPage.getByRole("article", { name: "Signed-in devices" });
    await expect(devices).toBeVisible();
    await expect(devices.getByText(/^This device · Last active/)).toHaveCount(1);
    await expect(
      devices.getByRole("button", { name: /^Sign out of .+, last active/ }),
    ).not.toHaveCount(0);

    await devices.getByRole("button", { name: "Sign out of all other devices" }).click();
    await expect(laptopPage.getByText(/^Signed out of \d+ other devices?\.$/)).toBeVisible();
    await expect(devices.getByRole("button", { name: /^Sign out of .+, last active/ })).toHaveCount(
      0,
    );

    // The phone's refresh cookie is now revoked: a reload cannot restore its session.
    await phonePage.reload();
    await expect(phonePage.getByRole("link", { name: /sign in/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(phonePage.getByText(DEMO_ACCOUNTS.Manager.name, { exact: true })).toHaveCount(0);

    // The laptop keeps working.
    await laptopPage.reload();
    await expect(laptopPage.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  } finally {
    await laptop.close();
    await phone.close();
  }
});
