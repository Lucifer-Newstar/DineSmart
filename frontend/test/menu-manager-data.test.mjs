import assert from "node:assert/strict";
import test from "node:test";
import {
  bodyFromDraft,
  draftFromItem,
  EMPTY_DRAFT,
  moveCategory,
  moveItem,
  paiseToRupees,
  parseManagedMenu,
  rupeesToPaise,
} from "../src/app/_dashboard/menu-manager-data.ts";

const id = (value) => value.toString(16).padStart(24, "0");

function apiItem(number, name, category, overrides = {}) {
  return {
    id: id(number),
    name,
    category,
    priceMinor: 28_500,
    isAvailable: true,
    dietaryLabels: ["vegetarian"],
    allergenLabels: [],
    optionGroups: [],
    updatedAt: "2026-10-25T12:00:00.000Z",
    ...overrides,
  };
}

function managedMenu() {
  const menu = parseManagedMenu({
    categories: ["South Indian", "Drinks"],
    items: [
      apiItem(1, "Ghee podi dosa", "South Indian", { prepStation: "tawa", prepMinutes: 8 }),
      apiItem(2, "Rava dosa", "South Indian", { description: "Crisp semolina dosa." }),
      apiItem(3, "Filter coffee", "Drinks", { isAvailable: false }),
    ],
    truncated: false,
  });
  assert.ok(menu);
  return menu;
}

test("rupees typed by a manager become whole paise; zero and junk are refused", () => {
  assert.equal(rupeesToPaise("285"), 28_500);
  assert.equal(rupeesToPaise("285.5"), 28_550);
  assert.equal(rupeesToPaise(" ₹1,250.05 "), 125_005);
  for (const bad of ["", "0", "0.00", "-5", "12.345", "abc", "1e3", "1234567"]) {
    assert.equal(rupeesToPaise(bad), null, bad);
  }
  assert.equal(paiseToRupees(28_500), "285");
  assert.equal(paiseToRupees(28_550), "285.50");
});

test("the managed menu parses sold-out items, prep fields and options, and fails closed", () => {
  const menu = managedMenu();
  assert.deepEqual(menu.categories, ["South Indian", "Drinks"]);
  assert.equal(menu.items[0].prepStation, "tawa");
  assert.equal(menu.items[0].prepMinutes, 8);
  assert.equal(menu.items[1].prepMinutes, null);
  assert.equal(menu.items[2].isAvailable, false);
  assert.equal(parseManagedMenu({ categories: [], items: [{ id: "x" }], truncated: false }), null);
  assert.equal(parseManagedMenu({ items: [], truncated: false }), null);
  assert.equal(
    parseManagedMenu({
      categories: ["Drinks"],
      items: [apiItem(4, "Lassi", "Drinks", { optionGroups: [{ id: "size", name: "Size" }] })],
      truncated: false,
    }),
    null,
  );
});

test("a new item draft becomes a clean create body", () => {
  const result = bodyFromDraft(
    {
      ...EMPTY_DRAFT,
      name: "  Mysore masala dosa ",
      category: "South Indian",
      price: "310",
      allergens: "Dairy, nuts, dairy, ",
      dietaryLabels: ["vegetarian"],
      prepStation: "tawa",
      prepMinutes: "9",
    },
    false,
  );
  assert.deepEqual(result, {
    body: {
      name: "Mysore masala dosa",
      category: "South Indian",
      priceMinor: 31_000,
      dietaryLabels: ["vegetarian"],
      allergenLabels: ["dairy", "nuts"],
      prepStation: "tawa",
      prepMinutes: 9,
    },
  });
});

test("an edit clears emptied optional fields instead of leaving old values behind", () => {
  const item = managedMenu().items[0];
  const draft = { ...draftFromItem(item), description: "", prepStation: "", prepMinutes: "" };
  assert.equal(draftFromItem(item).price, "285");
  const result = bodyFromDraft(draft, true);
  assert.ok("body" in result);
  assert.equal(result.body.description, null);
  assert.equal(result.body.prepStation, null);
  assert.equal(result.body.prepMinutes, null);
});

test("each invalid field is named so the form can tie the error to its input", () => {
  const result = bodyFromDraft({ ...EMPTY_DRAFT, price: "0", prepMinutes: "500" }, false);
  assert.ok("errors" in result);
  assert.deepEqual(Object.keys(result.errors).sort(), ["category", "name", "prepMinutes", "price"]);
});

test("moving items stays inside their category and sends the whole new order", () => {
  const menu = managedMenu();
  assert.deepEqual(moveItem(menu, id(2), -1), {
    categories: ["South Indian", "Drinks"],
    itemIds: [id(2), id(1), id(3)],
  });
  assert.equal(moveItem(menu, id(1), -1), null, "the first item cannot move up");
  assert.equal(moveItem(menu, id(3), 1), null, "the last item of its category cannot move down");
  assert.equal(moveItem(menu, id(9), 1), null);
});

test("moving a category carries its items with it", () => {
  const menu = managedMenu();
  assert.deepEqual(moveCategory(menu, "Drinks", -1), {
    categories: ["Drinks", "South Indian"],
    itemIds: [id(3), id(1), id(2)],
  });
  assert.equal(moveCategory(menu, "South Indian", -1), null);
  assert.equal(moveCategory(menu, "Desserts", 1), null);
});
