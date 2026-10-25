import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect, signInAs, test } from "./fixtures/test";

/** WCAG 2.0, 2.1 and 2.2 at levels A and AA. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];

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

interface PageReport {
  page: string;
  violations: Array<{ id: string; impact: string | null; nodes: number; help: string }>;
}

async function scan(page: Page, name: string, testInfo: TestInfo): Promise<PageReport> {
  // Let entrance animations finish so colours are measured at rest.
  await page.waitForTimeout(400);
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const report: PageReport = {
    page: name,
    violations: results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      nodes: violation.nodes.length,
      help: violation.help,
    })),
  };
  await testInfo.attach(`axe-${name.replaceAll(/[^a-z0-9]+/gi, "-")}.json`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: "application/json",
  });
  return report;
}

function summarise(reports: PageReport[]): string {
  return reports
    .map(
      (report) =>
        `${report.page}: ${
          report.violations.length
            ? report.violations
                .map((violation) => `${violation.id} (${violation.impact}, ${violation.nodes})`)
                .join(", ")
            : "no violations"
        }`,
    )
    .join("\n");
}

test("axe baseline for every public page", async ({ page }, testInfo) => {
  const reports: PageReport[] = [];
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
    reports.push(await scan(page, path, testInfo));
  }
  console.log(summarise(reports));
});

test("axe baseline for every dashboard section", async ({ page }, testInfo) => {
  await signInAs(page, "Manager");
  const navigation = page.getByRole("navigation", { name: "Workspace" });
  const reports: PageReport[] = [];
  for (const section of DASHBOARD_SECTIONS) {
    await navigation.getByRole("button", { name: new RegExp(`^${section}`) }).click();
    reports.push(await scan(page, `dashboard/${section}`, testInfo));
  }
  console.log(summarise(reports));
});

test("axe baseline for the customer portal", async ({ page }, testInfo) => {
  await signInAs(page, "Customer");
  const reports = [await scan(page, "customer-portal", testInfo)];
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Your orders, in one place." })).toBeVisible();
  reports.push(await scan(page, "/orders (signed in)", testInfo));
  console.log(summarise(reports));
});
