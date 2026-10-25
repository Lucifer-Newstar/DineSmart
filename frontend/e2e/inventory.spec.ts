import { API_ORIGIN, seedDemoData } from "./fixtures/demo";
import { apiToken, expect, signInAs, test } from "./fixtures/test";

const PONNI_RICE_ID = "710000000000000000000012";

interface IncidentJson {
  id: string;
  type: string;
  status: string;
  severity: string;
  affectedEntity: { type: string; id: string };
}

// The spec changes a seeded stock count; reseeding restores the fixture.
test.afterAll(() => seedDemoData());

test("a manager edits a stock count and the low-stock incident opens", async ({
  page,
  request,
}) => {
  const manager = await apiToken(request, "Manager");
  const openRiceIncidents = async () => {
    const response = await request.get(`${API_ORIGIN}/api/v1/incidents`, {
      headers: { authorization: `Bearer ${manager}` },
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { incidents: IncidentJson[] };
    return body.incidents.filter(
      (incident) =>
        incident.status !== "resolved" &&
        incident.affectedEntity.type === "inventory_item" &&
        incident.affectedEntity.id === PONNI_RICE_ID,
    );
  };
  // Start from a healthy count: the write re-evaluates the rules, which also
  // resolves a rice incident left open by an earlier run.
  const restored = await request.put(`${API_ORIGIN}/api/v1/inventory/${PONNI_RICE_ID}`, {
    headers: { authorization: `Bearer ${manager}` },
    data: { quantity: 12, lowStockThreshold: 8 },
  });
  expect(restored.status()).toBe(200);
  await expect.poll(async () => (await openRiceIncidents()).length).toBe(0);

  await signInAs(page, "Manager");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Inventory" })
    .click();
  await expect(page.getByRole("heading", { name: "Inventory snapshot" })).toBeVisible();

  await page.getByRole("button", { name: "Set stock count for Ponni rice" }).first().click();
  const form = page.getByRole("form", { name: "Adjust stock count for Ponni rice" });
  await form.getByRole("spinbutton", { name: /New on-hand count for Ponni rice/ }).fill("0");
  await form.getByRole("button", { name: "Save count" }).click();
  await expect(page.getByText("Ponni rice stock count saved.")).toBeVisible();

  // The write triggers an immediate incident evaluation for the restaurant.
  await expect.poll(async () => (await openRiceIncidents()).length).toBe(1);
  const [incident] = await openRiceIncidents();
  expect(incident?.severity).toBe("critical");

  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: /^Incidents/ })
    .click();
  await expect(page.getByText("Available inventory is depleted.").first()).toBeVisible();
});

test("a negative count is rejected in the form before anything is saved", async ({ page }) => {
  await signInAs(page, "Manager");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Inventory" })
    .click();
  await page.getByRole("button", { name: "Set stock count for Paneer" }).first().click();
  const form = page.getByRole("form", { name: "Adjust stock count for Paneer" });
  const count = form.getByRole("spinbutton");
  await count.fill("-2");
  await form.getByRole("button", { name: "Save count" }).click();
  // The field's min="0" stops the submit in the browser, so no request is sent.
  expect(await count.evaluate((input: HTMLInputElement) => input.validity.rangeUnderflow)).toBe(
    true,
  );
  await expect(form).toBeVisible();
  await expect(page.getByText("Paneer stock count saved.")).toHaveCount(0);
});
