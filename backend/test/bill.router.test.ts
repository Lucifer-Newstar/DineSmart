import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createBillRouter } from "../src/bills/bill.router.js";
import { BillError } from "../src/bills/bill.service.js";
import type { BillRecord, BillServiceReader } from "../src/bills/bill.types.js";

const userId = new ObjectId();
const restaurantId = new ObjectId();
const otherRestaurantId = new ObjectId();
const orderId = new ObjectId();
const billId = new ObjectId();
const now = new Date("2026-10-11T08:00:00.000Z");
const bill: BillRecord = {
  id: billId,
  restaurantId,
  orderId,
  lineItems: [{ nameSnapshot: "Ghee podi dosa", quantity: 2, unitPriceMinor: 28_500 }],
  subtotalMinor: 57_000,
  taxMinor: 0,
  adjustmentsMinor: 0,
  totalMinor: 57_000,
  currency: "INR",
  status: "issued",
  createdAt: now,
  updatedAt: now,
};

function principal(role: AuthPrincipal["role"] = "Manager"): AuthPrincipal {
  return {
    userId: userId.toHexString(),
    role,
    restaurantId: role === "Customer" ? null : restaurantId.toHexString(),
  };
}

async function send(input: {
  method?: "GET" | "POST";
  path: string;
  body?: unknown;
  token?: string;
  principal?: AuthPrincipal;
  created?: boolean;
  serviceError?: Error;
}) {
  const calls: {
    generate?: { restaurantId: ObjectId; orderId: ObjectId };
    getRestaurant?: { billId: ObjectId; restaurantId: ObjectId };
    getByOrderRestaurant?: { orderId: ObjectId; restaurantId: ObjectId };
    getCustomer?: { userId: ObjectId; billId: ObjectId };
    getByOrderCustomer?: { userId: ObjectId; orderId: ObjectId };
  } = {};
  const maybeThrow = () => {
    if (input.serviceError) throw input.serviceError;
  };
  const service: BillServiceReader = {
    async generateForRestaurant(scopedRestaurantId, scopedOrderId) {
      calls.generate = { restaurantId: scopedRestaurantId, orderId: scopedOrderId };
      maybeThrow();
      return { bill, created: input.created ?? true };
    },
    async getForRestaurant(scopedBillId, scopedRestaurantId) {
      calls.getRestaurant = { billId: scopedBillId, restaurantId: scopedRestaurantId };
      maybeThrow();
      return bill;
    },
    async getByOrderForRestaurant(scopedOrderId, scopedRestaurantId) {
      calls.getByOrderRestaurant = { orderId: scopedOrderId, restaurantId: scopedRestaurantId };
      maybeThrow();
      return bill;
    },
    async getForCustomer(scopedUserId, scopedBillId) {
      calls.getCustomer = { userId: scopedUserId, billId: scopedBillId };
      maybeThrow();
      return bill;
    },
    async getByOrderForCustomer(scopedUserId, scopedOrderId) {
      calls.getByOrderCustomer = { userId: scopedUserId, orderId: scopedOrderId };
      maybeThrow();
      return bill;
    },
  };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/bills",
    createBillRouter({
      createRuntime: async () => ({
        service,
        verifyAccessToken: async (token) => {
          if (token !== "valid-bill-token") throw new Error("invalid token");
          return input.principal ?? principal();
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
        ...(input.token === undefined
          ? { authorization: "Bearer valid-bill-token" }
          : input.token
            ? { authorization: `Bearer ${input.token}` }
            : {}),
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

test("POST /bills creates for the signed restaurant and returns a no-store bill", async () => {
  const { response, calls } = await send({
    method: "POST",
    path: "/api/v1/bills",
    body: { orderId: orderId.toHexString() },
    principal: principal("Manager"),
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls.generate, { restaurantId, orderId });
  assert.deepEqual(await response.json(), {
    bill: {
      id: billId.toHexString(),
      restaurantId: restaurantId.toHexString(),
      orderId: orderId.toHexString(),
      lineItems: [{ name: "Ghee podi dosa", quantity: 2, unitPriceMinor: 28_500 }],
      subtotalMinor: 57_000,
      taxMinor: 0,
      adjustmentsMinor: 0,
      totalMinor: 57_000,
      currency: "INR",
      status: "issued",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  });
});

test("POST /bills reports idempotent generation as 200", async () => {
  const { response } = await send({
    method: "POST",
    path: "/api/v1/bills",
    body: { orderId: orderId.toHexString() },
    created: false,
  });
  assert.equal(response.status, 200);
});

test("staff bill retrieval is tenant-scoped while Customer routes use own-user service methods", async () => {
  const byId = await send({
    path: `/api/v1/bills/${billId.toHexString()}`,
    principal: principal("Administrator"),
  });
  assert.equal(byId.response.status, 200);
  assert.deepEqual(byId.calls.getRestaurant, { billId, restaurantId });

  const byOrder = await send({ path: `/api/v1/bills/order/${orderId.toHexString()}` });
  assert.equal(byOrder.response.status, 200);
  assert.deepEqual(byOrder.calls.getByOrderRestaurant, { orderId, restaurantId });

  const customerById = await send({
    path: `/api/v1/bills/${billId.toHexString()}`,
    principal: principal("Customer"),
  });
  assert.equal(customerById.response.status, 200);
  assert.deepEqual(customerById.calls.getCustomer, { userId, billId });

  const customerByOrder = await send({
    path: `/api/v1/bills/order/${orderId.toHexString()}`,
    principal: principal("Customer"),
  });
  assert.equal(customerByOrder.response.status, 200);
  assert.deepEqual(customerByOrder.calls.getByOrderCustomer, { userId, orderId });
});

test("billing writes and reads enforce the existing role matrix", async () => {
  for (const role of ["Customer", "Reception", "Kitchen Staff"] as const) {
    const response = await send({
      method: "POST",
      path: "/api/v1/bills",
      body: { orderId: orderId.toHexString() },
      principal: principal(role),
    });
    assert.equal(response.response.status, 403, `${role} cannot issue bills`);
    assert.equal(response.calls.generate, undefined);
  }

  for (const role of ["Reception", "Kitchen Staff"] as const) {
    const response = await send({
      path: `/api/v1/bills/${billId.toHexString()}`,
      principal: principal(role),
    });
    assert.equal(response.response.status, 403, `${role} cannot read bills`);
    assert.equal(response.calls.getRestaurant, undefined);
  }
});

test("billing routes reject missing credentials, client tenant scope, query filters, and extra fields", async () => {
  const unauthenticated = await send({ path: `/api/v1/bills/${billId.toHexString()}`, token: "" });
  assert.equal(unauthenticated.response.status, 401);

  const crossTenantQuery = await send({
    path: `/api/v1/bills/${billId.toHexString()}?restaurantId=${otherRestaurantId.toHexString()}`,
  });
  assert.equal(crossTenantQuery.response.status, 400);

  const crossTenantBody = await send({
    method: "POST",
    path: "/api/v1/bills",
    body: { orderId: orderId.toHexString(), restaurantId: otherRestaurantId.toHexString() },
  });
  assert.equal(crossTenantBody.response.status, 403);

  const extraBodyField = await send({
    method: "POST",
    path: "/api/v1/bills",
    body: { orderId: orderId.toHexString(), totalMinor: 1 },
  });
  assert.equal(extraBodyField.response.status, 400);
  assert.equal(extraBodyField.calls.generate, undefined);

  const queryOnPost = await send({
    method: "POST",
    path: `/api/v1/bills?orderId=${orderId.toHexString()}`,
    body: { orderId: orderId.toHexString() },
  });
  assert.equal(queryOnPost.response.status, 400);
});

test("billing routes validate path/body IDs and require a scoped staff principal", async () => {
  const invalidBillId = await send({ path: "/api/v1/bills/not-an-id" });
  assert.equal(invalidBillId.response.status, 400);

  const invalidOrderId = await send({ path: "/api/v1/bills/order/not-an-id" });
  assert.equal(invalidOrderId.response.status, 400);

  const invalidBody = await send({ method: "POST", path: "/api/v1/bills", body: {} });
  assert.equal(invalidBody.response.status, 400);

  const missingTenant = await send({
    method: "POST",
    path: "/api/v1/bills",
    body: { orderId: orderId.toHexString() },
    principal: { ...principal("Manager"), restaurantId: null },
  });
  assert.equal(missingTenant.response.status, 403);

  const invalidPrincipal = await send({
    path: `/api/v1/bills/${billId.toHexString()}`,
    principal: { ...principal("Manager"), restaurantId: "not-an-id" },
  });
  assert.equal(invalidPrincipal.response.status, 401);
});

test("bill service errors retain their status and unexpected failures fail closed", async () => {
  const notBillable = await send({
    method: "POST",
    path: "/api/v1/bills",
    body: { orderId: orderId.toHexString() },
    serviceError: new BillError(409, "bill_order_not_ready", "Not billable."),
  });
  assert.equal(notBillable.response.status, 409);

  const unexpected = await send({
    path: `/api/v1/bills/${billId.toHexString()}`,
    serviceError: new Error("internal detail"),
  });
  assert.equal(unexpected.response.status, 503);
  assert.deepEqual(await unexpected.response.json(), {
    error: { code: "bill_unavailable", message: "Bills are temporarily unavailable." },
  });
});
