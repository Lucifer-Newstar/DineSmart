import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createOrderRouter } from "../src/orders/order.router.js";
import type {
  NewCustomerOrderRequest,
  OrderListResult,
  OrderRecord,
  OrderServiceReader,
} from "../src/orders/order.types.js";

const orderId = new ObjectId();
const restaurantId = new ObjectId();
const userId = new ObjectId();
const menuItemId = new ObjectId();
const at = new Date("2026-10-11T06:00:00.000Z");

const order: OrderRecord = {
  id: orderId,
  restaurantId,
  restaurantName: "Saffron & Co.",
  status: "Created",
  totalMinor: 28_500,
  currency: "INR",
  items: [
    {
      id: new ObjectId(),
      menuItemId,
      nameSnapshot: "Ghee podi dosa",
      unitPriceMinor: 28_500,
      quantity: 1,
      preparationStatus: "Created",
    },
  ],
  createdAt: at,
  updatedAt: at,
};

function principal(role: AuthPrincipal["role"] = "Customer"): AuthPrincipal {
  return {
    userId: userId.toHexString(),
    role,
    restaurantId: role === "Customer" ? null : restaurantId.toHexString(),
  };
}

async function getResponse(input: {
  method?: "GET" | "POST" | "PUT";
  path: string;
  body?: unknown;
  token?: string;
  role?: AuthPrincipal["role"];
  listResult?: OrderListResult;
}) {
  const calls: {
    create?: NewCustomerOrderRequest;
    listUserId?: ObjectId;
    cancel?: { userId: ObjectId; orderId: ObjectId };
  } = {};
  const service: OrderServiceReader = {
    createForCustomer: async (request) => {
      calls.create = request;
      return order;
    },
    listForCustomer: async (id) => {
      calls.listUserId = id;
      return input.listResult ?? { orders: [order], truncated: false };
    },
    cancelForCustomer: async (user, id) => {
      calls.cancel = { userId: user, orderId: id };
      return { ...order, status: "Cancelled", updatedAt: new Date(at.getTime() + 1_000) };
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/orders",
    createOrderRouter({
      createRuntime: async () => ({
        service,
        verifyAccessToken: async (token) => {
          if (token !== "valid-order-token") throw new Error("invalid token");
          return principal(input.role);
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

test("customer creates an order using only submitted restaurant and item selections", async () => {
  const { response, calls } = await getResponse({
    method: "POST",
    path: "/api/v1/orders",
    body: {
      restaurantId: restaurantId.toHexString(),
      items: [{ menuItemId: menuItemId.toHexString(), quantity: 1 }],
    },
    token: "valid-order-token",
  });

  assert.equal(response.status, 201);
  const payload = (await response.json()) as {
    order: {
      id: string;
      status: string;
      totalMinor: number;
      items: Array<{ name: string; unitPriceMinor: number; quantity: number }>;
    };
  };
  assert.equal(payload.order.id, orderId.toHexString());
  assert.equal(payload.order.status, "Created");
  assert.equal(payload.order.totalMinor, 28_500);
  assert.deepEqual(payload.order.items, [
    {
      id: order.items[0].id.toHexString(),
      menuItemId: menuItemId.toHexString(),
      name: "Ghee podi dosa",
      unitPriceMinor: 28_500,
      quantity: 1,
    },
  ]);
  assert.equal(calls.create?.userId.toHexString(), userId.toHexString());
  assert.equal(calls.create?.restaurantId.toHexString(), restaurantId.toHexString());
});

test("customer history serializes a bounded list and truncation indicator", async () => {
  const { response, calls } = await getResponse({
    path: "/api/v1/orders/history",
    token: "valid-order-token",
    listResult: { orders: [order], truncated: true },
  });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { orders: Array<{ id: string }>; truncated: boolean };
  assert.equal(payload.orders[0].id, orderId.toHexString());
  assert.equal(payload.truncated, true);
  assert.equal(calls.listUserId?.toHexString(), userId.toHexString());
});

test("customer cancellation accepts an empty PUT and returns the changed order", async () => {
  const { response, calls } = await getResponse({
    method: "PUT",
    path: `/api/v1/orders/${orderId.toHexString()}/cancel`,
    token: "valid-order-token",
  });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { order: { status: string } };
  assert.equal(payload.order.status, "Cancelled");
  assert.equal(calls.cancel?.userId.toHexString(), userId.toHexString());
  assert.equal(calls.cancel?.orderId.toHexString(), orderId.toHexString());
});

test("order routes reject unauthenticated, non-Customer, and malformed requests", async () => {
  const unauthenticated = await getResponse({
    method: "GET",
    path: "/api/v1/orders/history",
  });
  assert.equal(unauthenticated.response.status, 401);

  const staff = await getResponse({
    method: "GET",
    path: "/api/v1/orders/history",
    token: "valid-order-token",
    role: "Kitchen Staff",
  });
  assert.equal(staff.response.status, 403);
  assert.equal(staff.calls.listUserId, undefined);

  const malformed = await getResponse({
    method: "POST",
    path: "/api/v1/orders",
    token: "valid-order-token",
    body: {
      userId: new ObjectId().toHexString(),
      restaurantId: restaurantId.toHexString(),
      items: [{ menuItemId: menuItemId.toHexString(), quantity: 1 }],
    },
  });
  assert.equal(malformed.response.status, 400);
  assert.equal(malformed.calls.create, undefined);

  const badOrderId = await getResponse({
    method: "PUT",
    path: "/api/v1/orders/not-an-object-id/cancel",
    token: "valid-order-token",
  });
  assert.equal(badOrderId.response.status, 400);
});
