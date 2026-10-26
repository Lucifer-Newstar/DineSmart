import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingStatusLabel,
  canChangeBooking,
  groupBookings,
  localParts,
  parseBookingList,
} from "../src/app/bookings/bookings-data.ts";

const now = new Date("2026-10-11T06:00:00.000Z");

function booking(id, startAt, status, extra = {}) {
  return {
    id: id.padStart(24, "a"),
    restaurantId: "710000000000000000000001",
    restaurantName: "Saffron & Co.",
    partySize: 2,
    startAt,
    endAt: new Date(Date.parse(startAt) + 90 * 60_000).toISOString(),
    status,
    tableNumber: null,
    ...extra,
  };
}

test("booking lists drop malformed rows and keep optional notes only when present", () => {
  const list = parseBookingList({
    reservations: [
      booking("1", "2026-10-12T13:30:00.000Z", "Confirmed", { notes: "Window", occasion: " " }),
      { id: "short", status: "Confirmed" },
      null,
    ],
  });
  assert.equal(list?.length, 1);
  assert.equal(list?.[0].notes, "Window");
  assert.equal("occasion" in (list?.[0] ?? {}), false);
  assert.equal(parseBookingList({}), null);
});

test("upcoming bookings come soonest first and past ones most recent first", () => {
  const { upcoming, past } = groupBookings(
    [
      booking("1", "2026-10-14T13:30:00.000Z", "Awaiting"),
      booking("2", "2026-10-12T13:30:00.000Z", "Confirmed"),
      booking("3", "2026-10-13T13:30:00.000Z", "Cancelled"),
      booking("4", "2026-10-01T13:30:00.000Z", "Completed"),
      booking("5", "2026-10-05T13:30:00.000Z", "NoShow"),
    ],
    now,
  );
  assert.deepEqual(
    upcoming.map((entry) => entry.id.at(-1)),
    ["2", "1"],
  );
  assert.deepEqual(
    past.map((entry) => entry.id.at(-1)),
    ["3", "5", "4"],
  );
});

test("only future Awaiting or Confirmed bookings offer change and cancel", () => {
  assert.equal(canChangeBooking(booking("1", "2026-10-12T13:30:00.000Z", "Awaiting"), now), true);
  assert.equal(canChangeBooking(booking("1", "2026-10-12T13:30:00.000Z", "Confirmed"), now), true);
  assert.equal(canChangeBooking(booking("1", "2026-10-12T13:30:00.000Z", "Seated"), now), false);
  assert.equal(canChangeBooking(booking("1", "2026-10-10T13:30:00.000Z", "Confirmed"), now), false);
});

test("labels and restaurant-local parts are friendly", () => {
  assert.equal(bookingStatusLabel("NoShow"), "Missed");
  assert.equal(bookingStatusLabel("Awaiting"), "Awaiting confirmation");
  assert.equal(bookingStatusLabel("Mystery"), "Mystery");
  assert.deepEqual(localParts("2026-10-12T13:30:00.000Z", "Asia/Kolkata"), {
    date: "2026-10-12",
    time: "19:00",
  });
});
