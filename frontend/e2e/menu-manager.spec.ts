import { seedDemoData } from "./fixtures/demo";
import { expect, signInAs, test } from "./fixtures/test";

// These specs add, archive and 86 seeded dishes; reseeding restores the fixture.
test.afterAll(() => seedDemoData());

async function openMenuManager(page: import("@playwright/test").Page) {
  await signInAs(page, "Manager");
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Menu" })
    .click();
  await expect(page.getByRole("heading", { name: "Menu manager" })).toBeVisible();
}

test("a manager adds a dish, customers see it, and archiving takes it off the menu", async ({
  page,
  browser,
}) => {
  const dish = `Neer dosa ${Date.now().toString(36)}`;
  await openMenuManager(page);

  await page.getByRole("button", { name: "Add item" }).click();
  const form = page.getByRole("form", { name: "Add a menu item" });
  // An empty submit names each problem and moves focus to the first one.
  await form.getByRole("button", { name: "Add to menu" }).click();
  await expect(form.getByRole("textbox", { name: "Dish name" })).toBeFocused();
  await expect(form.getByRole("textbox", { name: "Dish name" })).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  await form.getByRole("textbox", { name: "Dish name" }).fill(dish);
  await form.getByRole("combobox", { name: "Category" }).fill("South Indian");
  await form.getByRole("textbox", { name: "Price (₹)" }).fill("145");
  await form.getByRole("button", { name: "Add to menu" }).click();
  await expect(form).toBeHidden();
  const section = page.getByRole("region", { name: "South Indian" });
  await expect(section.getByText(dish, { exact: true })).toBeVisible();

  const customer = await browser.newPage();
  await customer.goto("/menu");
  await expect(customer.getByRole("heading", { name: dish })).toBeVisible();
  await expect(
    customer.getByRole("article").filter({ has: customer.getByRole("heading", { name: dish }) }),
  ).toContainText("₹145");

  await page.getByRole("button", { name: `Archive ${dish}` }).click();
  await page.getByRole("button", { name: `Confirm archiving ${dish}` }).click();
  await expect(page.getByText(`${dish} was archived and left the menu.`)).toBeVisible();
  await expect(section.getByText(dish, { exact: true })).toHaveCount(0);

  await customer.reload();
  await expect(customer.getByRole("heading", { name: "Made for this moment." })).toBeVisible();
  await expect(customer.getByRole("heading", { name: dish })).toHaveCount(0);
  await customer.close();
});

test("an 86'd dish greys out for a signed-in customer without a reload, then comes back", async ({
  page,
  browser,
}) => {
  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage();
  await signInAs(customer, "Customer");
  await customer.goto("/menu");
  const coffee = customer.getByRole("article").filter({
    has: customer.getByRole("heading", { name: "Madras filter coffee" }),
  });
  await expect(coffee.getByRole("button", { name: "Add", exact: true })).toBeVisible();

  await openMenuManager(page);
  const toggle = page.getByRole("switch", { name: "Madras filter coffee available" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Madras filter coffee is marked sold out.")).toBeVisible();

  // The realtime event reaches the open menu; nothing reloads the customer's page.
  await expect(coffee.getByText("Sold out", { exact: true })).toBeVisible();
  await expect(coffee.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(coffee.getByRole("button", { name: "Add", exact: true })).toBeVisible();
  await customerContext.close();
});

test("a customer chooses a portion and the bag prices the option", async ({ page }) => {
  await page.goto("/menu");
  const rice = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Curry leaf lemon rice" }),
  });
  await rice.getByRole("button", { name: "Choose options for Curry leaf lemon rice" }).click();

  const picker = page.getByRole("dialog", { name: "Curry leaf lemon rice" });
  await expect(picker.getByRole("radio", { name: "Regular" })).toBeChecked();
  await picker.getByRole("radio", { name: /Large/ }).check();
  await picker.getByRole("radio", { name: /Roasted papad/ }).check();
  // ₹265 + ₹60 large + ₹20 papad
  await picker.getByRole("button", { name: "Add to bag · ₹345" }).click();
  await expect(picker).toBeHidden();

  // The same dish with the regular portion is a second line in the bag.
  await rice.getByRole("button", { name: "Choose options for Curry leaf lemon rice" }).click();
  await page
    .getByRole("dialog", { name: "Curry leaf lemon rice" })
    .getByRole("button", {
      name: "Add to bag · ₹265",
    })
    .click();

  await page.getByRole("button", { name: "Your bag, 2 items" }).click();
  const bag = page.getByRole("dialog", { name: /Your bag/ });
  await expect(bag.getByText("Large · Roasted papad")).toBeVisible();
  await expect(bag.getByText("Regular", { exact: true })).toBeVisible();
  await expect(bag.getByText("₹610")).toBeVisible();
});
