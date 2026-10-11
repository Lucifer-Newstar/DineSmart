import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import {
  NotificationError,
  NotificationService,
} from "../src/notifications/notification.service.js";
import type {
  NewNotification,
  NotificationRecipientScope,
  NotificationRecord,
  NotificationRepository,
} from "../src/notifications/notification.types.js";

const userId = new ObjectId();
const restaurantId = new ObjectId();
const notificationId = new ObjectId();
const now = new Date("2026-10-11T09:00:00.000Z");

function record(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    id: notificationId,
    restaurantId,
    type: "incident.critical",
    title: "Low stock",
    body: "Paneer has fallen below its threshold.",
    createdAt: now,
    deliveredAt: null,
    readAt: null,
    ...overrides,
  };
}

function fakeRepository() {
  const calls: {
    create?: { notification: NewNotification; now: Date };
    list?: { scope: NotificationRecipientScope; limit: number };
    count?: NotificationRecipientScope;
    mark?: { scope: NotificationRecipientScope; notificationId: ObjectId; readAt: Date };
  } = {};
  const repository: NotificationRepository = {
    create: async (notification, at) => {
      calls.create = { notification, now: at };
      return record();
    },
    listForRecipient: async (scope, limit) => {
      calls.list = { scope, limit };
      return { notifications: [record()], truncated: true };
    },
    countUnread: async (scope) => {
      calls.count = scope;
      return 7;
    },
    markRead: async (scope, id, at) => {
      calls.mark = { scope, notificationId: id, readAt: at };
      return record({ readAt: at });
    },
  };
  return { repository, calls };
}

test("notification creation trims trusted text, stores unread, and uses the injected clock", async () => {
  const { repository, calls } = fakeRepository();
  const service = new NotificationService(repository, () => now);
  const request: NewNotification = {
    restaurantId,
    recipientUserId: userId,
    type: " incident.critical ",
    title: " Low stock ",
    body: " Paneer has fallen below its threshold. ",
    relatedEntity: { type: " incident ", id: notificationId },
  };

  await service.create(request);

  assert.deepEqual(calls.create, {
    notification: {
      restaurantId,
      recipientUserId: userId,
      type: "incident.critical",
      title: "Low stock",
      body: "Paneer has fallen below its threshold.",
      relatedEntity: { type: "incident", id: notificationId },
    },
    now,
  });
});

test("notification creation rejects blank and over-limit text before persistence", async () => {
  const { repository, calls } = fakeRepository();
  const service = new NotificationService(repository, () => now);
  const request: NewNotification = {
    restaurantId,
    recipientUserId: userId,
    type: "incident.critical",
    title: "  ",
    body: "Body",
  };

  await assert.rejects(service.create(request), (error: unknown) => {
    assert.ok(error instanceof NotificationError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, "invalid_notification");
    return true;
  });
  await assert.rejects(service.create({ ...request, title: "x".repeat(161) }), NotificationError);
  assert.equal(calls.create, undefined);
});

test("notification list uses the bounded newest page and returns total unread count", async () => {
  const { repository, calls } = fakeRepository();
  const service = new NotificationService(repository, () => now);
  const scope: NotificationRecipientScope = { kind: "staff", userId, restaurantId };

  const result = await service.list(scope);

  assert.equal(calls.list?.limit, 100);
  assert.deepEqual(calls.list?.scope, scope);
  assert.deepEqual(calls.count, scope);
  assert.equal(result.notifications.length, 1);
  assert.equal(result.unreadCount, 7);
  assert.equal(result.truncated, true);
});

test("mark-read uses the authenticated scope and returns 404 when the record is unavailable", async () => {
  const { repository, calls } = fakeRepository();
  const service = new NotificationService(repository, () => now);
  const scope: NotificationRecipientScope = { kind: "customer", userId };
  const result = await service.markRead(scope, notificationId);

  assert.deepEqual(calls.mark, { scope, notificationId, readAt: now });
  assert.equal(result.readAt, now);

  const missingRepository: NotificationRepository = {
    ...repository,
    markRead: async () => null,
  };
  await assert.rejects(
    new NotificationService(missingRepository, () => now).markRead(scope, notificationId),
    (error: unknown) => {
      assert.ok(error instanceof NotificationError);
      assert.equal(error.statusCode, 404);
      assert.equal(error.code, "notification_not_found");
      return true;
    },
  );
});
