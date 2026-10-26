import type { APIRequestContext } from "@playwright/test";
import { API_ORIGIN, DEMO_RESTAURANT_ID, uniqueEmail } from "./fixtures/demo";
import { apiToken, expect, registerCustomer, signInAs, signInWith, test } from "./fixtures/test";

/** A local date in IST a few days out, so these bookings never meet other specs' slots. */
function istDate(daysAhead: number): string {
  const day = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(day);
}

async function slotOpen(
  request: APIRequestContext,
  date: string,
  partySize: number,
  localTime: string,
): Promise<boolean> {
  const response = await request.get(
    `${API_ORIGIN}/api/v1/reservations/availability?restaurantId=${DEMO_RESTAURANT_ID}&date=${date}&partySize=${partySize}`,
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    slots: Array<{ localTime: string; available: boolean }>;
  };
  const slot = body.slots.find((candidate) => candidate.localTime === localTime);
  expect(slot, `slot ${localTime} on ${date}`).toBeTruthy();
  return slot?.available === true;
}

async function customerToken(
  request: APIRequestContext,
  account: { email: string; password: string },
): Promise<string> {
  const response = await request.post(`${API_ORIGIN}/api/v1/auth/login`, {
    headers: { origin: "http://localhost:3000" },
    data: account,
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

function newAccount(prefix: string) {
  return {
    name: `${prefix} ${Date.now().toString(36).toUpperCase()}`,
    email: uniqueEmail(prefix.toLowerCase()),
    password: "reservation-flow-password",
  };
}

test("a guest books an open slot, changes it, cancels it and the slot opens again", async ({
  page,
  request,
}) => {
  const date = istDate(3);
  const account = newAccount("Kavya");
  await registerCustomer(request, account);
  await signInWith(page, account);

  // Only table 04 seats six, so one booking of six fills the 9:00 pm slot.
  expect(await slotOpen(request, date, 6, "21:00")).toBe(true);
  await page.goto("/book");
  await page.getByLabel("Date").fill(date);
  await page.getByLabel("Party size").selectOption("6");
  await page.getByRole("button", { name: /^9:00 pm/ }).click();
  await page.getByRole("button", { name: /Request this table/ }).click();
  await expect(page.getByRole("heading", { name: "Your request is with us." })).toBeVisible();
  await expect.poll(() => slotOpen(request, date, 6, "21:00")).toBe(false);

  // The booking page now shows that slot as taken for a party of six.
  await page.goto("/book");
  await page.getByLabel("Date").fill(date);
  await page.getByLabel("Party size").selectOption("6");
  await expect(page.getByRole("button", { name: /^9:00 pm/ })).toBeDisabled();

  // Move it to 6:30 pm from My bookings; a 120-minute turn then ends before 9:00 pm.
  await page.goto("/bookings");
  await expect(page.getByRole("heading", { name: "My bookings" })).toBeVisible();
  await page.getByRole("button", { name: "Change booking" }).click();
  await page.getByLabel("New date").fill(date);
  await page.getByRole("button", { name: "6:30 pm" }).click();
  await page.getByRole("button", { name: "Save change" }).click();
  await expect(page.getByRole("button", { name: "Change booking" })).toBeVisible();
  await expect(page.locator(".customer-order-card").first()).toContainText("6:30");
  await expect.poll(() => slotOpen(request, date, 6, "21:00")).toBe(true);
  expect(await slotOpen(request, date, 6, "18:30")).toBe(false);

  // Cancel: the booking moves to Past and its slot opens again.
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await page.getByRole("button", { name: "Yes, cancel booking" }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByText("No upcoming bookings.")).toBeVisible();
  await expect.poll(() => slotOpen(request, date, 6, "18:30")).toBe(true);
});

test("reception marks a guest arrived, seats them at the suggested table and completes the visit", async ({
  page,
  request,
}) => {
  const date = istDate(4);
  const account = newAccount("Rohan");
  await registerCustomer(request, account);
  const token = await customerToken(request, account);
  const slots = await request.get(
    `${API_ORIGIN}/api/v1/reservations/availability?restaurantId=${DEMO_RESTAURANT_ID}&date=${date}&partySize=2`,
  );
  const open = ((await slots.json()) as { slots: Array<{ localTime: string; startAt: string }> })
    .slots;
  const startAt = open.find((slot) => slot.localTime === "18:00")?.startAt;
  expect(startAt).toBeTruthy();
  const created = await request.post(`${API_ORIGIN}/api/v1/reservations`, {
    headers: { authorization: `Bearer ${token}` },
    data: { restaurantId: DEMO_RESTAURANT_ID, partySize: 2, startAt, occasion: "birthday" },
  });
  expect(created.status()).toBe(201);

  await signInAs(page, "Reception");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Reservations" })
    .click();
  await page.getByRole("button", { name: `Mark arrived ${account.name}` }).click();
  await expect(page.getByRole("button", { name: `Seat guest ${account.name}` })).toBeVisible();
  await page.getByRole("button", { name: `Seat guest ${account.name}` }).click();
  await expect(page.getByRole("button", { name: `Complete ${account.name}` })).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(account.name) });
  await expect(row).toContainText("Table");
  await expect(row).not.toContainText("Unassigned");

  const tableNumber = (await row.getByRole("cell").nth(3).textContent())?.replace("Table ", "");
  const staffToken = await apiToken(request, "Reception");
  const tableStatus = async () => {
    const tables = await request.get(`${API_ORIGIN}/api/v1/tables`, {
      headers: { authorization: `Bearer ${staffToken}` },
    });
    const body = (await tables.json()) as {
      tables: Array<{ tableNumber: string; status: string }>;
    };
    return body.tables.find((table) => table.tableNumber === tableNumber)?.status;
  };
  expect(await tableStatus()).toBe("occupied");

  // Completing the visit frees the table again for the rest of the suite.
  await page.getByRole("button", { name: `Complete ${account.name}` }).click();
  await expect(row).toContainText("Completed");
  await expect.poll(tableStatus).toBe("available");
});
