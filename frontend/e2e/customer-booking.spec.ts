import { uniqueEmail } from "./fixtures/demo";
import { expect, registerCustomer, signInAs, signInWith, test } from "./fixtures/test";

/** Tomorrow in IST as yyyy-mm-dd, the value a date input takes. */
function tomorrowInIndia(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(tomorrow);
}

test("a customer requests a table and sees it confirmed once reception accepts it", async ({
  page,
  browser,
  request,
}) => {
  // A unique guest name keeps this run's row apart from earlier runs' bookings.
  const account = {
    name: `Meenakshi ${Date.now().toString(36).toUpperCase()}`,
    email: uniqueEmail("booking"),
    password: "booking-flow-password",
  };
  await registerCustomer(request, account);
  await signInWith(page, account);

  await page.getByRole("link", { name: "Book a table" }).first().click();
  await expect(page.getByText(`Booking as ${account.name}`)).toBeVisible();
  await page.getByLabel("Date").fill(tomorrowInIndia());
  await page.getByLabel("Party size").selectOption("3");
  await page.getByRole("button", { name: "7:30 pm" }).click();
  await expect(page.getByRole("button", { name: "7:30 pm" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel(/Notes for the restaurant/).fill("Window seat if possible");
  await page.getByRole("button", { name: /Request this table/ }).click();

  const confirmation = page.locator(".book-confirmation");
  await expect(page.getByRole("heading", { name: "Your request is with us." })).toBeVisible();
  await expect(confirmation).toContainText("3 guests");
  await expect(confirmation).toContainText("Status: Awaiting");

  // Reception confirms the request from the staff workspace.
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await signInAs(staff, "Reception");
  await staff
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Reservations" })
    .click();
  await staff.getByRole("button", { name: `Confirm ${account.name}` }).click();
  await expect(staff.getByRole("button", { name: `Seat guest ${account.name}` })).toBeVisible();
  await staffContext.close();

  await page.goto("/");
  await expect(page.getByText(/^Confirmed · /)).toBeVisible();
  await expect(page.getByText(/3 guests/)).toBeVisible();
});

test("a signed-out visitor cannot send a booking request", async ({ page }) => {
  await page.goto("/book");
  await expect(page.getByRole("button", { name: /Sign in to request a table/ })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/login?next=%2Fbook",
  );
});
