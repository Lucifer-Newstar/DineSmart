import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { WebSocket } from "ws";
import type { NotificationRecord } from "../src/notifications/notification.types.js";
import type { RealtimeIdentity } from "../src/realtime/realtime.types.js";
import {
  REALTIME_ACK_TTL_MS,
  REALTIME_MAX_CONNECTIONS_PER_USER,
  REALTIME_MAX_PAYLOAD_BYTES,
} from "../src/realtime/realtime.types.js";
import { RealtimeHub } from "../src/realtime/realtime-hub.js";

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  sent: string[] = [];
  closeCode: number | undefined;

  send(payload: string, callback?: (error?: Error) => void): void {
    this.sent.push(payload);
    callback?.();
  }

  close(code?: number): void {
    this.closeCode = code;
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }
}

function socket(): { raw: FakeSocket; typed: WebSocket } {
  const raw = new FakeSocket();
  return { raw, typed: raw as unknown as WebSocket };
}

function identity(
  userId: ObjectId,
  restaurantId: ObjectId | null,
  role: RealtimeIdentity["role"] = "Manager",
): RealtimeIdentity {
  return { userId, role, restaurantId };
}

function notificationRecord(recipientRestaurantId: ObjectId): NotificationRecord {
  return {
    id: new ObjectId(),
    restaurantId: recipientRestaurantId,
    type: "incident.critical",
    title: "Low stock",
    body: "A stock level needs review.",
    createdAt: new Date("2026-10-11T09:00:00.000Z"),
    deliveredAt: null,
    readAt: null,
  };
}

test("restaurant events are tenant-filtered and use the existing role permissions", () => {
  const restaurantId = new ObjectId();
  const otherRestaurantId = new ObjectId();
  const hub = new RealtimeHub({ clock: () => Date.parse("2026-10-11T09:00:00.000Z") });
  const manager = socket();
  const receptionist = socket();
  const kitchen = socket();
  const otherTenant = socket();
  hub.addConnection(identity(new ObjectId(), restaurantId, "Manager"), manager.typed);
  hub.addConnection(identity(new ObjectId(), restaurantId, "Reception"), receptionist.typed);
  hub.addConnection(identity(new ObjectId(), restaurantId, "Kitchen Staff"), kitchen.typed);
  hub.addConnection(identity(new ObjectId(), otherRestaurantId, "Manager"), otherTenant.typed);

  hub.publishRestaurantEvent({
    restaurantId,
    event: "healthscore.updated",
    data: { score: 82, calculatedAt: "2026-10-11T09:00:00.000Z" },
  });

  assert.equal(manager.raw.sent.length, 1);
  assert.equal(receptionist.raw.sent.length, 1);
  assert.equal(kitchen.raw.sent.length, 0, "Kitchen Staff lack operations-dashboard permission");
  assert.equal(otherTenant.raw.sent.length, 0, "the signed tenant must match the event tenant");
  const envelope = JSON.parse(manager.raw.sent[0] ?? "{}") as {
    eventId: string;
    event: string;
    occurredAt: string;
    restaurantId: string;
    data: Record<string, unknown>;
  };
  assert.match(envelope.eventId, /^[0-9a-f-]{36}$/i);
  assert.equal(envelope.event, "healthscore.updated");
  assert.equal(envelope.occurredAt, "2026-10-11T09:00:00.000Z");
  assert.equal(envelope.restaurantId, restaurantId.toHexString());
  assert.deepEqual(envelope.data, { score: 82, calculatedAt: "2026-10-11T09:00:00.000Z" });
});

