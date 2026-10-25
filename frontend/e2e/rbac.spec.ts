import { API_ORIGIN, type DemoRole } from "./fixtures/demo";
import { apiToken, expect, signInAs, test } from "./fixtures/test";

const ALL_SECTIONS = [
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

const VISIBLE_SECTIONS: Record<Exclude<DemoRole, "Customer">, string[]> = {
  Reception: ["Overview", "Orders", "Reservations", "Inventory", "Settings"],
  "Kitchen Staff": ["Overview", "Orders", "Kitchen", "Inventory", "Settings"],
  Manager: ALL_SECTIONS,
  Administrator: ALL_SECTIONS,
};

for (const [role, visible] of Object.entries(VISIBLE_SECTIONS) as [
  Exclude<DemoRole, "Customer">,
  string[],
][]) {
  test(`${role} sees only the dashboard sections the role allows`, async ({ page }) => {
    await signInAs(page, role);
    const navigation = page.getByRole("navigation", { name: "Workspace" });
    await expect(navigation).toBeVisible();

    const labels = (await navigation.getByRole("button").allTextContents()).map(
      (text) => ALL_SECTIONS.find((section) => text.trim().startsWith(section)) ?? text.trim(),
    );
    expect(labels).toEqual(visible);
  });
}

test("a customer gets the guest portal instead of the staff workspace", async ({ page }) => {
  await signInAs(page, "Customer");
  await expect(page.getByText("Customer account", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Workspace" })).toHaveCount(0);

  // Opening the workspace URL directly still shows the customer portal.
  await page.goto("/dashboard");
  await expect(page.getByText("Customer account", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Workspace" })).toHaveCount(0);
});

test("signed-out visitors are sent to sign in for account pages", async ({ page }) => {
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Sign in to see your orders" })).toBeVisible();
  await page
    .getByRole("link", { name: /sign in/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/login\?next=%2Forders/);
});

test("the API refuses each role the data its dashboard hides", async ({ request }) => {
  const cases: Array<{ role: DemoRole; path: string; status: number }> = [
    { role: "Kitchen Staff", path: "/api/v1/analytics", status: 403 },
    { role: "Kitchen Staff", path: "/api/v1/reservations", status: 403 },
    { role: "Reception", path: "/api/v1/incidents", status: 403 },
    { role: "Reception", path: "/api/v1/staff", status: 403 },
    { role: "Customer", path: "/api/v1/inventory", status: 403 },
    { role: "Customer", path: "/api/v1/orders", status: 403 },
    { role: "Manager", path: "/api/v1/analytics", status: 200 },
    { role: "Administrator", path: "/api/v1/staff", status: 200 },
  ];
  for (const { role, path, status } of cases) {
    const token = await apiToken(request, role);
    const response = await request.get(`${API_ORIGIN}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status(), `${role} GET ${path}`).toBe(status);
  }
});
