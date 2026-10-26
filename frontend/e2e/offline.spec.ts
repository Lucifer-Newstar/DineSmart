import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, signInAs, test } from "./fixtures/test";

/** Serious and critical WCAG A/AA findings only, as in a11y.spec.ts. */
async function blocking(page: Page): Promise<string[]> {
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id} on ${violation.nodes[0]?.target.join(" ")}`);
}

test("the app is installable: the manifest and its icons are served", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const response = await request.get(href as string);
  expect(response.status()).toBe(200);
  const manifest = (await response.json()) as {
    name: string;
    start_url: string;
    display: string;
    icons: Array<{ src: string; sizes: string; purpose?: string }>;
  };
  expect(manifest.name).toBe("DineSmart");
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
  expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
});

test("offline, a guest can read the last loaded menu but cannot order", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/menu");
  await expect(page.getByText("LIVE MENU")).toBeVisible();
  // The first visit installs the service worker; the second runs under it and
  // saves the page, its scripts and the menu.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByText("LIVE MENU")).toBeVisible();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("SAVED MENU")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "You are offline." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Madras filter coffee" })).toBeVisible();
  expect(await blocking(page)).toEqual([]);

  const coffee = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Madras filter coffee" }),
  });
  await coffee.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Your bag, 1 item" }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "Ordering is off while offline" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");

  // A page that was never saved shows the offline page instead of a browser error.
  await page.goto("/bookings");
  await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
  expect(await blocking(page)).toEqual([]);

  await context.setOffline(false);
  await page.goto("/menu");
  await expect(page.getByText("LIVE MENU")).toBeVisible();
  await expect(page.getByText("You are offline.")).toHaveCount(0);
  await context.close();
});

test("the workspace shows a banner while the network is down and clears it after", async ({
  page,
  context,
}) => {
  await signInAs(page, "Manager");
  const banner = page.locator(".connection-banner");
  await expect(banner).toHaveCount(0);
  await context.setOffline(true);
  await expect(banner).toContainText("You are offline");
  expect(await blocking(page)).toEqual([]);
  await context.setOffline(false);
  await expect(page.locator(".connection-banner-offline")).toHaveCount(0);
});