test("notifications fan out only to the authenticated recipient and preserve customer cross-restaurant scope", () => {
  const restaurantId = new ObjectId();
  const recipientId = new ObjectId();
  const hub = new RealtimeHub({ clock: () => Date.parse("2026-10-11T09:00:00.000Z") });
  const otherRestaurantId = new ObjectId();
  const recipientStaff = socket();
  const otherStaff = socket();
  const recipientWrongTenant = socket();
  const recipientCustomer = socket();
  hub.addConnection(identity(recipientId, restaurantId, "Manager"), recipientStaff.typed);
  hub.addConnection(identity(new ObjectId(), restaurantId, "Manager"), otherStaff.typed);
  hub.addConnection(
    identity(recipientId, otherRestaurantId, "Manager"),
    recipientWrongTenant.typed,
  );
  hub.addConnection(identity(recipientId, null, "Customer"), recipientCustomer.typed);

  const notification = notificationRecord(restaurantId);
  const delivered = hub.publishNotification(recipientId, notification);

  assert.equal(delivered, 2);
  assert.equal(recipientStaff.raw.sent.length, 1);
  assert.equal(otherStaff.raw.sent.length, 0);
  assert.equal(recipientWrongTenant.raw.sent.length, 0);
  assert.equal(recipientCustomer.raw.sent.length, 1);
  const payload = JSON.parse(recipientCustomer.raw.sent[0] ?? "{}") as {
    event: string;
    data: { notification: Record<string, unknown> };
  };
  assert.equal(payload.event, "notification.created");
  assert.equal("recipientUserId" in payload.data.notification, false);
});

test("notification ACKs are socket-bound, expiring, and yield authenticated recipient scope", () => {
  let now = 1_000;
  const restaurantId = new ObjectId();
  const recipientId = new ObjectId();
  const hub = new RealtimeHub({ clock: () => now });
  const authorized = socket();
  const other = socket();
  hub.addConnection(identity(recipientId, restaurantId, "Manager"), authorized.typed);
  hub.addConnection(identity(new ObjectId(), restaurantId, "Manager"), other.typed);

  const notification = notificationRecord(restaurantId);
  hub.publishNotification(recipientId, notification);
  const envelope = JSON.parse(authorized.raw.sent[0] ?? "{}") as { eventId: string };

  assert.deepEqual(hub.beginNotificationAcknowledgement(authorized.typed, envelope.eventId), {
    scope: { kind: "staff", userId: recipientId, restaurantId },
    notificationId: notification.id,
  });
  assert.equal(hub.beginNotificationAcknowledgement(authorized.typed, envelope.eventId), null);
  assert.equal(hub.beginNotificationAcknowledgement(other.typed, envelope.eventId), null);
  hub.finishNotificationAcknowledgement(authorized.typed, envelope.eventId, false);
  assert.notEqual(hub.beginNotificationAcknowledgement(authorized.typed, envelope.eventId), null);
  hub.finishNotificationAcknowledgement(authorized.typed, envelope.eventId, true);
  assert.equal(hub.beginNotificationAcknowledgement(authorized.typed, envelope.eventId), null);

  hub.publishNotification(recipientId, notification);
  const expiringEnvelope = JSON.parse(authorized.raw.sent[1] ?? "{}") as { eventId: string };
  now += REALTIME_ACK_TTL_MS + 1;
  assert.equal(
    hub.beginNotificationAcknowledgement(authorized.typed, expiringEnvelope.eventId),
    null,
  );
});

test("hub drops oversized outbound notification frames before sending them", () => {
  const restaurantId = new ObjectId();
  const userId = new ObjectId();
  const hub = new RealtimeHub();
  const connected = socket();
  hub.addConnection(identity(userId, restaurantId), connected.typed);

  const oversized = {
    ...notificationRecord(restaurantId),
    body: "x".repeat(REALTIME_MAX_PAYLOAD_BYTES + 1),
  };
  const delivered = hub.publishNotification(userId, oversized);

  assert.equal(delivered, 0);
  assert.equal(connected.raw.sent.length, 0);
  assert.equal(connected.raw.closeCode, 1009);
  assert.equal(hub.connectionCount, 0);
});

test("hub limits simultaneous sockets for a user and removes closed connections", () => {
  const hub = new RealtimeHub();
  const userId = new ObjectId();
  const restaurantId = new ObjectId();
  const sockets: Array<{ raw: FakeSocket; typed: WebSocket }> = [];
  for (let index = 0; index < REALTIME_MAX_CONNECTIONS_PER_USER; index += 1) {
    const next = socket();
    sockets.push(next);
    assert.equal(hub.addConnection(identity(userId, restaurantId), next.typed), true);
  }
  const overflow = socket();
  assert.equal(hub.addConnection(identity(userId, restaurantId), overflow.typed), false);
  assert.equal(hub.connectionCount, REALTIME_MAX_CONNECTIONS_PER_USER);

  sockets[0]?.raw.emit("close");
  assert.equal(hub.connectionCount, REALTIME_MAX_CONNECTIONS_PER_USER - 1);
});
