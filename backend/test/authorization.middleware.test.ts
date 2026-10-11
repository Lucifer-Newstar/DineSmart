import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import {
  ROLE_PERMISSIONS,
  requirePermissions,
  requireResourceOwner,
  requireRestaurantScope,
} from "../src/auth/authorization.middleware.js";

async function withServer<T>(
  app: express.Express,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function appFor(principal: AuthPrincipal | undefined): express.Express {
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.auth = principal;
    next();
  });
  app.get("/manager", requirePermissions("incidents:resolve"), (_request, response) => {
    response.status(200).json({ allowed: true });
  });
  app.patch(
    "/notifications/:id/read",
    requirePermissions("notifications:own:update"),
    (_request, response) => {
      response.status(200).json({ allowed: true });
    },
  );
  app.post("/restaurants/:restaurantId/orders", requireRestaurantScope(), (_request, response) => {
    response.status(201).json({ allowed: true });
  });
  app.post("/orders/:orderId", requireResourceOwner("customer-user"), (_request, response) => {
    response.status(200).json({ allowed: true });
  });
  return app;
}

const manager: AuthPrincipal = {
  userId: "manager-user",
  role: "Manager",
  restaurantId: "111111111111111111111111",
};

const customer: AuthPrincipal = {
  userId: "customer-user",
  role: "Customer",
  restaurantId: null,
};

test("role permission matrix follows the MVP role boundaries", () => {
  assert.ok(ROLE_PERMISSIONS.Manager.includes("incidents:resolve"));
  assert.ok(ROLE_PERMISSIONS.Administrator.includes("staff:write"));
  assert.ok(ROLE_PERMISSIONS.Reception.includes("waitlist:write"));
  assert.ok(ROLE_PERMISSIONS.Reception.includes("orders:write"));
  assert.ok(ROLE_PERMISSIONS["Kitchen Staff"].includes("kitchen:queue:update"));
  assert.ok(ROLE_PERMISSIONS.Customer.includes("orders:own:create"));
  assert.ok(ROLE_PERMISSIONS.Customer.includes("notifications:own:update"));
  assert.ok(ROLE_PERMISSIONS.Reception.includes("notifications:own:update"));
  assert.ok(ROLE_PERMISSIONS.Manager.includes("notifications:own:update"));
  assert.ok(!ROLE_PERMISSIONS["Kitchen Staff"].includes("notifications:own:update"));
  assert.ok(!ROLE_PERMISSIONS["Kitchen Staff"].includes("inventory:write"));
  assert.ok(!ROLE_PERMISSIONS.Customer.includes("incidents:resolve"));
});

test("permission middleware returns 401 without a principal and 403 for an unauthorized role", async () => {
  await withServer(appFor(undefined), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/manager`);
    assert.equal(response.status, 401);
  });

  const kitchen: AuthPrincipal = {
    userId: "kitchen-user",
    role: "Kitchen Staff",
    restaurantId: manager.restaurantId,
  };
  await withServer(appFor(kitchen), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/manager`);
    assert.equal(response.status, 403);
    assert.equal(
      ((await response.json()) as { error: { code: string } }).error.code,
      "insufficient_permissions",
    );
  });

  await withServer(appFor(manager), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/manager`);
    assert.equal(response.status, 200);
  });
});

test("notification read-state permission is limited to notification recipients", async () => {
  await withServer(appFor(customer), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/notifications/111111111111111111111111/read`, {
      method: "PATCH",
    });
    assert.equal(response.status, 200);
  });

  const kitchen: AuthPrincipal = {
    userId: "kitchen-user",
    role: "Kitchen Staff",
    restaurantId: manager.restaurantId,
  };
  await withServer(appFor(kitchen), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/notifications/111111111111111111111111/read`, {
      method: "PATCH",
    });
    assert.equal(response.status, 403);
  });
});

test("restaurant scope uses the signed tenant and blocks customer or cross-restaurant access", async () => {
  await withServer(appFor(manager), async (baseUrl) => {
    const allowed = await fetch(`${baseUrl}/restaurants/${manager.restaurantId}/orders`, {
      method: "POST",
    });
    assert.equal(allowed.status, 201);

    const mismatch = await fetch(`${baseUrl}/restaurants/222222222222222222222222/orders`, {
      method: "POST",
    });
    assert.equal(mismatch.status, 403);
    assert.equal(
      ((await mismatch.json()) as { error: { code: string } }).error.code,
      "restaurant_scope_mismatch",
    );

    const bodyMismatch = await fetch(`${baseUrl}/restaurants/${manager.restaurantId}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restaurantId: "222222222222222222222222" }),
    });
    assert.equal(bodyMismatch.status, 403);
  });

  await withServer(appFor(customer), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/restaurants/${manager.restaurantId}/orders`, {
      method: "POST",
    });
    assert.equal(response.status, 403);
    assert.equal(
      ((await response.json()) as { error: { code: string } }).error.code,
      "restaurant_scope_required",
    );
  });
});

test("resource owner middleware enforces customer ownership after repository lookup", async () => {
  await withServer(appFor(customer), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/orders/order-123`, { method: "POST" });
    assert.equal(response.status, 200);
  });

  await withServer(appFor(manager), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/orders/order-123`, { method: "POST" });
    assert.equal(response.status, 403);
  });
});
