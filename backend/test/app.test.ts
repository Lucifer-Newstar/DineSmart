import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import type { Db } from "mongodb";
import app, { createApp } from "../src/app.js";

test("GET /health reports process liveness", async () => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
});

test("createApp mounts the public menu and protected order-history routers", async () => {
  const db = { collection: () => ({}) } as unknown as Db;
  const api = createApp({
    getDatabase: async () => db,
    getJwtSecret: () => "local-test-secret-with-sufficient-length",
    webOrigin: "http://localhost:3000",
    nodeEnvironment: "test",
  });
  const server = api.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    const menuResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/menu?restaurantId=not-an-id`,
    );
    assert.equal(menuResponse.status, 400);
    assert.deepEqual(await menuResponse.json(), {
      error: {
        code: "invalid_restaurant_id",
        message: "Provide one valid restaurant ID to browse its menu.",
      },
    });

    const ordersResponse = await fetch(`http://127.0.0.1:${address.port}/api/v1/orders/history`);
    assert.equal(ordersResponse.status, 401);
    assert.deepEqual(await ordersResponse.json(), {
      error: { code: "missing_access_token", message: "A bearer access token is required." },
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
