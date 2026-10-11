import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createStaffOrderRouter } from "../src/orders/order.staff.router.js";
import type {
  KitchenQueueResult,
  StaffOrderListResult,
  StaffOrderServiceReader,
  StaffOrderView,
} from "../src/orders/order.staff.types.js";
import type { OrderRecord } from "../src/orders/order.types.js";

const orderId = new ObjectId();
const restaurantId = new ObjectId();
const userId = new ObjectId();
const at = new Date("2026-10-11T06:00:00.000Z");
const itemId = new ObjectId();
const order: OrderRecord = {
  id: orderId,
  restaurantId,
  restaurantName: "Saffron & Co.",
  status: "Created",
  totalMinor: 28_500,
  currency: "INR",
  items: [
    {
      id: itemId,
      menuItemId: new ObjectId(),
      nameSnapshot: "Ghee podi dosa",
      unitPriceMinor: 28_500,
      quantity: 1,
      preparationStatus: "Created",
    },
  ],
  createdAt: at,
  updatedAt: at,
};

function principal(role: AuthPrincipal["role"] = "Reception", tenantId = restaurantId) {
  return {
    userId: userId.toHexString(),
    role,
    restaurantId: role === "Customer" ? null : tenantId.toHexString(),
  } satisfies AuthPrincipal;
}

async function request(input: {
  body?: unknown;
  token?: string;
  role?: AuthPrincipal["role"];
  scopeRestaurantId?: ObjectId;
  method?: "GET" | "PATCH";
  path?: string;
}) {
  const calls: Array<{ restaurantId: ObjectId; orderId: ObjectId; status: string }> = [];
  const listCalls: Array<{ restaurantId: ObjectId; view: StaffOrderView }> = [];
  const service: StaffOrderServiceReader = {
    listRestaurantOrders: async (tenant, view): Promise<StaffOrderListResult> => {
      listCalls.push({ restaurantId: tenant, view });
      return { orders: [{ ...order, restaurantId: tenant }], truncated: false };
    },
    listKitchenQueue: async (): Promise<KitchenQueueResult> => ({ tickets: [], truncated: false }),
    updateOrderStatus: async (tenant, id, status) => {
      calls.push({ restaurantId: tenant, orderId: id, status });
      return { ...order, restaurantId: tenant, id, status };
    },
    updateItemPreparationStatus: async () => order,
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/orders",
    createStaffOrderRouter({
      createRuntime: async () => ({
        service,
        verifyAccessToken: async (token) => {
          if (token !== "valid-staff-order-token") throw new Error("invalid token");
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
    const response = await fetch(
      `http://127.0.0.1:${address.port}${input.path ?? `/api/v1/orders/${orderId.toHexString()}/status`}`,
      {
        method: input.method ?? "PATCH",
        headers: {
          ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
          ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      },
    );
    return { response, calls, listCalls };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("staff order feed derives signed tenant scope and limits kitchen status results", async () => {
  for (const role of ["Reception", "Manager", "Administrator", "Kitchen Staff"] as const) {
    const tenantId = new ObjectId();
    const { response, listCalls } = await request({
      method: "GET",
      path: "/api/v1/orders",
      token: "valid-staff-order-token",
      role,
      scopeRestaurantId: tenantId,
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      orders: Array<{
        id: string;
        status: string;
        items: Array<{ id: string; name: string; preparationStatus: string }>;
      }>;
      truncated: boolean;
    };
    assert.equal(payload.orders.length, 1);
    assert.equal(payload.orders[0].id, orderId.toHexString());
    assert.equal(payload.orders[0].items[0].name, "Ghee podi dosa");
    assert.equal(payload.truncated, false);
    assert.equal(JSON.stringify(payload).includes("unitPriceMinor"), false);
    assert.equal(JSON.stringify(payload).includes("totalMinor"), false);
    assert.equal(JSON.stringify(payload).includes("customerId"), false);
    assert.equal(JSON.stringify(payload).includes("restaurantId"), false);
    assert.deepEqual(listCalls, [
      { restaurantId: tenantId, view: role === "Kitchen Staff" ? "kitchen" : "floor" },
    ]);
  }

  const unauthenticated = await request({ method: "GET", path: "/api/v1/orders" });
  assert.equal(unauthenticated.response.status, 401);
  assert.equal(unauthenticated.listCalls.length, 0);

  const customer = await request({
    method: "GET",
    path: "/api/v1/orders",
    token: "valid-staff-order-token",
    role: "Customer",
  });
  assert.equal(customer.response.status, 403);
  assert.equal(customer.listCalls.length, 0);

  const filtered = await request({
    method: "GET",
    path: "/api/v1/orders?status=Completed",
    token: "valid-staff-order-token",
    role: "Reception",
  });
  assert.equal(filtered.response.status, 400);
  assert.equal(filtered.listCalls.length, 0);
});

test("Reception progresses an order using the signed restaurant scope and safe response fields", async () => {
  const tenantId = new ObjectId();
  const { response, calls } = await request({
    token: "valid-staff-order-token",
    role: "Reception",
    scopeRestaurantId: tenantId,
    body: { status: "Accepted" },
  });

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    order: { id: string; status: string; items: Array<{ preparationStatus: string }> };
  };
  assert.equal(payload.order.id, orderId.toHexString());
  assert.equal(payload.order.status, "Accepted");
  assert.equal(payload.order.items[0].preparationStatus, "Created");
  assert.equal(JSON.stringify(payload).includes("unitPriceMinor"), false);
  assert.equal(JSON.stringify(payload).includes("totalMinor"), false);
  assert.deepEqual(calls, [{ restaurantId: tenantId, orderId, status: "Accepted" }]);
});

test("staff order lifecycle rejects unauthenticated, unauthorized, invalid, and forged requests", async () => {
  const unauthenticated = await request({ body: { status: "Accepted" } });
  assert.equal(unauthenticated.response.status, 401);

  for (const role of ["Customer", "Kitchen Staff"] as const) {
    const denied = await request({
      token: "valid-staff-order-token",
      role,
      body: { status: "Accepted" },
    });
    assert.equal(denied.response.status, 403);
    assert.equal(denied.calls.length, 0);
  }

  const invalidTarget = await request({
    token: "valid-staff-order-token",
    body: { status: "Preparing" },
  });
  assert.equal(invalidTarget.response.status, 400);
  assert.equal(invalidTarget.calls.length, 0);

  const forgedTenant = await request({
    token: "valid-staff-order-token",
    body: { status: "Accepted", restaurantId: new ObjectId().toHexString() },
  });
  assert.equal(forgedTenant.response.status, 403);
  assert.equal(forgedTenant.calls.length, 0);
});
