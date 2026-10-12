import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCartTotalMinor,
  MAX_ITEM_QUANTITY,
  MAX_ORDER_LINES,
  MAX_ORDER_UNITS,
  parseMenu,
  parsePendingCart,
} from "../src/app/menu/menu-data.ts";

const id = (value) => value.toString(16).padStart(24, "0");

function menuItem(number, name, overrides = {}) {
  return {
    id: id(number),
    name,
    description: `${name} from the kitchen.`,
    category: "Mains",
    priceMinor: 12_500,
    dietaryLabels: ["Vegetarian"],
    allergenLabels: ["Dairy"],
    ...overrides,
  };
}

function menuResponse(items = [menuItem(100, "Masala dosa"), menuItem(101, "Filter coffee")]) {
  return {
    restaurant: { id: id(1), name: "Saffron & Co.", currency: "INR" },
    items,
    truncated: false,
  };
}

test("parseMenu maps a valid live response and preserves safe display details", () => {
  const response = menuResponse([
    menuItem(100, "Masala dosa", { description: "  ", dietaryLabels: ["vegetarian"] }),
    menuItem(101, "Filter coffee", {
      description: undefined,
      category: "Drinks",
      dietaryLabels: [],
      allergenLabels: [],
    }),
  ]);
  response.truncated = true;

  assert.deepEqual(parseMenu(response), {
    id: id(1),
    name: "Saffron & Co.",
    currency: "INR",
    truncated: true,
    items: [
      {
        id: id(100),
        name: "Masala dosa",
        description: "Prepared fresh by the kitchen.",
        priceMinor: 12_500,
        category: "Mains",
        vegetarian: true,
        allergenLabels: ["Dairy"],
        art: "masala",
      },
      {
        id: id(101),
        name: "Filter coffee",
        description: "Prepared fresh by the kitchen.",
        priceMinor: 12_500,
        category: "Drinks",
        vegetarian: false,
        allergenLabels: [],
        art: "coffee",
      },
    ],
  });
});

test("parseMenu fails closed on invalid restaurant, currency, metadata, or unsafe prices", () => {
  const valid = menuResponse();
  const invalidResponses = [
    { ...valid, restaurant: { ...valid.restaurant, id: "not-an-object-id" } },
    { ...valid, restaurant: { ...valid.restaurant, currency: "inr" } },
    { ...valid, truncated: "false" },
    { ...valid, items: [menuItem(100, "No price", { priceMinor: 0 })] },
    {
      ...valid,
      items: [menuItem(100, "Unsafe price", { priceMinor: Number.MAX_SAFE_INTEGER + 1 })],
    },
    { ...valid, items: [menuItem(100, "Bad labels", { allergenLabels: ["Dairy", 7] })] },
    { ...valid, items: [menuItem(100, "Bad diet", { dietaryLabels: undefined })] },
  ];

  for (const response of invalidResponses) assert.equal(parseMenu(response), null);
});

test("parsePendingCart restores only known items for the matching restaurant", () => {
  const menu = parseMenu(menuResponse());
  assert.ok(menu);
  const firstItem = menu.items[0];

  assert.deepEqual(
    parsePendingCart(
      { restaurantId: menu.id, items: [{ menuItemId: firstItem.id, quantity: 2 }] },
      menu,
    ),
    [{ item: firstItem, quantity: 2 }],
  );
  assert.deepEqual(
    parsePendingCart(
      { restaurantId: id(2), items: [{ menuItemId: firstItem.id, quantity: 1 }] },
      menu,
    ),
    [],
  );
  assert.deepEqual(
    parsePendingCart(
      { restaurantId: menu.id, items: [{ menuItemId: id(999), quantity: 1 }] },
      menu,
    ),
    [],
  );
  assert.deepEqual(
    parsePendingCart(
      {
        restaurantId: menu.id,
        items: [
          { menuItemId: firstItem.id, quantity: 1 },
          { menuItemId: firstItem.id, quantity: 1 },
        ],
      },
      menu,
    ),
    [],
  );
});

test("parsePendingCart applies per-item, line-count, and total-unit caps", () => {
  const menu = parseMenu(
    menuResponse(
      Array.from({ length: MAX_ORDER_LINES + 1 }, (_, index) =>
        menuItem(200 + index, `Dish ${index}`),
      ),
    ),
  );
  assert.ok(menu);

  const atLineLimit = menu.items.slice(0, MAX_ORDER_LINES).map((item) => ({
    menuItemId: item.id,
    quantity: 1,
  }));
  assert.equal(
    parsePendingCart({ restaurantId: menu.id, items: atLineLimit }, menu).length,
    MAX_ORDER_LINES,
  );
  assert.deepEqual(
    parsePendingCart(
      {
        restaurantId: menu.id,
        items: [...atLineLimit, { menuItemId: menu.items[MAX_ORDER_LINES].id, quantity: 1 }],
      },
      menu,
    ),
    [],
  );

  const threeItems = menu.items.slice(0, 3);
  assert.equal(
    parsePendingCart(
      {
        restaurantId: menu.id,
        items: [
          { menuItemId: threeItems[0].id, quantity: MAX_ITEM_QUANTITY },
          { menuItemId: threeItems[1].id, quantity: MAX_ITEM_QUANTITY },
          { menuItemId: threeItems[2].id, quantity: MAX_ORDER_UNITS - 2 * MAX_ITEM_QUANTITY },
        ],
      },
      menu,
    ).length,
    3,
  );
  assert.deepEqual(
    parsePendingCart(
      {
        restaurantId: menu.id,
        items: [
          { menuItemId: threeItems[0].id, quantity: MAX_ITEM_QUANTITY },
          { menuItemId: threeItems[1].id, quantity: MAX_ITEM_QUANTITY },
          { menuItemId: threeItems[2].id, quantity: MAX_ORDER_UNITS - 2 * MAX_ITEM_QUANTITY + 1 },
        ],
      },
      menu,
    ),
    [],
  );
  assert.deepEqual(
    parsePendingCart(
      {
        restaurantId: menu.id,
        items: [{ menuItemId: threeItems[0].id, quantity: MAX_ITEM_QUANTITY + 1 }],
      },
      menu,
    ),
    [],
  );
});

test("calculateCartTotalMinor keeps safe integer totals and rejects overflow", () => {
  const menu = parseMenu(menuResponse());
  assert.ok(menu);

  assert.equal(
    calculateCartTotalMinor([
      { item: menu.items[0], quantity: 2 },
      { item: menu.items[1], quantity: 1 },
    ]),
    37_500,
  );
  assert.equal(calculateCartTotalMinor([]), 0);
  assert.equal(
    calculateCartTotalMinor([
      { item: { ...menu.items[0], priceMinor: Number.MAX_SAFE_INTEGER }, quantity: 2 },
    ]),
    null,
  );
  assert.equal(calculateCartTotalMinor([{ item: menu.items[0], quantity: 1.5 }]), null);
});
