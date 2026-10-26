import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { OrderService } from "../src/orders/order.service.js";
import type { NewOrder, OrderRepository } from "../src/orders/order.types.js";

const restaurantId = new ObjectId();
const tableId = new ObjectId();
const menuItemId = new ObjectId();
const now = new Date("2026-10-26T07:00:00.000Z");

function repository(created: NewOrder[]): OrderRepository {
  return {
    getCustomerIdForUser: async () => new ObjectId(),
    getActiveRestaurant: async () => ({ id: restaurantId, name: "Saffron & Co.", currency: "INR" }),
    getAvailableMenuItems: async () => [
      { id: menuItemId, name: "Masala dosa", priceMinor: 18_000 },
    ],
    createOrder: async (order, items) => {
      created.push(order);
      return {
        id: new ObjectId(),
        restaurantId: order.restaurantId,
        restaurantName: "Restaurant",
        status: "Created",
        totalMinor: order.totalMinor,
        currency: order.currency,
        items: items.map((item) => ({ ...item, id: new ObjectId() })),
        ...(order.tableId ? { tableId: order.tableId } : {}),
        createdAt: now,
        updatedAt: now,
      };
    },
    listForCustomer: async () => ({ orders: [], truncated: false }),
    findForCustomer: async () => null,
    cancelForCustomer: async () => null,
  };
}

const resolver = async (token: string) => {
  if (token === "good") return { restaurantId, tableId, tableNumber: "04" };
  if (token === "elsewhere") return { restaurantId: new ObjectId(), tableId, tableNumber: "09" };
  throw new Error("invalid");
};

const request = (tableToken?: string) => ({
  userId: new ObjectId(),
  restaurantId,
  items: [{ menuItemId, quantity: 1 }],
  ...(tableToken === undefined ? {} : { tableToken }),
});

test("an order from a valid table link carries that table", async () => {
  const created: NewOrder[] = [];
  const service = new OrderService(
    repository(created),
    () => now,
    undefined,
    undefined,
    undefined,
    resolver,
  );
  const order = await service.createForCustomer(request("good"));
  assert.ok(created[0]?.tableId?.equals(tableId));
  assert.ok(order.tableId?.equals(tableId));
  assert.equal(order.tableNumber, "04");

  const takeaway = await service.createForCustomer(request());
  assert.equal(created[1]?.tableId, undefined);
  assert.equal(takeaway.tableNumber, undefined);
});

test("a tampered or foreign table link is refused before anything is written", async () => {
  const created: NewOrder[] = [];
  const service = new OrderService(
    repository(created),
    () => now,
    undefined,
    undefined,
    undefined,
    resolver,
  );
  await assert.rejects(service.createForCustomer(request("tampered")), {
    statusCode: 400,
    code: "invalid_table_token",
  });
  await assert.rejects(service.createForCustomer(request("elsewhere")), {
    statusCode: 400,
    code: "invalid_table_token",
  });
  assert.equal(created.length, 0);
  await assert.rejects(new OrderService(repository(created)).createForCustomer(request("good")), {
    statusCode: 503,
  });
});
