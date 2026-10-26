import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createNotificationRouter } from "../src/notifications/notification.router.js";
import type {
  NotificationRecipientScope,
  NotificationRecord,
} from "../src/notifications/notification.types.js";
import type { RealtimeIdentity } from "../src/realtime/realtime.types.js";

const userId = new ObjectId();
const restaurantId = new ObjectId();
const otherRestaurantId = new ObjectId();
const notificationId = new ObjectId();
const createdAt = new Date("2026-10-11T09:00:00.000Z");
const notification: NotificationRecord = {
  id: notificationId,
  restaurantId,
  type: "incident.critical",
  title: "Low stock",
  body: "Paneer is below threshold.",
  relatedEntity: { type: "incident", id: new ObjectId() },
  createdAt,
  deliveredAt: null,
  readAt: null,
};

function principal(role: AuthPrincipal["role"] = "Manager"): AuthPrincipal {
  return {
    userId: userId.toHexString(),
    role,
    restaurantId: role === "Customer" ? null : restaurantId.toHexString(),
  };
}

async function request(input: {
  method?: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
  token?: string;
  origin?: string;
  principal?: AuthPrincipal;
}) {
  const calls: {
    listScopes: NotificationRecipientScope[];
    markReads: Array<{ scope: NotificationRecipientScope; notificationId: ObjectId }>;
    socketTickets: RealtimeIdentity[];
  } = { listScopes: [], markReads: [], socketTickets: [] };
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/notifications",
    createNotificationRouter({
      createRuntime: async () => ({
        service: {
          create: async () => notification,
          list: async (scope) => {
            calls.listScopes.push(scope);
            return { notifications: [notification], unreadCount: 2, truncated: false };
          },
          markRead: async (scope, id) => {
            calls.markReads.push({ scope, notificationId: id });
            return { ...notification, readAt: createdAt };
          },
        },
        issueSocketTicket: (identity) => {
          calls.socketTickets.push(identity);
          return {
            ticket: "A".repeat(43),
            expiresAt: new Date("2026-10-11T09:00:30.000Z"),
          };
        },
        verifyAccessToken: async (token) => {
          if (token !== "valid-notification-token") throw new Error("invalid token");
          return input.principal ?? principal();
        },
      }),
      webOrigin: "https://app.example",
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
        ...(input.origin ? { origin: input.origin } : {}),
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

test("POST socket-ticket issues a short-lived ticket for the authenticated restaurant identity", async () => {
  const { response, calls } = await request({
    method: "POST",
    path: "/api/v1/notifications/socket-ticket",
    body: {},
    token: "valid-notification-token",
    origin: "https://app.example",
    principal: principal("Manager"),
  });

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls.socketTickets, [{ userId, role: "Manager", restaurantId }]);
  assert.deepEqual(await response.json(), {
    ticket: "A".repeat(43),
    expiresAt: "2026-10-11T09:00:30.000Z",
    socketPath: "/api/v1/notifications/socket",
    protocol: "andhrimnir.events.v1",
  });
});

test("socket-ticket retains cross-restaurant Customer identity but does not accept an untrusted origin", async () => {
  const customer = await request({
    method: "POST",
    path: "/api/v1/notifications/socket-ticket",
    token: "valid-notification-token",
    origin: "https://app.example",
    principal: principal("Customer"),
  });
  assert.equal(customer.response.status, 201);
  assert.deepEqual(customer.calls.socketTickets, [
    { userId, role: "Customer", restaurantId: null },
  ]);

  const badOrigin = await request({
    method: "POST",
    path: "/api/v1/notifications/socket-ticket",
    token: "valid-notification-token",
    origin: "https://evil.example",
    principal: principal("Manager"),
  });
  assert.equal(badOrigin.response.status, 403);
  assert.deepEqual(badOrigin.calls.socketTickets, []);
});

test("socket-ticket rejects client parameters and roles without notification permission", async () => {
  const query = await request({
    method: "POST",
    path: `/api/v1/notifications/socket-ticket?restaurantId=${otherRestaurantId.toHexString()}`,
    token: "valid-notification-token",
    origin: "https://app.example",
  });
  assert.equal(query.response.status, 400);
  assert.deepEqual(query.calls.socketTickets, []);

  const body = await request({
    method: "POST",
    path: "/api/v1/notifications/socket-ticket",
    body: { restaurantId: otherRestaurantId.toHexString() },
    token: "valid-notification-token",
    origin: "https://app.example",
  });
  assert.equal(body.response.status, 400);
  assert.deepEqual(body.calls.socketTickets, []);

  const kitchen = await request({
    method: "POST",
    path: "/api/v1/notifications/socket-ticket",
    token: "valid-notification-token",
    origin: "https://app.example",
    principal: principal("Kitchen Staff"),
  });
  assert.equal(kitchen.response.status, 403);
  assert.deepEqual(kitchen.calls.socketTickets, []);
});

async function ticketStatuses(rateLimits?: boolean) {
  let issuedTickets = 0;
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/notifications",
    createNotificationRouter({
      createRuntime: async () => ({
        service: {
          create: async () => notification,
          list: async () => ({ notifications: [], unreadCount: 0, truncated: false }),
          markRead: async () => notification,
        },
        verifyAccessToken: async () => principal("Manager"),
        issueSocketTicket: () => {
          issuedTickets += 1;
          return { ticket: "B".repeat(43), expiresAt: new Date(Date.now() + 30_000) };
        },
      }),
      webOrigin: "https://app.example",
      ...(rateLimits === undefined ? {} : { rateLimits }),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/notifications/socket-ticket`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer valid-notification-token",
            origin: "https://app.example",
          },
        },
      );
      statuses.push(response.status);
      await response.arrayBuffer();
    }
    return { statuses, issuedTickets };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("socket-ticket requests are limited to ten per minute and IP", async () => {
  const { statuses, issuedTickets } = await ticketStatuses();
  assert.deepEqual(statuses, [...Array.from({ length: 10 }, () => 201), 429]);
  assert.equal(issuedTickets, 10);
});

test("the socket-ticket limit is skipped only when the app turns rate limits off", async () => {
  const { statuses, issuedTickets } = await ticketStatuses(false);
  assert.deepEqual(
    statuses,
    Array.from({ length: 11 }, () => 201),
  );
  assert.equal(issuedTickets, 11);
});

test("Customer GET returns own cross-restaurant feed and omits recipient identity", async () => {
  const customer = principal("Customer");
  const { response, calls } = await request({
    path: "/api/v1/notifications",
    token: "valid-notification-token",
    principal: customer,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls.listScopes, [{ kind: "customer", userId }]);
  const payload = (await response.json()) as {
    notifications: Array<Record<string, unknown>>;
    unreadCount: number;
    truncated: boolean;
  };
  assert.deepEqual(payload, {
    notifications: [
      {
        id: notificationId.toHexString(),
        restaurantId: restaurantId.toHexString(),
        type: "incident.critical",
        title: "Low stock",
        body: "Paneer is below threshold.",
        relatedEntity: { type: "incident", id: notification.relatedEntity?.id.toHexString() },
        createdAt: createdAt.toISOString(),
        deliveredAt: null,
        readAt: null,
      },
    ],
    unreadCount: 2,
    truncated: false,
  });
  assert.equal("recipientUserId" in (payload.notifications[0] ?? {}), false);
});

test("restaurant staff feed includes both the signed restaurant and recipient scope", async () => {
  const { response, calls } = await request({
    path: "/api/v1/notifications",
    token: "valid-notification-token",
    principal: principal("Reception"),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls.listScopes, [{ kind: "staff", userId, restaurantId }]);
});

test("PATCH marks only the authenticated recipient's notification as read", async () => {
  const customer = principal("Customer");
  const { response, calls } = await request({
    method: "PATCH",
    path: `/api/v1/notifications/${notificationId.toHexString()}/read`,
    body: {},
    token: "valid-notification-token",
    principal: customer,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls.markReads, [{ scope: { kind: "customer", userId }, notificationId }]);
  assert.deepEqual(await response.json(), {
    notification: {
      id: notificationId.toHexString(),
      restaurantId: restaurantId.toHexString(),
      type: "incident.critical",
      title: "Low stock",
      body: "Paneer is below threshold.",
      relatedEntity: { type: "incident", id: notification.relatedEntity?.id.toHexString() },
      createdAt: createdAt.toISOString(),
      deliveredAt: null,
      readAt: createdAt.toISOString(),
    },
  });
});

test("restaurant staff mark-read stays within the signed tenant and own recipient scope", async () => {
  const { response, calls } = await request({
    method: "PATCH",
    path: `/api/v1/notifications/${notificationId.toHexString()}/read`,
    body: {},
    token: "valid-notification-token",
    principal: principal("Manager"),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls.markReads, [
    { scope: { kind: "staff", userId, restaurantId }, notificationId },
  ]);
});

test("mark-read rejects malformed IDs and attempts to change notification fields", async () => {
  const invalidId = await request({
    method: "PATCH",
    path: "/api/v1/notifications/not-an-id/read",
    token: "valid-notification-token",
    principal: principal("Manager"),
  });
  assert.equal(invalidId.response.status, 400);

  const invalidBody = await request({
    method: "PATCH",
    path: `/api/v1/notifications/${notificationId.toHexString()}/read`,
    body: { readAt: null, recipientUserId: new ObjectId().toHexString() },
    token: "valid-notification-token",
    principal: principal("Manager"),
  });
  assert.equal(invalidBody.response.status, 400);
  assert.deepEqual(invalidBody.calls.markReads, []);
});

test("notification routes reject unauthenticated users and roles without notification access", async () => {
  const unauthenticated = await request({ path: "/api/v1/notifications" });
  assert.equal(unauthenticated.response.status, 401);

  const kitchen = await request({
    path: "/api/v1/notifications",
    token: "valid-notification-token",
    principal: principal("Kitchen Staff"),
  });
  assert.equal(kitchen.response.status, 403);
  assert.deepEqual(kitchen.calls.listScopes, []);
});

test("notification reads reject client filters and a mismatched staff tenant", async () => {
  const customer = await request({
    path: `/api/v1/notifications?restaurantId=${otherRestaurantId.toHexString()}`,
    token: "valid-notification-token",
    principal: principal("Customer"),
  });
  assert.equal(customer.response.status, 400);
  assert.deepEqual(await customer.response.json(), {
    error: {
      code: "invalid_notification_query",
      message: "Notifications do not accept client-selected filters.",
    },
  });

  const manager = await request({
    path: `/api/v1/notifications?restaurantId=${otherRestaurantId.toHexString()}`,
    token: "valid-notification-token",
    principal: principal("Manager"),
  });
  assert.equal(manager.response.status, 403);
  assert.deepEqual(await manager.response.json(), {
    error: {
      code: "restaurant_scope_mismatch",
      message: "The requested restaurant is outside your access scope.",
    },
  });
});
