import { API_ORIGIN, DEMO_RESTAURANT_ID } from "./fixtures/demo";
import { apiToken, expect, signInAs, test } from "./fixtures/test";

const LEMON_RICE_ID = "71000000000000000000000f";

test("the kitchen moves a ticket from accepted through preparing to ready", async ({
  page,
  request,
}) => {
  // A customer order that reception has accepted is what reaches the kitchen.
  const customer = await apiToken(request, "Customer");
  const placed = await request.post(`${API_ORIGIN}/api/v1/orders`, {
    headers: { authorization: `Bearer ${customer}` },
    data: {
      restaurantId: DEMO_RESTAURANT_ID,
      // Lemon rice has a required Portion choice since S4-05.
      items: [{ menuItemId: LEMON_RICE_ID, quantity: 2, options: { portion: "regular" } }],
    },
  });
  expect(placed.status()).toBe(201);
  const { order } = (await placed.json()) as { order: { id: string } };
  const reception = await apiToken(request, "Reception");
  const accepted = await request.patch(`${API_ORIGIN}/api/v1/orders/${order.id}/status`, {
    headers: { authorization: `Bearer ${reception}` },
    data: { status: "Accepted" },
  });
  expect(accepted.status()).toBe(200);

  await signInAs(page, "Kitchen Staff");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Kitchen" })
    .click();

  const board = page.getByRole("region", { name: "Kitchen order board" });
  const label = `#${order.id.slice(-6).toUpperCase()}`;
  const column = (title: string) =>
    board.locator(".kitchen-column").filter({ has: page.getByRole("heading", { name: title }) });
  const ticket = (title: string) => column(title).getByRole("article").filter({ hasText: label });

  await expect(ticket("Accepted")).toBeVisible();
  await expect(ticket("Accepted")).toContainText("Curry leaf lemon rice × 2");

  await ticket("Accepted").getByRole("button", { name: "Start preparing" }).click();
  await expect(ticket("Preparing")).toBeVisible();
  await expect(ticket("Accepted")).toHaveCount(0);

  await ticket("Preparing").getByRole("button", { name: "Mark ready" }).click();
  await expect(ticket("Ready")).toBeVisible();
  await expect(ticket("Preparing")).toHaveCount(0);
});
