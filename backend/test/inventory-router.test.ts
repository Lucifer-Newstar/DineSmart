import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createInventoryRouter } from "../src/inventory/inventory.router.js";
import { InventoryError } from "../src/inventory/inventory.service.js";
import type { InventoryItemRecord } from "../src/inventory/inventory.types.js";

const restaurantId = new ObjectId();
const anotherRestaurantId = new ObjectId();
const inventoryItemId = new ObjectId();
const item: InventoryItemRecord = {
  id: inventoryItemId,
  name: "Paneer",
  quantity: 2.4,
  unit: "kg",
  lowStockThreshold: 4,
  lastAdjustedAt: new Date("2026-10-10T12:00:00.000Z"),
};

async function getResponse(input: {
  principal: AuthPrincipal;
  method?: "GET" | "PUT";
  path: string;
  body?: unknown;
  token?: string;
}) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/inventory",
    createInventoryRouter({
      createRuntime: async () => ({
        service: {
          list: async () => ({ items: [item], truncated: false }),
          adjust: async (_restaurantId, _itemId, adjustment) => {
            if (adjustment.quantity === 0) {
              throw new InventoryError(
                404,
                "inventory_item_not_found",
                "The inventory item was not found.",
              );
            }
            return {
              ...item,
              quantity: adjustment.quantity,
              lowStockThreshold: adjustment.lowStockThreshold ?? item.lowStockThreshold,
            };
          },
        },
        verifyAccessToken: async (token) => {
          if (token !== "valid-inventory-token") throw new Error("invalid token");
          return input.principal;
        },
      }),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return await fetch(`http://127.0.0.1:${address.port}${input.path}`, {
      method: input.method ?? "GET",
      headers: {
        ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function principal(role: AuthPrincipal["role"], tenant = restaurantId): AuthPrincipal {
  return {
    userId: new ObjectId().toHexString(),
    role,
    restaurantId: role === "Customer" ? null : tenant.toHexString(),
  };
}

test("inventory GET returns stock details to managers and availability-only data to floor roles", async () => {
  const managerResponse = await getResponse({
    principal: principal("Manager"),
    path: "/api/v1/inventory",
    token: "valid-inventory-token",
  });
  assert.equal(managerResponse.status, 200);
  assert.deepEqual(await managerResponse.json(), {
    items: [
      {
        id: inventoryItemId.toHexString(),
        name: "Paneer",
        quantity: 2.4,
        unit: "kg",
        lowStockThreshold: 4,
        isLowStock: true,
        lastAdjustedAt: item.lastAdjustedAt.toISOString(),
      },
    ],
    truncated: false,
  });

  const receptionResponse = await getResponse({
    principal: principal("Reception"),
    path: "/api/v1/inventory",
    token: "valid-inventory-token",
  });
  assert.equal(receptionResponse.status, 200);
  const availabilityPayload = await receptionResponse.json();
  assert.deepEqual(availabilityPayload, {
    items: [{ id: inventoryItemId.toHexString(), name: "Paneer", availability: "low" }],
    truncated: false,
  });

  const kitchenResponse = await getResponse({
    principal: principal("Kitchen Staff"),
    path: "/api/v1/inventory",
    token: "valid-inventory-token",
  });
  assert.equal(kitchenResponse.status, 200);
  assert.deepEqual(await kitchenResponse.json(), availabilityPayload);
});

test("inventory writes require manager permissions and validate tenant, ID, and body", async () => {
  const path = `/api/v1/inventory/${inventoryItemId.toHexString()}`;
  const updated = await getResponse({
    principal: principal("Manager"),
    method: "PUT",
    path,
    body: { quantity: 8.5, lowStockThreshold: 5 },
    token: "valid-inventory-token",
  });
  assert.equal(updated.status, 200);
  const updatedPayload = (await updated.json()) as { item: InventoryItemRecord };
  assert.equal(updatedPayload.item.quantity, 8.5);
  assert.equal(updatedPayload.item.lowStockThreshold, 5);

  const receptionWrite = await getResponse({
    principal: principal("Reception"),
    method: "PUT",
    path,
    body: { quantity: 8.5 },
    token: "valid-inventory-token",
  });
  assert.equal(receptionWrite.status, 403);

  const mismatch = await getResponse({
    principal: principal("Manager"),
    path: `/api/v1/inventory?restaurantId=${anotherRestaurantId.toHexString()}`,
    token: "valid-inventory-token",
  });
  assert.equal(mismatch.status, 403);

  const invalidId = await getResponse({
    principal: principal("Manager"),
    method: "PUT",
    path: "/api/v1/inventory/not-an-object-id",
    body: { quantity: 8.5 },
    token: "valid-inventory-token",
  });
  assert.equal(invalidId.status, 400);

  const invalidBody = await getResponse({
    principal: principal("Manager"),
    method: "PUT",
    path,
    body: { quantity: -1 },
    token: "valid-inventory-token",
  });
  assert.equal(invalidBody.status, 400);
});

test("inventory writes return 404 for a scoped item that does not exist", async () => {
  const response = await getResponse({
    principal: principal("Manager"),
    method: "PUT",
    path: `/api/v1/inventory/${inventoryItemId.toHexString()}`,
    body: { quantity: 0 },
    token: "valid-inventory-token",
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: { code: "inventory_item_not_found", message: "The inventory item was not found." },
  });
});
