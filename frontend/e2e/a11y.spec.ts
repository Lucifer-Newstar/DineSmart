import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { uniqueEmail } from "./fixtures/demo";
import { expect, signInAs, test } from "./fixtures/test";

/** WCAG 2.0, 2.1 and 2.2 at levels A and AA. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

/** The S4-03 gate: no serious or critical violation on any scanned page. */
const BLOCKING = new Set(["serious", "critical"]);

const PUBLIC_PAGES = ["/", "/login", "/register", "/forgot-password", "/menu", "/book", "/orders"];

const DASHBOARD_SECTIONS = [
  "Overview",
  "Orders",
  "Kitchen",
  "Reservations",
  "Inventory",
  "Incidents",
  "Insights",
  "Analytics",
  "Settings",
];

/**
 * Scans the page, attaches the full axe result and returns one line per
 * blocking violation so a failure names the page, the rule and the elements.
 */
async function blockingViolations(page: Page, name: string, testInfo: TestInfo) {
  // Let entrance animations finish so colours are measured at rest.
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  await testInfo.attach(`axe-${name.replaceAll(/[^a-z0-9]+/gi, "-")}.json`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: "application/json",
  });
  return results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ""))
    .map(
      (violation) =>
        `${name}: ${violation.id} (${violation.impact}) on ${violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(" "))
          .join(
            ", ",
          )}${violation.nodes.length > 3 ? ` and ${violation.nodes.length - 3} more` : ""}`,
    );
}

test("public pages have no serious or critical axe violations", async ({ page }, testInfo) => {
  const found: string[] = [];
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
    found.push(...(await blockingViolations(page, path, testInfo)));
  }

  // The open bag dialog and the sign-up code step are states, not routes.
  await page.goto("/menu");
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await page
    .getByRole("button", { name: /bag, \d+ items?$/ })
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: /Your bag/ })).toBeVisible();
  found.push(...(await blockingViolations(page, "/menu (bag open)", testInfo)));

  await page.goto("/register");
  await page.getByRole("textbox", { name: "Your name" }).fill("Axe Check");
  await page.getByRole("textbox", { name: "Email address" }).fill(uniqueEmail("axe"));
  await page.getByRole("textbox", { name: /Create a password/ }).fill("axe check password");
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page.getByRole("textbox", { name: /code/i })).toBeVisible();
  found.push(...(await blockingViolations(page, "/register (code step)", testInfo)));

  expect(found, found.join("\n")).toEqual([]);
});

test("every dashboard section has no serious or critical axe violations", async ({
  page,
}, testInfo) => {
  await signInAs(page, "Manager");
  const navigation = page.getByRole("navigation", { name: "Workspace" });
  const found: string[] = [];
  for (const section of DASHBOARD_SECTIONS) {
    await navigation.getByRole("button", { name: new RegExp(`^${section}`) }).click();
    found.push(...(await blockingViolations(page, `dashboard/${section}`, testInfo)));
  }
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();
  found.push(...(await blockingViolations(page, "dashboard (notifications open)", testInfo)));
  expect(found, found.join("\n")).toEqual([]);
});

test("the kitchen board has no serious or critical axe violations", async ({ page }, testInfo) => {
  await signInAs(page, "Kitchen Staff");
  const found = await blockingViolations(page, "kitchen/Overview", testInfo);
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: /^Kitchen/ })
    .click();
  found.push(...(await blockingViolations(page, "kitchen/Kitchen", testInfo)));
  expect(found, found.join("\n")).toEqual([]);
});

test("the customer portal has no serious or critical axe violations", async ({
  page,
}, testInfo) => {
  await signInAs(page, "Customer");
  const found = await blockingViolations(page, "customer-portal", testInfo);
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Your orders, in one place." })).toBeVisible();
  found.push(...(await blockingViolations(page, "/orders (signed in)", testInfo)));
  expect(found, found.join("\n")).toEqual([]);
});
