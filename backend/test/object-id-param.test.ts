import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import { test } from "node:test";
import { SignJWT } from "jose";
import type { Db } from "mongodb";
import { createApp } from "../src/app.js";
import { ACCESS_TOKEN_AUDIENCE, ACCESS_TOKEN_ISSUER } from "../src/auth/auth.service.js";
import type { UserRole } from "../src/database/schema.js";
import { isObjectIdString, parseObjectId } from "../src/http/object-id-param.js";

const JWT_SECRET = "local-test-secret-with-sufficient-length";
const RESTAURANT_ID = "64b000000000000000000001";
const USER_ID = "64b000000000000000000002";

/** Every :id route in the API, the role allowed to reach it, and its 400 code. */
const ID_ROUTES: ReadonlyArray<{
  method: string;
  path: (id: string) => string;
  role: UserRole;
  code: string;
  body?: unknown;
}> = [
  {
    method: "POST",
    path: (id) => `/api/v1/incidents/${id}/recommendations`,
    role: "Manager",
    code: "invalid_incident_reference",
  },
  {
    method: "GET",
    path: (id) => `/api/v1/bills/order/${id}`,
    role: "Manager",
    code: "invalid_order_id",
  },
  { method: "GET", path: (id) => `/api/v1/bills/${id}`, role: "Manager", code: "invalid_bill_id" },
  {
    method: "PUT",
    path: (id) => `/api/v1/inventory/${id}`,
    role: "Manager",
    code: "invalid_inventory_id",
    body: { quantity: 1 },
  },
  {
    method: "PATCH",
    path: (id) => `/api/v1/notifications/${id}/read`,
    role: "Manager",
    code: "invalid_notification_id",
  },
  {
    method: "PUT",
    path: (id) => `/api/v1/kitchen/queue/${id}`,
    role: "Kitchen Staff",
    code: "invalid_order_id",
    body: { status: "preparing" },
  },
  {
    method: "PUT",
    path: (id) => `/api/v1/orders/${id}/cancel`,
    role: "Customer",
    code: "invalid_order_id",
  },
  {
    method: "PATCH",
    path: (id) => `/api/v1/orders/${id}/status`,
    role: "Reception",
    code: "invalid_order_id",
    body: { status: "served" },
  },
  {
    method: "PUT",
    path: (id) => `/api/v1/reservations/${id}`,
    role: "Reception",
    code: "invalid_reservation_id",
    body: { status: "cancelled" },
  },
  {
    method: "PUT",
    path: (id) => `/api/v1/staff/${id}`,
    role: "Manager",
    code: "invalid_staff_id",
    body: { role: "Reception" },
  },
  {
    method: "PUT",
    path: (id) => `/api/v1/tables/${id}/status`,
    role: "Reception",
    code: "invalid_table_id",
    body: { status: "available" },
  },
  {
    method: "PUT",
    path: (id) => `/api/v1/waitlist/${id}`,
    role: "Reception",
    code: "invalid_waitlist_id",
    body: { status: "cancelled" },
  },
];

const MALFORMED_IDS = ["not-an-id", "123", "64b00000000000000000000z", `${"a".repeat(24)}0`, "%00"];

async function accessToken(role: UserRole): Promise<string> {
  return new SignJWT({ role, restaurantId: role === "Customer" ? null : RESTAURANT_ID })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(USER_ID)
    .setIssuer(ACCESS_TOKEN_ISSUER)
    .setAudience(ACCESS_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function withServer(run: (baseUrl: string) => Promise<void>): Promise<void> {
  // Collections can be built, but any query fails loudly, so a 400 proves the
  // id was rejected before the database was asked anything.
  const unreachable = new Proxy(
    {},
    {
      get: () => () => {
        throw new Error("the database must not be queried for a malformed id");
      },
    },
  );
  const db = { collection: () => unreachable } as unknown as Db;
  const api = createApp({
    getDatabase: async () => db,
    getJwtSecret: () => JWT_SECRET,
    webOrigin: "http://127.0.0.1:3000",
    nodeEnvironment: "test",
  });
  const server: Server = api.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("isObjectIdString and parseObjectId accept only canonical 24-character hex", () => {
  assert.equal(isObjectIdString("64b000000000000000000001"), true);
  assert.equal(isObjectIdString("64B000000000000000000001"), true);
  for (const value of [...MALFORMED_IDS, "", null, undefined, 42, ["64b000000000000000000001"]]) {
    assert.equal(isObjectIdString(value), false, `${String(value)} must be rejected`);
    assert.equal(parseObjectId(value), null);
  }
  assert.equal(
    parseObjectId("64b000000000000000000001")?.toHexString(),
    "64b000000000000000000001",
  );
});

test("every :id route answers a malformed id with its 400 error contract", async () => {
  await withServer(async (baseUrl) => {
    for (const route of ID_ROUTES) {
      const token = await accessToken(route.role);
      for (const badId of MALFORMED_IDS) {
        const response = await fetch(`${baseUrl}${route.path(badId)}`, {
          method: route.method,
          headers: {
            authorization: `Bearer ${token}`,
            ...(route.body ? { "content-type": "application/json" } : {}),
          },
          body: route.body ? JSON.stringify(route.body) : undefined,
        });
        const label = `${route.method} ${route.path(badId)}`;
        assert.equal(response.status, 400, label);
        const payload = (await response.json()) as { error?: { code?: string; message?: string } };
        assert.equal(payload.error?.code, route.code, label);
        assert.equal(typeof payload.error?.message, "string", label);
      }
    }
  });
});

test("a malformed id never hides the 401 for an anonymous caller", async () => {
  await withServer(async (baseUrl) => {
    for (const route of ID_ROUTES) {
      const response = await fetch(`${baseUrl}${route.path("not-an-id")}`, {
        method: route.method,
      });
      assert.equal(response.status, 401, `${route.method} ${route.path("not-an-id")}`);
    }
  });
});

test("a malformed id never hides the 403 for a role without the permission", async () => {
  await withServer(async (baseUrl) => {
    const token = await accessToken("Kitchen Staff");
    for (const route of ID_ROUTES.filter((candidate) => candidate.role !== "Kitchen Staff")) {
      const response = await fetch(`${baseUrl}${route.path("not-an-id")}`, {
        method: route.method,
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(response.status, 403, `${route.method} ${route.path("not-an-id")}`);
    }
  });
});
