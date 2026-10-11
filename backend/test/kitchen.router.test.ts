import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createKitchenRouter } from "../src/orders/kitchen.router.js";
import type {
  KitchenQueueResult,
  StaffOrderServiceReader,
} from "../src/orders/order.staff.types.js";
import type { OrderRecord } from "../src/orders/order.types.js";

const orderId = new ObjectId();
const itemId = new ObjectId();
const restaurantId = new ObjectId();
const userId = new ObjectId();
const at = new Date("2026-10-11T06:00:00.000Z");

const queue: KitchenQueueResult = {
  tickets: [
    {
      id: orderId,
      status: "Accepted",
      items: [{ id: itemId, name: "Ghee podi dosa", quantity: 2, preparationStatus: "Created" }],
      createdAt: at,
      updatedAt: at,
    },
  ],
  truncated: true,
};

const updatedOrder: OrderRecord = {
  id: orderId,
  restaurantId,
  restaurantName: "Saffron & Co.",
  status: "Preparing",
  totalMinor: 57_000,
  currency: "INR",
  items: [
    {
      id: itemId,
      menuItemId: new ObjectId(),
      nameSnapshot: "Ghee podi dosa",
      unitPriceMinor: 28_500,
      quantity: 2,
      preparationStatus: "Preparing",
    },
  ],
  createdAt: at,
  updatedAt: new Date(at.getTime() + 1_000),
};

function principal(
  role: AuthPrincipal["role"] = "Kitchen Staff",
  tenantId = restaurantId,
): AuthPrincipal {
  return {
    userId: userId.toHexString(),
    role,
    restaurantId: role === "Customer" ? null : tenantId.toHexString(),
  };
}

async function request(input: {
  method?: "GET" | "PUT";
  path: string;
  body?: unknown;
  token?: string;
  role?: AuthPrincipal["role"];
  scopeRestaurantId?: ObjectId;
}) {
  const calls: {
    listRestaurantId?: ObjectId;
    update?: {
      restaurantId: ObjectId;
      orderId: ObjectId;
      itemId: ObjectId;
      status: string;
    };
  } = {};
  const service: StaffOrderServiceReader = {
    listRestaurantOrders: async () => ({ orders: [], truncated: false }),
    listKitchenQueue: async (tenantId) => {
      calls.listRestaurantId = tenantId;
      return queue;
    },
    updateOrderStatus: async () => updatedOrder,
    updateItemPreparationStatus: async (tenantId, order, item, status) => {
      calls.update = { restaurantId: tenantId, orderId: order, itemId: item, status };
      return { ...updatedOrder, restaurantId: tenantId, id: order };
    },
  };

  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/kitchen",
    createKitchenRouter({
      createRuntime: async () => ({
        service,
        verifyAccessToken: async (token) => {
          if (token !== "valid-kitchen-token") throw new Error("invalid token");
          return principal(input.role, input.scopeRestaurantId);
        },
      }),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}${input.path}`, {
      method: input.method ?? "GET",
      headers: {
        ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    return { response, calls };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("kitchen queue is tenant-scoped and omits customer and price data", async () => {
  const tenantId = new ObjectId();
  const { response, calls } = await request({
    path: "/api/v1/kitchen/queue",
    token: "valid-kitchen-token",
    role: "Kitchen Staff",
    scopeRestaurantId: tenantId,
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    orders: [
      {
        id: orderId.toHexString(),
        status: "Accepted",
        items: [
          {
            id: itemId.toHexString(),
            name: "Ghee podi dosa",
            quantity: 2,
            preparationStatus: "Created",
          },
        ],
        createdAt: at.toISOString(),
        updatedAt: at.toISOString(),
      },
    ],
    truncated: true,
  });
  assert.equal(JSON.stringify(payload).includes("unitPriceMinor"), false);
  assert.equal(calls.listRestaurantId?.toHexString(), tenantId.toHexString());
});

test("kitchen item update accepts only the next item state and uses signed tenant", async () => {
  const tenantId = new ObjectId();
  const { response, calls } = await request({
    method: "PUT",
    path: `/api/v1/kitchen/queue/${orderId.toHexString()}`,
    token: "valid-kitchen-token",
    role: "Kitchen Staff",
    scopeRestaurantId: tenantId,
    body: { itemId: itemId.toHexString(), preparationStatus: "Preparing" },
  });

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    order: { id: string; status: string; items: Array<{ preparationStatus: string }> };
  };
  assert.equal(payload.order.id, orderId.toHexString());
  assert.equal(payload.order.status, "Preparing");
  assert.equal(payload.order.items[0].preparationStatus, "Preparing");
  assert.equal(calls.update?.restaurantId.toHexString(), tenantId.toHexString());
  assert.equal(calls.update?.orderId.toHexString(), orderId.toHexString());
  assert.equal(calls.update?.itemId.toHexString(), itemId.toHexString());
  assert.equal(calls.update?.status, "Preparing");
  assert.equal(JSON.stringify(payload).includes("unitPriceMinor"), false);
});

test("kitchen routes deny unauthorized roles and reject malformed or forged updates", async () => {
  const unauthenticated = await request({ path: "/api/v1/kitchen/queue" });
  assert.equal(unauthenticated.response.status, 401);

  const reception = await request({
    path: "/api/v1/kitchen/queue",
    token: "valid-kitchen-token",
    role: "Reception",
  });
  assert.equal(reception.response.status, 403);
  assert.equal(reception.calls.listRestaurantId, undefined);

  const forged = await request({
    method: "PUT",
    path: `/api/v1/kitchen/queue/${orderId.toHexString()}`,
    token: "valid-kitchen-token",
    body: {
      itemId: itemId.toHexString(),
      preparationStatus: "Ready",
      restaurantId: new ObjectId().toHexString(),
    },
  });
  assert.equal(forged.response.status, 403);
  assert.equal(forged.calls.update, undefined);

  const created = await request({
    method: "PUT",
    path: `/api/v1/kitchen/queue/${orderId.toHexString()}`,
    token: "valid-kitchen-token",
    body: { itemId: itemId.toHexString(), preparationStatus: "Created" },
  });
  assert.equal(created.response.status, 400);
  assert.equal(created.calls.update, undefined);
});
