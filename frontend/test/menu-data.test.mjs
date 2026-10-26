import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_DISHES,
  applyAvailability,
  availableDietaryFilters,
  calculateCartTotalMinor,
  cartLineKey,
  cleanLineNote,
  defaultSelection,
  filterMenuItems,
  isCompleteSelection,
  MAX_ITEM_QUANTITY,
  MAX_ORDER_LINES,
  MAX_ORDER_UNITS,
  menuAllergens,
  optionSummary,
  parseAvailabilityEvent,
  parseMenu,
  parsePendingCart,
  reconcileCart,
  unitPriceMinor,
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
        dietaryLabels: ["vegetarian"],
        allergenLabels: ["Dairy"],
        isAvailable: true,
        optionGroups: [],
        art: "masala",
      },
      {
        id: id(101),
        name: "Filter coffee",
        description: "Prepared fresh by the kitchen.",
        priceMinor: 12_500,
        category: "Drinks",
        vegetarian: false,
        dietaryLabels: [],
        allergenLabels: [],
        isAvailable: true,
        optionGroups: [],
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

/** A small parsed menu: dosa (veg, dairy), lemon rice (vegan, gluten-free, peanuts), coffee, chicken. */
function sampleMenu() {
  const menu = parseMenu(
    menuResponse([
      menuItem(100, "Ghee podi dosa", {
        category: "South Indian",
        description: "Crisp dosa, podi.",
      }),
      menuItem(101, "Curry leaf lemon rice", {
        dietaryLabels: ["vegan", "gluten-free"],
        allergenLabels: ["Peanuts"],
      }),
      menuItem(102, "Madras filter coffee", { category: "Drinks", isAvailable: false }),
      menuItem(103, "Pepper chicken", { dietaryLabels: ["non-vegetarian"], allergenLabels: [] }),
    ]),
  );
  assert.ok(menu);
  return menu;
}

const names = (items) => items.map((item) => item.name);
const noFilters = { category: ALL_DISHES, search: "", dietary: [], withoutAllergens: [] };

test("parseMenu keeps sold-out items flagged and treats a missing flag as available", () => {
  const menu = sampleMenu();
  assert.equal(menu.items.find((item) => item.name === "Madras filter coffee")?.isAvailable, false);
  assert.equal(menu.items.find((item) => item.name === "Ghee podi dosa")?.isAvailable, true);
  assert.equal(parseMenu(menuResponse([menuItem(100, "Dosa", { isAvailable: "no" })])), null);
});

test("filters narrow by category, every search word, dietary labels and allergens", () => {
  const { items } = sampleMenu();
  assert.equal(filterMenuItems(items, noFilters).length, 4);
  assert.deepEqual(names(filterMenuItems(items, { ...noFilters, category: "Drinks" })), [
    "Madras filter coffee",
  ]);
  assert.deepEqual(names(filterMenuItems(items, { ...noFilters, search: "  DOSA podi " })), [
    "Ghee podi dosa",
  ]);
  assert.deepEqual(
    names(filterMenuItems(items, { ...noFilters, search: "south" })),
    ["Ghee podi dosa"],
    "search also matches the category",
  );
  assert.deepEqual(names(filterMenuItems(items, { ...noFilters, search: "dosa coffee" })), []);
});

test("vegetarian includes vegan dishes; combined dietary filters must all apply", () => {
  const { items } = sampleMenu();
  assert.deepEqual(names(filterMenuItems(items, { ...noFilters, dietary: ["vegetarian"] })), [
    "Ghee podi dosa",
    "Curry leaf lemon rice",
    "Madras filter coffee",
  ]);
  assert.deepEqual(
    names(filterMenuItems(items, { ...noFilters, dietary: ["vegan", "gluten-free"] })),
    ["Curry leaf lemon rice"],
  );
  assert.deepEqual(names(filterMenuItems(items, { ...noFilters, dietary: ["jain"] })), []);
});

test("leaving out an allergen hides every dish that names it, whatever its case", () => {
  const { items } = sampleMenu();
  assert.deepEqual(
    names(filterMenuItems(items, { ...noFilters, withoutAllergens: ["dairy", "peanuts"] })),
    ["Pepper chicken"],
  );
  assert.deepEqual(
    names(
      filterMenuItems(items, {
        ...noFilters,
        dietary: ["vegetarian"],
        withoutAllergens: ["peanuts"],
        category: "Mains",
      }),
    ),
    [],
  );
});

test("the menu offers only dietary filters and allergens its dishes actually have", () => {
  const { items } = sampleMenu();
  assert.deepEqual(availableDietaryFilters(items), ["vegetarian", "vegan", "gluten-free"]);
  assert.deepEqual(menuAllergens(items), ["dairy", "peanuts"]);
});

test("availability events are validated and applied to one item only", () => {
  const menu = sampleMenu();
  assert.deepEqual(parseAvailabilityEvent({ menuItemId: id(100), isAvailable: false }), {
    menuItemId: id(100),
    isAvailable: false,
  });
  for (const bad of [null, { menuItemId: "x", isAvailable: false }, { menuItemId: id(100) }]) {
    assert.equal(parseAvailabilityEvent(bad), null);
  }

  const soldOut = applyAvailability(menu, id(100), false);
  assert.equal(soldOut.items[0].isAvailable, false);
  assert.equal(soldOut.items[1].isAvailable, true);
  assert.equal(menu.items[0].isAvailable, true, "the original menu is not mutated");
  assert.equal(applyAvailability(menu, id(100), true), menu, "no change keeps the same object");
  assert.equal(applyAvailability(menu, id(999), false), menu, "unknown items are ignored");
});

test("a dish that sells out is taken out of the bag and named", () => {
  const menu = sampleMenu();
  const lines = [
    { item: menu.items[0], quantity: 2 },
    { item: menu.items[1], quantity: 1 },
  ];
  const after = applyAvailability(menu, id(100), false);

  const result = reconcileCart(lines, after);
  assert.deepEqual(result.removed, ["Ghee podi dosa"]);
  assert.deepEqual(
    result.lines.map((line) => [line.item.name, line.quantity]),
    [["Curry leaf lemon rice", 1]],
  );
  assert.deepEqual(reconcileCart(lines, menu).removed, []);
});

test("a saved bag never restores a sold-out dish", () => {
  const menu = sampleMenu();
  const stored = { restaurantId: id(1), items: [{ menuItemId: id(102), quantity: 1 }] };
  assert.deepEqual(parsePendingCart(stored, menu), []);
});

const PORTION = {
  id: "portion",
  name: "Portion",
  required: true,
  choices: [
    { id: "regular", label: "Regular", priceDeltaMinor: 0 },
    { id: "large", label: "Large", priceDeltaMinor: 6_000 },
  ],
};
const EXTRAS = {
  id: "extras",
  name: "Extras",
  required: false,
  choices: [{ id: "papad", label: "Roasted papad", priceDeltaMinor: 2_000 }],
};

function riceMenu() {
  const menu = parseMenu(
    menuResponse([
      menuItem(110, "Curry leaf lemon rice", {
        priceMinor: 26_500,
        optionGroups: [PORTION, EXTRAS],
      }),
    ]),
  );
  assert.ok(menu);
  return menu;
}

test("dishes with options parse their groups, and malformed groups fail the menu closed", () => {
  assert.deepEqual(riceMenu().items[0].optionGroups, [PORTION, EXTRAS]);
  for (const optionGroups of [
    "size",
    [{ ...PORTION, choices: [] }],
    [{ ...PORTION, choices: [{ id: "big", label: "Big", priceDeltaMinor: -1 }] }],
    [{ ...PORTION, id: "Has Spaces" }],
  ]) {
    assert.equal(parseMenu(menuResponse([menuItem(110, "Rice", { optionGroups })])), null);
  }
});

test("required groups start on their first choice and the price follows the choices", () => {
  const [rice] = riceMenu().items;
  assert.deepEqual(defaultSelection(rice), { portion: "regular" });
  assert.equal(isCompleteSelection(rice, {}), false, "a required group must be answered");
  assert.equal(isCompleteSelection(rice, { portion: "large" }), true);
  assert.equal(isCompleteSelection(rice, { portion: "jumbo" }), false);
  assert.equal(isCompleteSelection(rice, { portion: "large", sauce: "mint" }), false);
  assert.equal(unitPriceMinor(rice, { portion: "large", extras: "papad" }), 34_500);
  assert.equal(unitPriceMinor(rice, { portion: "jumbo" }), null);
  assert.equal(optionSummary(rice, { extras: "papad", portion: "large" }), "Large · Roasted papad");
});

test("the same dish with different options is a separate bag line with its own total", () => {
  const [rice] = riceMenu().items;
  assert.equal(
    cartLineKey(rice.id, { portion: "large", extras: "papad" }),
    cartLineKey(rice.id, { extras: "papad", portion: "large" }),
  );
  assert.notEqual(
    cartLineKey(rice.id, { portion: "large" }),
    cartLineKey(rice.id, { portion: "regular" }),
  );
  assert.equal(cartLineKey(rice.id), rice.id);
  assert.equal(
    calculateCartTotalMinor([
      { item: rice, quantity: 2, options: { portion: "large" } },
      { item: rice, quantity: 1, options: { portion: "regular", extras: "papad" } },
    ]),
    2 * 32_500 + 28_500,
  );
});

test("a saved bag keeps chosen options and drops an entry whose options no longer fit", () => {
  const menu = riceMenu();
  const restored = parsePendingCart(
    {
      restaurantId: id(1),
      items: [
        { menuItemId: id(110), quantity: 1, options: { portion: "large" } },
        { menuItemId: id(110), quantity: 2, options: { portion: "regular" } },
      ],
    },
    menu,
  );
  assert.deepEqual(
    restored.map((line) => [line.quantity, line.options]),
    [
      [1, { portion: "large" }],
      [2, { portion: "regular" }],
    ],
  );
  const missingRequired = { restaurantId: id(1), items: [{ menuItemId: id(110), quantity: 1 }] };
  assert.deepEqual(parsePendingCart(missingRequired, menu), []);
  const duplicate = {
    restaurantId: id(1),
    items: [
      { menuItemId: id(110), quantity: 1, options: { portion: "large" } },
      { menuItemId: id(110), quantity: 1, options: { portion: "large" } },
    ],
  };
  assert.deepEqual(parsePendingCart(duplicate, menu), []);
});

test("special requests are tidied, kept through sign-in and capped", () => {
  assert.equal(cleanLineNote("  no   onion "), "no onion");
  assert.equal(cleanLineNote("   "), undefined);
  assert.equal(cleanLineNote(undefined), undefined);
  assert.equal(cleanLineNote("x".repeat(141)), null);
  assert.equal(cleanLineNote(7), null);

  const menu = parseMenu(menuResponse());
  assert.ok(menu);
  const firstItem = menu.items[0];
  assert.deepEqual(
    parsePendingCart(
      {
        restaurantId: menu.id,
        items: [{ menuItemId: firstItem.id, quantity: 1, notes: " extra crisp " }],
      },
      menu,
    ),
    [{ item: firstItem, quantity: 1, notes: "extra crisp" }],
  );
  assert.deepEqual(
    parsePendingCart(
      {
        restaurantId: menu.id,
        items: [{ menuItemId: firstItem.id, quantity: 1, notes: "x".repeat(141) }],
      },
      menu,
    ),
    [],
  );
});
