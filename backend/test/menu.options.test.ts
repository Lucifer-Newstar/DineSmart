import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import type { MenuOptionGroup } from "../src/database/schema.js";
import { parseOptionGroups } from "../src/menu/menu.admin.router.js";
import { OrderError, OrderService, resolveOptions } from "../src/orders/order.service.js";
import type {
  NewOrder,
  OrderItemSnapshot,
  OrderRecord,
  OrderRepository,
  OrderRequestLine,
} from "../src/orders/order.types.js";

const now = new Date("2026-10-25T12:00:00.000Z");
const restaurantId = new ObjectId();
const riceId = new ObjectId();
const coffeeId = new ObjectId();

const PORTION: MenuOptionGroup = {
  id: "portion",
  name: "Portion",
  required: true,
  choices: [
    { id: "regular", label: "Regular", priceDeltaMinor: 0 },
    { id: "large", label: "Large", priceDeltaMinor: 6_000 },
  ],
};
const EXTRAS: MenuOptionGroup = {
  id: "extras",
  name: "Extras",
  required: false,
  choices: [{ id: "papad", label: "Roasted papad", priceDeltaMinor: 2_000 }],
};

/** Just enough of the order repository to place one order and keep its snapshots. */
function repository(): OrderRepository & { snapshots?: OrderItemSnapshot[]; created?: NewOrder } {
  const fake: OrderRepository & { snapshots?: OrderItemSnapshot[]; created?: NewOrder } = {
    getCustomerIdForUser: async () => new ObjectId(),
    getActiveRestaurant: async () => ({ id: restaurantId, name: "Saffron & Co.", currency: "INR" }),
    getAvailableMenuItems: async (_restaurant, ids) =>
      [
        {
          id: riceId,
          name: "Curry leaf lemon rice",
          priceMinor: 26_500,
          optionGroups: [PORTION, EXTRAS],
        },
        { id: coffeeId, name: "Madras filter coffee", priceMinor: 9_500 },
      ].filter((item) => ids.some((id) => id.equals(item.id))),
    createOrder: async (order, items) => {
      fake.created = order;
      fake.snapshots = items;
      return {
        id: new ObjectId(),
        ...order,
        restaurantName: "Saffron & Co.",
        items: items.map((item) => ({ id: new ObjectId(), ...item })),
        createdAt: now,
        updatedAt: now,
      } satisfies OrderRecord;
    },
    listForCustomer: async () => ({ orders: [], truncated: false }),
    findForCustomer: async () => null,
    cancelForCustomer: async () => null,
  };
  return fake;
}

async function place(items: OrderRequestLine[]) {
  const fake = repository();
  const order = await new OrderService(fake, () => now).createForCustomer({
    userId: new ObjectId(),
    restaurantId,
    items,
  });
  return { order, fake };
}

async function rejection(items: OrderRequestLine[]): Promise<OrderError> {
  try {
    await place(items);
  } catch (error) {
    assert.ok(error instanceof OrderError);
    return error;
  }
  assert.fail("the order should have been refused");
}

test("chosen options add their price deltas to the unit price and the order total", async () => {
  const { order, fake } = await place([
    { menuItemId: riceId, quantity: 2, options: { portion: "large", extras: "papad" } },
    { menuItemId: coffeeId, quantity: 1 },
  ]);

  // (265 + 60 + 20) × 2 + 95 = ₹785
  assert.equal(fake.created?.totalMinor, 78_500);
  assert.equal(order.totalMinor, 78_500);
  assert.equal(fake.snapshots?.[0]?.unitPriceMinor, 34_500);
  assert.deepEqual(fake.snapshots?.[0]?.options, [
    { group: "Portion", choice: "Large", priceDeltaMinor: 6_000 },
    { group: "Extras", choice: "Roasted papad", priceDeltaMinor: 2_000 },
  ]);
  assert.equal(fake.snapshots?.[1]?.unitPriceMinor, 9_500);
  assert.equal("options" in (fake.snapshots?.[1] ?? {}), false, "plain items store no options");
});

test("a zero-delta required choice keeps the base price", async () => {
  const { fake } = await place([
    { menuItemId: riceId, quantity: 1, options: { portion: "regular" } },
  ]);
  assert.equal(fake.created?.totalMinor, 26_500);
});

test("an unknown option group or choice is a 400", async () => {
  const unknownOptions: Array<Record<string, string>> = [
    { portion: "jumbo" },
    { portion: "large", sauce: "mint" },
  ];
  for (const options of unknownOptions) {
    const error = await rejection([{ menuItemId: riceId, quantity: 1, options }]);
    assert.equal(error.statusCode, 400, JSON.stringify(options));
    assert.equal(error.code, "invalid_order_options");
  }
  const onPlainItem = await rejection([
    { menuItemId: coffeeId, quantity: 1, options: { size: "large" } },
  ]);
  assert.equal(onPlainItem.code, "invalid_order_options");
});

test("a required group left unanswered is a 400 naming the group", async () => {
  const error = await rejection([
    { menuItemId: riceId, quantity: 1, options: { extras: "papad" } },
  ]);
  assert.equal(error.statusCode, 400);
  assert.equal(error.code, "order_option_required");
  assert.match(error.message, /portion/);
});

test("the same dish may be ordered twice with different options, not with the same ones", async () => {
  const { fake } = await place([
    { menuItemId: riceId, quantity: 1, options: { portion: "regular" } },
    { menuItemId: riceId, quantity: 1, options: { portion: "large" } },
  ]);
  assert.equal(fake.snapshots?.length, 2);
  assert.equal(fake.created?.totalMinor, 26_500 + 32_500);

  const duplicate = await rejection([
    { menuItemId: riceId, quantity: 1, options: { portion: "large", extras: "papad" } },
    { menuItemId: riceId, quantity: 2, options: { extras: "papad", portion: "large" } },
  ]);
  assert.equal(duplicate.code, "duplicate_order_item");
});

test("resolveOptions stores names, not ids, so later menu edits don't rewrite old orders", () => {
  assert.deepEqual(resolveOptions([PORTION], { portion: "large" }), [
    { group: "Portion", choice: "Large", priceDeltaMinor: 6_000 },
  ]);
  assert.deepEqual(resolveOptions([EXTRAS], {}), []);
});

test("menu option groups are validated before a manager can save them", () => {
  assert.deepEqual(parseOptionGroups([PORTION, EXTRAS]), [PORTION, EXTRAS]);
  assert.deepEqual(
    parseOptionGroups([
      { id: "spice", name: "Spice", required: false, choices: [{ id: "hot", label: "Hot" }] },
    ]),
    [
      {
        id: "spice",
        name: "Spice",
        required: false,
        choices: [{ id: "hot", label: "Hot", priceDeltaMinor: 0 }],
      },
    ],
  );
  const invalid: unknown[] = [
    "size",
    [{ ...PORTION, id: "Portion" }],
    [{ ...PORTION, choices: [] }],
    [PORTION, PORTION],
    [{ ...PORTION, choices: [{ id: "large", label: "Large", priceDeltaMinor: -100 }] }],
    [{ ...PORTION, choices: [{ id: "large", label: "Large", priceDeltaMinor: 1.5 }] }],
    [{ ...PORTION, choices: [PORTION.choices[0], PORTION.choices[0]] }],
    [{ ...PORTION, required: "yes" }],
    [{ ...PORTION, colour: "red" }],
    Array.from({ length: 5 }, (_, index) => ({ ...EXTRAS, id: `group-${index}` })),
  ];
  for (const value of invalid) assert.equal(parseOptionGroups(value), null, JSON.stringify(value));
});
