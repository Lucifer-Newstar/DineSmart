import { expect, signInAs, test } from "./fixtures/test";

test("the notification panel takes focus, keeps it and returns it to the bell", async ({
  page,
}) => {
  await signInAs(page, "Manager");
  const bell = page.getByRole("button", { name: /^Notifications/ });
  await bell.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();
  await expect(panel.locator(":focus")).toHaveCount(1);
  // Shift+Tab from the first control wraps inside the panel instead of leaving it.
  await page.keyboard.press("Shift+Tab");
  await expect(panel.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();
});

test("the bag dialog traps focus and Escape returns it to the bag button", async ({ page }) => {
  await page.goto("/menu");
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  const bagButton = page.getByRole("button", { name: /bag, \d+ items?$/ }).first();
  await bagButton.focus();
  await page.keyboard.press("Enter");
  const bag = page.getByRole("dialog", { name: /Your bag/ });
  await expect(bag).toBeVisible();
  await expect(bag.locator(":focus")).toHaveCount(1);
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press("Tab");
    await expect(bag.locator(":focus")).toHaveCount(1);
  }
  await page.keyboard.press("Escape");
  await expect(bag).toBeHidden();
  await expect(bagButton).toBeFocused();
});

test("menu categories follow the tabs pattern: one tab stop, arrows move", async ({ page }) => {
  await page.goto("/menu");
  const tabs = page.getByRole("tablist", { name: "Menu categories" }).getByRole("tab");
  const first = tabs.first();
  await first.focus();
  await expect(first).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  const second = tabs.nth(1);
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(first).toHaveAttribute("tabindex", "-1");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName(await second.innerText());
  await page.keyboard.press("End");
  await expect(tabs.last()).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(first).toBeFocused();
});
