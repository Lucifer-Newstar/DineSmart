import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { ORDER_LINE_NOTE_MAX_LENGTH, OrderService } from "../src/orders/order.service.js";
import type { OrderItemSnapshot, OrderRepository } from "../src/orders/order.types.js";

const restaurantId = new ObjectId();
const dosa = new ObjectId();
const now = new Date("2026-10-26T07:30:00.000Z");

function service(saved: OrderItemSnapshot[][]) {
  const repository: OrderRepository = {
    getCustomerIdForUser: async () => new ObjectId(),
    getActiveRestaurant: async () => ({ id: restaurantId, name: "Saffron & Co.", currency: "INR" }),
    getAvailableMenuItems: async () => [{ id: dosa, name: "Masala dosa", priceMinor: 18_000 }],
    createOrder: async (order, items) => {
      saved.push(items);
      return {
        id: new ObjectId(),
        restaurantId,
        restaurantName: "Restaurant",
        status: "Created",
        totalMinor: order.totalMinor,
        currency: "INR",
        items: items.map((item) => ({ ...item, id: new ObjectId() })),
        createdAt: now,
        updatedAt: now,
      };
    },
    listForCustomer: async () => ({ orders: [], truncated: false }),
    findForCustomer: async () => null,
    cancelForCustomer: async () => null,
  };
  return new OrderService(repository, () => now);
}

test("each line keeps its own special request", async () => {
  const saved: OrderItemSnapshot[][] = [];
  const order = await service(saved).createForCustomer({
    userId: new ObjectId(),
    restaurantId,
    items: [
      { menuItemId: dosa, quantity: 1, notes: "No onion" },
      // The same dish twice is fine when the requests differ.
      { menuItemId: dosa, quantity: 2 },
    ],
  });
  assert.equal(saved[0]?.[0]?.notes, "No onion");
  assert.equal("notes" in (saved[0]?.[1] ?? {}), false);
  assert.equal(order.items[0]?.notes, "No onion");
});

test("an over-long request is refused and repeated identical lines still are", async () => {
  const saved: OrderItemSnapshot[][] = [];
  await assert.rejects(
    service(saved).createForCustomer({
      userId: new ObjectId(),
      restaurantId,
      items: [{ menuItemId: dosa, quantity: 1, notes: "x".repeat(ORDER_LINE_NOTE_MAX_LENGTH + 1) }],
    }),
    { statusCode: 400, code: "invalid_order_note" },
  );
  await assert.rejects(
    service(saved).createForCustomer({
      userId: new ObjectId(),
      restaurantId,
      items: [
        { menuItemId: dosa, quantity: 1, notes: "Extra crisp" },
        { menuItemId: dosa, quantity: 1, notes: "Extra crisp" },
      ],
    }),
    { code: "duplicate_order_item" },
  );
  assert.equal(saved.length, 0);
});
