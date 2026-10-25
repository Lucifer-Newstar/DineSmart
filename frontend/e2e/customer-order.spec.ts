import { uniqueEmail } from "./fixtures/demo";
import { expect, registerCustomer, signInWith, test } from "./fixtures/test";

test("a customer browses the menu, places an order and finds it in their history", async ({
  page,
  request,
}) => {
  const account = {
    name: "Rohan Varma",
    email: uniqueEmail("order"),
    password: "order-flow-password",
  };
  await registerCustomer(request, account);
  await signInWith(page, account);

  await page.getByRole("link", { name: "Explore the menu" }).click();
  await expect(page.getByRole("heading", { name: "Made for this moment." })).toBeVisible();

  // Category tabs narrow the list; "All dishes" brings everything back.
  await page.getByRole("tab", { name: "Drinks" }).click();
  const coffee = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Madras filter coffee" }),
  });
  await expect(coffee).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ghee podi dosa" })).toHaveCount(0);
  await page.getByRole("tab", { name: "All dishes" }).click();

  await coffee.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Add one Madras filter coffee" }).click();
  const dosa = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Ghee podi dosa" }),
  });
  await dosa.getByRole("button", { name: "Add", exact: true }).click();

  await page.getByRole("button", { name: "Open bag, 3 items" }).click();
  const bag = page.getByRole("dialog");
  await expect(bag).toBeVisible();
  // 2 × ₹95 + 1 × ₹285
  await expect(bag.getByText("₹475")).toBeVisible();
  await bag.getByRole("button", { name: "Place order request" }).click();

  // The confirmation toast links to the history but fades out on its own, so
  // the spec waits for it and then uses the header link that always stays.
  await expect(page.getByRole("link", { name: "View order history" })).toBeVisible();
  await expect(bag).toBeHidden();
  await page.getByRole("link", { name: "Your orders" }).click();
  await expect(page.getByRole("heading", { name: "Your orders, in one place." })).toBeVisible();
  const order = page.getByRole("article").first();
  await expect(order).toContainText("Madras filter coffee");
  await expect(order).toContainText("Ghee podi dosa");
  await expect(order).toContainText("Sent to restaurant");
});

test("a signed-out visitor is asked to sign in before ordering", async ({ page }) => {
  await page.goto("/menu");
  const coffee = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Madras filter coffee" }),
  });
  await coffee.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Open bag, 1 item" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign in to place order" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fmenu/);
});
