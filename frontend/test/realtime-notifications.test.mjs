import assert from "node:assert/strict";
import test from "node:test";
import {
  parseNotification,
  parseNotificationPage,
  relativeTime,
} from "../src/app/notifications/notification-data.ts";
import {
  nextBackoffMs,
  parseRealtimeEnvelope,
  refreshTargetsForEvent,
  resolveRealtimeBase,
} from "../src/app/realtime-client.ts";

test("the realtime origin comes from NEXT_PUBLIC_REALTIME_URL or localhost", () => {
  assert.equal(
    resolveRealtimeBase("https://api.example.onrender.com/", undefined),
    "wss://api.example.onrender.com",
  );
  assert.equal(resolveRealtimeBase("http://127.0.0.1:3001", undefined), "ws://127.0.0.1:3001");
  assert.equal(resolveRealtimeBase("ftp://nope", undefined), null);
  assert.equal(resolveRealtimeBase("not a url", undefined), null);
  assert.equal(
    resolveRealtimeBase(undefined, { protocol: "http:", hostname: "localhost" }),
    "ws://localhost:3001",
  );
  assert.equal(
    resolveRealtimeBase(undefined, { protocol: "https:", hostname: "dinesmart.vercel.app" }),
    null,
    "production without a configured URL falls back to polling",
  );
});

test("envelopes are validated before use", () => {
  const valid = JSON.stringify({
    eventId: "8f1f2f5e-8b5a-4a39-9d52-1d1f8c1b2f10",
    event: "order.updated",
    occurredAt: "2026-10-23T10:00:00.000Z",
    restaurantId: "710000000000000000000001",
    data: { orderId: "1" },
  });
  assert.equal(parseRealtimeEnvelope(valid)?.event, "order.updated");
  assert.equal(parseRealtimeEnvelope("{not json"), null);
  assert.equal(
    parseRealtimeEnvelope(JSON.stringify({ eventId: "x", event: "evil", data: {} })),
    null,
  );
  assert.equal(parseRealtimeEnvelope(new ArrayBuffer(4)), null);
});

test("events refresh only the panels they affect", () => {
  assert.deepEqual(refreshTargetsForEvent("order.updated"), ["orders", "kitchen"]);
  assert.deepEqual(refreshTargetsForEvent("waitlist.updated"), ["reservations"]);
  assert.deepEqual(refreshTargetsForEvent("healthscore.updated"), ["healthScore"]);
  assert.deepEqual(refreshTargetsForEvent("notification.created"), []);
});

test("reconnects back off exponentially up to 30 seconds", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 10].map(nextBackoffMs),
    [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000],
  );
});

test("notification pages tolerate bad items and derive the unread count", () => {
  const page = parseNotificationPage({
    notifications: [
      {
        id: "a",
        title: "Critical: Low stock",
        body: "Paneer",
        createdAt: "2026-10-23T10:00:00Z",
        readAt: null,
      },
      {
        id: "b",
        title: "Read one",
        createdAt: "2026-10-23T09:00:00Z",
        readAt: "2026-10-23T09:05:00Z",
      },
      { title: "missing id" },
    ],
    truncated: false,
  });
  assert.equal(page?.notifications.length, 2);
  assert.equal(page?.unreadCount, 1);
  assert.equal(parseNotificationPage({}), null);
  assert.equal(parseNotification(null), null);
});

test("relative times read naturally", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  assert.equal(relativeTime("2026-10-23T11:59:40Z", now), "just now");
  assert.equal(relativeTime("2026-10-23T11:54:00Z", now), "6 min ago");
  assert.equal(relativeTime("2026-10-23T09:00:00Z", now), "3 h ago");
  assert.equal(relativeTime("garbage", now), "");
});
