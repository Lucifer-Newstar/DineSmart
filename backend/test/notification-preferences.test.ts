import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { type Db, ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { MongoNotificationRepository } from "../src/notifications/notification.repository.js";
import { createNotificationRouter } from "../src/notifications/notification.router.js";
import { NotificationService } from "../src/notifications/notification.service.js";
import type { NewNotification } from "../src/notifications/notification.types.js";
import {
  categoryOf,
  effectivePreferences,
  MongoNotificationPreferenceStore,
  type NotificationPreferences,
  parsePreferenceChanges,
  respectingPreferences,
} from "../src/notifications/notification-preferences.js";

const userId = new ObjectId();
const restaurantId = new ObjectId();
const now = new Date("2026-10-26T10:00:00.000Z");

function notice(type: string): NewNotification {
  return { restaurantId, recipientUserId: userId, type, title: "Title", body: "Body" };
}

test("notification types map to the categories users can mute", () => {
  assert.equal(categoryOf("reservation.confirmed"), "bookings");
  assert.equal(categoryOf("reservation.reminder"), "bookings");
  assert.equal(categoryOf("order.ready"), "orders");
  assert.equal(categoryOf("staff.order_ready"), "waiterAlerts");
  assert.equal(categoryOf("incident.opened"), null);
});

test("each role sees only its own categories, on by default", () => {
  assert.deepEqual(effectivePreferences("Customer", undefined), { bookings: true, orders: true });
  assert.deepEqual(effectivePreferences("Customer", { orders: false }), {
    bookings: true,
    orders: false,
  });
  assert.deepEqual(effectivePreferences("Reception", undefined), { waiterAlerts: true });
  assert.deepEqual(effectivePreferences("Kitchen Staff", undefined), {});
});

test("preference changes accept only booleans for the caller's categories", () => {
  assert.deepEqual(parsePreferenceChanges("Customer", { bookings: false }), { bookings: false });
  assert.equal(parsePreferenceChanges("Customer", {}), null);
  assert.equal(parsePreferenceChanges("Customer", { bookings: "no" }), null);
  assert.equal(parsePreferenceChanges("Customer", { waiterAlerts: false }), null);
  assert.equal(parsePreferenceChanges("Reception", { incidents: false }), null);
  assert.equal(parsePreferenceChanges("Customer", [false]), null);
});

test("muted types are not created; other types and incident alerts still are", async () => {
  const stored: NotificationPreferences = { orders: false };
  const created: string[] = [];
  const create = respectingPreferences({ get: async () => stored }, async (notification) => {
    created.push(notification.type);
    return notification.type;
  });
  assert.equal(await create(notice("order.ready")), null);
  assert.equal(await create(notice("reservation.reminder")), "reservation.reminder");
  assert.equal(await create(notice("incident.opened")), "incident.opened");
  assert.deepEqual(created, ["reservation.reminder", "incident.opened"]);
});

test("unmutable alerts skip the preference lookup", async () => {
  let lookups = 0;
  const create = respectingPreferences(
    {
      get: async () => {
        lookups += 1;
        return undefined;
      },
    },
    async () => true,
  );
  await create(notice("incident.opened"));
  assert.equal(lookups, 0);
});

test("the Mongo store sets only the changed categories on an active user", async () => {
  const updates: Array<{ filter: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const db = {
    collection: () => ({
      updateOne: async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        updates.push({ filter, update });
        return { matchedCount: 1 };
      },
    }),
  } as unknown as Db;
  assert.equal(
    await new MongoNotificationPreferenceStore(db).update(userId, { orders: false }, now),
    true,
  );
  assert.deepEqual(updates[0]?.filter, { _id: userId, status: "active" });
  assert.deepEqual(updates[0]?.update, {
    $set: { updatedAt: now, "notificationPreferences.orders": false },
  });
});

test("mark all as read only touches the recipient's unread notifications", async () => {
  const calls: Array<{ filter: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const db = {
    collection: () => ({
      updateMany: async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
        calls.push({ filter, update });
        return { modifiedCount: 4 };
      },
    }),
  } as unknown as Db;
  const service = new NotificationService(new MongoNotificationRepository(db), () => now);
  assert.equal(await service.markAllRead({ kind: "staff", userId, restaurantId }), 4);
  assert.deepEqual(calls[0]?.filter, { recipientUserId: userId, restaurantId, readAt: null });
  assert.deepEqual(calls[0]?.update, { $set: { readAt: now, updatedAt: now } });
});

async function call(input: {
  method: "GET" | "PUT" | "POST";
  path: string;
  role: AuthPrincipal["role"];
  body?: unknown;
}) {
  let stored: NotificationPreferences = {};
  const marked: unknown[] = [];
  const app = express();
  app.use(express.json());
  app.use(
    "/api/v1/notifications",
    createNotificationRouter({
      createRuntime: async () => ({
        service: {
          create: async () => {
            throw new Error("unused");
          },
          list: async () => ({ notifications: [], unreadCount: 0, truncated: false }),
          markRead: async () => {
            throw new Error("unused");
          },
          markAllRead: async (scope) => {
            marked.push(scope);
            return 3;
          },
        },
        preferences: {
          get: async () => stored,
          update: async (_id, changes) => {
            stored = { ...stored, ...changes };
            return true;
          },
        },
        issueSocketTicket: () => {
          throw new Error("unused");
        },
        verifyAccessToken: async () => ({
          userId: userId.toHexString(),
          role: input.role,
          restaurantId: input.role === "Customer" ? null : restaurantId.toHexString(),
        }),
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
      method: input.method,
      headers: {
        authorization: "Bearer token",
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    return { status: response.status, body: await response.json(), marked, stored };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("GET and PUT preferences read and save the caller's categories", async () => {
  const read = await call({
    method: "GET",
    path: "/api/v1/notifications/preferences",
    role: "Customer",
  });
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, { preferences: { bookings: true, orders: true } });

  const saved = await call({
    method: "PUT",
    path: "/api/v1/notifications/preferences",
    role: "Reception",
    body: { waiterAlerts: false },
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body, { preferences: { waiterAlerts: false } });
});

test("PUT preferences refuses categories the role does not have", async () => {
  const refused = await call({
    method: "PUT",
    path: "/api/v1/notifications/preferences",
    role: "Customer",
    body: { waiterAlerts: false },
  });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error.code, "invalid_notification_preferences");
  assert.deepEqual(refused.stored, {});
});

test("POST read-all resets the unread count for the caller's own scope", async () => {
  const result = await call({
    method: "POST",
    path: "/api/v1/notifications/read-all",
    role: "Customer",
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { marked: 3, unreadCount: 0 });
  assert.deepEqual(result.marked, [{ kind: "customer", userId }]);

  const withBody = await call({
    method: "POST",
    path: "/api/v1/notifications/read-all",
    role: "Customer",
    body: { ids: ["x"] },
  });
  assert.equal(withBody.status, 400);
});
