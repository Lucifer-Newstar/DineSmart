import { API_ORIGIN, uniqueEmail } from "./fixtures/demo";
import { apiToken, expect, registerCustomer, signInAs, signInWith, test } from "./fixtures/test";

interface QueueTicket {
  id: string;
  tableNumber?: string;
  items: Array<{ id: string; name: string; notes?: string; preparationStatus: string }>;
}

test("a guest scans a table card, orders with a request and watches it reach Ready live", async ({
  browser,
  page,
  request,
}) => {
  // The manager prints the cards; table 04's card carries a signed link.
  await signInAs(page, "Manager");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Reservations" })
    .click();
  await page.getByRole("button", { name: "Show QR cards" }).click();
  await expect(page.getByRole("img", { name: "QR code for table 04" })).toBeVisible();
  const manager = await apiToken(request, "Manager");
  const cards = await request.get(`${API_ORIGIN}/api/v1/tables/qr`, {
    headers: { authorization: `Bearer ${manager}` },
  });
  expect(cards.status()).toBe(200);
  const { tables } = (await cards.json()) as {
    tables: Array<{ tableNumber: string; token: string }>;
  };
  const token = tables.find((table) => table.tableNumber === "04")?.token;
  expect(token).toBeTruthy();

  // A tampered link is refused.
  const tampered = await request.get(
    `${API_ORIGIN}/api/v1/tables/qr/resolve?token=${encodeURIComponent(`${token?.slice(0, -2)}xx`)}`,
  );
  expect(tampered.status()).toBe(400);

  // The guest opens the link on their own phone.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const account = {
    name: `Ishaan ${Date.now().toString(36).toUpperCase()}`,
    email: uniqueEmail("ishaan"),
    password: "qr-order-flow-password",
  };
  await registerCustomer(request, account);
  await signInWith(guest, account);
  await guest.goto(`/menu?table=${encodeURIComponent(token as string)}`);
  await expect(guest.getByText("Dine-in · Table 04")).toBeVisible();

  const coffee = guest.getByRole("article").filter({
    has: guest.getByRole("heading", { name: "Madras filter coffee" }),
  });
  await coffee.getByRole("button", { name: "Add", exact: true }).click();
  await guest.getByRole("button", { name: "Your bag, 1 item" }).click();
  const bag = guest.getByRole("dialog");
  await bag
    .getByRole("textbox", { name: /Special request for Madras filter coffee/ })
    .fill("Less sugar");
  await bag.getByRole("button", { name: "Place order request" }).click();
  await expect(
    guest.getByText(/Order placed for table 04\. Ready in about \d+ min\./),
  ).toBeVisible();
  await guest.getByRole("link", { name: "Track your order" }).click();
  await expect(guest.getByRole("heading", { name: "Track your order" })).toBeVisible();
  await expect(guest.getByRole("heading", { name: /Table 04/ })).toBeVisible();
  await expect(guest.locator(".tracking-eta")).toHaveText(/Ready in about \d+ min \(by /);
  await expect(guest.getByText("Request: Less sugar")).toBeVisible();
  const orderId = guest.url().split("/").pop() as string;

  // Reception accepts; the kitchen sees the table and the request, then works the ticket.
  const reception = await apiToken(request, "Reception");
  const accepted = await request.patch(`${API_ORIGIN}/api/v1/orders/${orderId}/status`, {
    headers: { authorization: `Bearer ${reception}` },
    data: { status: "Accepted" },
  });
  expect(accepted.status()).toBe(200);
  await expect(guest.locator('[aria-current="step"]')).toContainText("Accepted");

  const kitchen = await apiToken(request, "Kitchen Staff");
  const queue = await request.get(`${API_ORIGIN}/api/v1/kitchen/queue`, {
    headers: { authorization: `Bearer ${kitchen}` },
  });
  const ticket = ((await queue.json()) as { orders: QueueTicket[] }).orders.find(
    (candidate) => candidate.id === orderId,
  );
  expect(ticket?.tableNumber).toBe("04");
  expect(ticket?.items[0]?.notes).toBe("Less sugar");
  const itemId = ticket?.items[0]?.id as string;
  for (const preparationStatus of ["Preparing", "Ready"]) {
    const moved = await request.put(`${API_ORIGIN}/api/v1/kitchen/queue/${orderId}`, {
      headers: { authorization: `Bearer ${kitchen}` },
      data: { itemId, preparationStatus },
    });
    expect(moved.status()).toBe(200);
  }

  // No reload: the socket event brings the page to Ready.
  await expect(guest.locator(".tracking-eta")).toHaveText("Your order is ready.");
  await expect(guest.locator('[aria-current="step"]')).toContainText("Ready");
  await guestContext.close();

  // Serve and complete so the table's order does not linger in later specs.
  for (const status of ["Served", "Completed"]) {
    const next = await request.patch(`${API_ORIGIN}/api/v1/orders/${orderId}/status`, {
      headers: { authorization: `Bearer ${reception}` },
      data: { status },
    });
    expect(next.status()).toBe(200);
  }
});
