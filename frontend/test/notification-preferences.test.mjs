import assert from "node:assert/strict";
import test from "node:test";
import { parseNotificationPreferences } from "../src/app/notifications/notification-data.ts";

test("notification preferences keep known categories in display order", () => {
  assert.deepEqual(
    parseNotificationPreferences({ preferences: { orders: false, bookings: true } }),
    [
      { key: "bookings", label: "Booking confirmations, changes and reminders", enabled: true },
      { key: "orders", label: "When my order is ready", enabled: false },
    ],
  );
});

test("notification preferences ignore unknown keys and reject bad shapes", () => {
  assert.deepEqual(parseNotificationPreferences({ preferences: { future: true } }), []);
  assert.deepEqual(parseNotificationPreferences({ preferences: { waiterAlerts: "yes" } }), []);
  assert.equal(parseNotificationPreferences({ preferences: [] }), null);
  assert.equal(parseNotificationPreferences(null), null);
});
