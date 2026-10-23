import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import type { Db } from "mongodb";
import { createApp } from "../src/app.js";

test("GET /health reports process liveness", async () => {
  const server = createApp({ nodeEnvironment: "test" }).listen(0, "127.0.0.1");
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

test("createApp mounts the public menu and protected analytics, billing, order, kitchen, incident, notification, reservation, staff, waitlist, table, and AI routers", async () => {
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
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const menuResponse = await fetch(`${baseUrl}/api/v1/menu?restaurantId=not-an-id`);
    assert.equal(menuResponse.status, 400);
    assert.deepEqual(await menuResponse.json(), {
      error: {
        code: "invalid_restaurant_id",
        message: "Provide one valid restaurant ID to browse its menu.",
      },
    });

    const analyticsResponse = await fetch(`${baseUrl}/api/v1/analytics`);
    assert.equal(analyticsResponse.status, 401);

    const ordersResponse = await fetch(`${baseUrl}/api/v1/orders/history`);
    assert.equal(ordersResponse.status, 401);
    assert.deepEqual(await ordersResponse.json(), {
      error: { code: "missing_access_token", message: "A bearer access token is required." },
    });

    const reservationsResponse = await fetch(`${baseUrl}/api/v1/reservations`);
    assert.equal(reservationsResponse.status, 401);

    const billsResponse = await fetch(`${baseUrl}/api/v1/bills/111111111111111111111111`);
    assert.equal(billsResponse.status, 401);

    const resetResponse = await fetch(`${baseUrl}/api/v1/auth/reset-password/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(resetResponse.status, 400);

    const staffResponse = await fetch(`${baseUrl}/api/v1/staff`);
    assert.equal(staffResponse.status, 401);

    const waitlistResponse = await fetch(`${baseUrl}/api/v1/waitlist`);
    assert.equal(waitlistResponse.status, 401);

    const tableStatusResponse = await fetch(
      `${baseUrl}/api/v1/tables/111111111111111111111111/status`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "occupied" }),
      },
    );
    assert.equal(tableStatusResponse.status, 401);

    const kitchenResponse = await fetch(`${baseUrl}/api/v1/kitchen/queue`);
    assert.equal(kitchenResponse.status, 401);

    const incidentsResponse = await fetch(`${baseUrl}/api/v1/incidents`);
    assert.equal(incidentsResponse.status, 401);

    const recommendationsResponse = await fetch(`${baseUrl}/api/v1/recommendations`);
    assert.equal(recommendationsResponse.status, 401);

    const generateRecommendationResponse = await fetch(
      `${baseUrl}/api/v1/incidents/111111111111111111111111/recommendations`,
      { method: "POST" },
    );
    assert.equal(generateRecommendationResponse.status, 401);

    const notificationsResponse = await fetch(`${baseUrl}/api/v1/notifications`);
    assert.equal(notificationsResponse.status, 401);

    const socketTicketResponse = await fetch(`${baseUrl}/api/v1/notifications/socket-ticket`, {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    assert.equal(socketTicketResponse.status, 401);

    const notificationReadResponse = await fetch(
      `${baseUrl}/api/v1/notifications/111111111111111111111111/read`,
      { method: "PATCH" },
    );
    assert.equal(notificationReadResponse.status, 401);

    const staffStatusResponse = await fetch(
      `${baseUrl}/api/v1/orders/111111111111111111111111/status`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" },
    );
    assert.equal(staffStatusResponse.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
