import assert from "node:assert/strict";
import test from "node:test";
import {
  etaLine,
  orderStatusFromEvent,
  parseTrackingResponse,
  planReorder,
  reorderNotice,
  stepState,
} from "../src/app/orders/order-tracking.ts";

const order = {
  id: "a".repeat(24),
  status: "Preparing",
  restaurantName: "Saffron & Co.",
  tableNumber: "04",
  totalMinor: 36_000,
  currency: "INR",
  createdAt: "2026-10-26T13:00:00.000Z",
  items: [
    {
      id: "i1",
      menuItemId: "m1",
      name: "Masala dosa",
      quantity: 2,
      options: [{ group: "Spice", choice: "Hot", priceDeltaMinor: 0 }],
      notes: "No onion",
    },
  ],
};

test("tracking responses parse with their estimate", () => {
  const parsed = parseTrackingResponse({
    order,
    eta: { totalMinutes: 18, readyAt: "2026-10-26T13:18:00.000Z", minutesLeft: 12, late: false },
  });
  assert.equal(parsed?.order.tableNumber, "04");
  assert.deepEqual(parsed?.order.items[0]?.options, [{ group: "Spice", choice: "Hot" }]);
  assert.equal(parsed?.order.items[0]?.notes, "No onion");
  assert.equal(parsed?.eta?.minutesLeft, 12);
  assert.equal(parseTrackingResponse({ order, eta: null })?.eta, null);
  assert.equal(parseTrackingResponse({ order: { ...order, items: [{ name: 1 }] } }), null);
});

test("steps move from placed to served", () => {
  assert.deepEqual(
    ["Created", "Accepted", "Preparing", "Ready", "Served"].map((step) =>
      stepState("Preparing", step),
    ),
    ["done", "done", "current", "upcoming", "upcoming"],
  );
  assert.equal(stepState("Completed", "Served"), "done");
  assert.equal(stepState("Cancelled", "Created"), "upcoming");
});

test("only this order's status events count", () => {
  assert.equal(
    orderStatusFromEvent(
      { event: "order.status", data: { orderId: order.id, status: "Ready" } },
      order.id,
    ),
    "Ready",
  );
  assert.equal(
    orderStatusFromEvent(
      { event: "order.status", data: { orderId: "b", status: "Ready" } },
      order.id,
    ),
    null,
  );
  assert.equal(
    orderStatusFromEvent(
      { event: "order.updated", data: { orderId: order.id, status: "Ready" } },
      order.id,
    ),
    null,
  );
});

test("the ETA line reads naturally in the restaurant's time zone", () => {
  const eta = { readyAt: "2026-10-26T13:18:00.000Z", minutesLeft: 12, late: false };
  assert.equal(etaLine("Preparing", eta), "Ready in about 12 min (by 6:48 pm)");
  assert.match(etaLine("Preparing", { ...eta, late: true }) ?? "", /longer than expected/);
  assert.equal(etaLine("Ready", eta), "Your order is ready.");
  assert.equal(etaLine("Accepted", null), null);
});

const menu = [
  {
    id: "m1",
    name: "Masala dosa",
    isAvailable: true,
    optionGroups: [
      {
        id: "spice",
        name: "Spice",
        required: true,
        choices: [
          { id: "mild", label: "Mild" },
          { id: "hot", label: "Hot" },
        ],
      },
    ],
  },
  { id: "m2", name: "Filter coffee", isAvailable: false },
  { id: "m3", name: "Lemon rice", isAvailable: true, optionGroups: [] },
];

test("reorder keeps available dishes with their options and requests, and skips sold-out ones", () => {
  const plan = planReorder(
    [
      {
        id: "i1",
        menuItemId: "m1",
        name: "Masala dosa",
        quantity: 2,
        options: [{ group: "Spice", choice: "Hot" }],
        notes: "No onion",
      },
      { id: "i2", menuItemId: "m2", name: "Filter coffee", quantity: 1 },
      { id: "i3", menuItemId: "m3", name: "Lemon rice", quantity: 1 },
      { id: "i4", menuItemId: "gone", name: "Old special", quantity: 1 },
    ],
    menu,
  );
  assert.deepEqual(plan.lines, [
    { menuItemId: "m1", quantity: 2, options: { spice: "hot" }, notes: "No onion" },
    { menuItemId: "m3", quantity: 1 },
  ]);
  assert.deepEqual(plan.unavailable, ["Filter coffee", "Old special"]);
  assert.equal(
    reorderNotice(plan.unavailable),
    "Filter coffee and Old special are not available today, so they were left out.",
  );
  assert.equal(reorderNotice([]), null);
});

test("a dish whose options changed is left out rather than guessed", () => {
  const removedChoice = planReorder(
    [
      {
        id: "i1",
        menuItemId: "m1",
        name: "Masala dosa",
        quantity: 1,
        options: [{ group: "Spice", choice: "Extra hot" }],
      },
    ],
    menu,
  );
  const newRequiredGroup = planReorder(
    [{ id: "i1", menuItemId: "m1", name: "Masala dosa", quantity: 1 }],
    menu,
  );
  assert.deepEqual(removedChoice, { lines: [], unavailable: ["Masala dosa"] });
  assert.deepEqual(newRequiredGroup, { lines: [], unavailable: ["Masala dosa"] });
  assert.equal(
    reorderNotice(["Masala dosa"]),
    "Masala dosa is not available today, so it was left out.",
  );
});
