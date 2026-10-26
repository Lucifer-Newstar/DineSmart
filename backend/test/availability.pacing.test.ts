import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import {
  type AvailabilityBooking,
  type AvailabilityRepository,
  computeAvailability,
  coversInPacingWindow,
  createSlotGuard,
} from "../src/reservations/availability.service.js";
import { DEFAULT_BOOKING_RULES, resolveBookingRules } from "../src/reservations/booking-rules.js";

const now = new Date("2026-10-11T00:00:00.000Z");
const rules = { ...resolveBookingRules(DEFAULT_BOOKING_RULES), pacingCoversPer15Min: 10 };
// Plenty of tables, so only pacing can close a slot.
const tables = Array.from({ length: 12 }, (_, index) => ({
  id: `t${index}`,
  capacity: 6,
  status: "available",
}));

function at(iso: string, partySize: number, tableId: string | null = null): AvailabilityBooking {
  const startAt = new Date(iso);
  return { tableId, partySize, startAt, endAt: new Date(startAt.getTime() + 90 * 60_000) };
}

function slots(bookings: AvailabilityBooking[], partySize: number) {
  return new Map(
    computeAvailability({
      date: "2026-10-12",
      partySize,
      timeZone: "Asia/Kolkata",
      operatingHours: { opensAt: "18:00", closesAt: "23:00" },
      rules,
      tables,
      bookings,
      now,
    }).map((slot) => [slot.localTime, slot]),
  );
}

test("covers are counted per 15-minute window, mixing party sizes", () => {
  // 19:00 local is 13:30Z; 19:10 is still inside the 19:00-19:15 window, 19:15 is not.
  const bookings = [
    at("2026-10-12T13:30:00.000Z", 2),
    at("2026-10-12T13:30:00.000Z", 5),
    at("2026-10-12T13:40:00.000Z", 1),
    at("2026-10-12T13:45:00.000Z", 6),
  ];
  assert.equal(coversInPacingWindow(bookings, new Date("2026-10-12T13:30:00.000Z")), 8);
  assert.equal(coversInPacingWindow(bookings, new Date("2026-10-12T13:45:00.000Z")), 6);
});

test("a slot stays open up to the cap and closes when the party would pass it", () => {
  const eight = [at("2026-10-12T13:30:00.000Z", 3), at("2026-10-12T13:30:00.000Z", 5)];
  // 8 + 2 = 10 is exactly the cap: still open.
  assert.equal(slots(eight, 2).get("19:00")?.available, true);
  // 8 + 3 = 11 passes it.
  const closed = slots(eight, 3).get("19:00");
  assert.equal(closed?.available, false);
  assert.equal(closed?.reason, "pacing");
  // The neighbouring slots are untouched.
  assert.equal(slots(eight, 3).get("18:30")?.available, true);
  assert.equal(slots(eight, 3).get("19:30")?.available, true);
});

test("the booking guard refuses a party that would break pacing and ignores the booking it moves", async () => {
  const restaurantId = new ObjectId();
  const moving = new ObjectId();
  const held = [at("2026-10-12T13:30:00.000Z", 9)];
  const repository: AvailabilityRepository = {
    getActiveRestaurant: async () => ({ timeZone: "Asia/Kolkata", bookingRules: rules }),
    listTables: async () => tables,
    listActiveBookings: async (_id, _from, _to, excluding) =>
      excluding?.equals(moving) ? [] : held,
  };
  const guard = createSlotGuard(repository);
  const startAt = new Date("2026-10-12T13:30:00.000Z");
  const endAt = new Date("2026-10-12T15:00:00.000Z");
  assert.equal(await guard({ restaurantId, partySize: 1, startAt, endAt }), true);
  assert.equal(await guard({ restaurantId, partySize: 2, startAt, endAt }), false);
  assert.equal(
    await guard({ restaurantId, partySize: 2, startAt, endAt, excludingReservationId: moving }),
    true,
  );
});
