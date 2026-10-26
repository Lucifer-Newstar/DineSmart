import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AvailabilityBooking,
  type AvailabilityInput,
  AvailabilityInputError,
  computeAvailability,
  freeTablesFor,
  localDateOf,
  parseLocalDate,
  zonedTimeToUtc,
} from "../src/reservations/availability.service.js";
import { DEFAULT_BOOKING_RULES, resolveBookingRules } from "../src/reservations/booking-rules.js";

const now = new Date("2026-10-11T00:00:00.000Z");
const tables = [
  { id: "t1", capacity: 2, status: "available" },
  { id: "t2", capacity: 4, status: "occupied" },
  { id: "t3", capacity: 6, status: "available" },
  { id: "t4", capacity: 8, status: "out_of_service" },
];

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    date: "2026-10-12",
    partySize: 2,
    timeZone: "Asia/Kolkata",
    operatingHours: { opensAt: "11:00", closesAt: "23:00" },
    rules: resolveBookingRules(DEFAULT_BOOKING_RULES),
    tables,
    bookings: [],
    now,
    ...overrides,
  };
}

function booking(tableId: string | null, partySize: number, start: string, minutes = 90) {
  const startAt = new Date(start);
  return {
    tableId,
    partySize,
    startAt,
    endAt: new Date(startAt.getTime() + minutes * 60_000),
  } satisfies AvailabilityBooking;
}

test("slots run from opening until the last start that still ends by closing time", () => {
  const slots = computeAvailability(input());
  assert.equal(slots[0].localTime, "11:00");
  assert.equal(slots[0].startAt.toISOString(), "2026-10-12T05:30:00.000Z");
  // A 90-minute turn must end by 23:00, so the last start is 21:30.
  assert.equal(slots.at(-1)?.localTime, "21:30");
  assert.equal(slots.at(-1)?.endAt.toISOString(), "2026-10-12T17:30:00.000Z");
  assert.ok(slots.every((slot) => slot.available));

  // Larger parties keep the table longer, so their last slot is earlier.
  const largeParty = computeAvailability(input({ partySize: 6 }));
  assert.equal(largeParty.at(-1)?.localTime, "21:00");
});

test("a slot closes only when every table that fits the party is booked across the turn", () => {
  const slots = computeAvailability(
    input({
      partySize: 5,
      bookings: [booking("t3", 6, "2026-10-12T13:30:00.000Z", 120)],
    }),
  );
  const byTime = new Map(slots.map((slot) => [slot.localTime, slot]));
  // t3 is held 19:00-21:00 local; a 120-minute turn starting 17:30 would overlap it.
  assert.equal(byTime.get("17:00")?.available, true);
  assert.equal(byTime.get("17:30")?.available, false);
  assert.equal(byTime.get("17:30")?.reason, "no_table");
  assert.equal(byTime.get("20:30")?.available, false);
  assert.equal(byTime.get("21:00")?.available, true);
  // A party of 2 still fits the smaller tables at the same time.
  const pair = computeAvailability(
    input({ bookings: [booking("t3", 6, "2026-10-12T13:30:00.000Z", 120)] }),
  );
  assert.ok(pair.every((slot) => slot.available));
});

test("unassigned bookings still use up a table that fits them", () => {
  const held = [
    booking(null, 4, "2026-10-12T13:30:00.000Z"),
    booking(null, 2, "2026-10-12T13:30:00.000Z"),
  ];
  const free = freeTablesFor(
    tables,
    held,
    new Date("2026-10-12T13:30:00.000Z"),
    new Date("2026-10-12T15:00:00.000Z"),
  );
  // The party of 4 takes t2 (smallest that fits), the pair takes t1, t4 is out of service.
  assert.deepEqual(
    free.map((table) => table.id),
    ["t3"],
  );
  const slot = computeAvailability(
    input({ partySize: 6, bookings: [...held, booking(null, 6, "2026-10-12T13:30:00.000Z")] }),
  ).find((candidate) => candidate.localTime === "19:00");
  assert.equal(slot?.available, false);
});

test("a one-seat gap does not open a slot for a larger party", () => {
  const onlyPairs = [
    { id: "a", capacity: 2, status: "available" },
    { id: "b", capacity: 3, status: "available" },
  ];
  const slots = computeAvailability(input({ partySize: 4, tables: onlyPairs }));
  assert.ok(slots.length > 0);
  assert.ok(slots.every((slot) => !slot.available && slot.reason === "no_table"));
});

test("slots that have already started are marked past", () => {
  const slots = computeAvailability(input({ now: new Date("2026-10-12T08:45:00.000Z") }));
  const byTime = new Map(slots.map((slot) => [slot.localTime, slot]));
  // 08:45Z is 14:15 in Kolkata.
  assert.equal(byTime.get("14:00")?.reason, "past");
  assert.equal(byTime.get("14:30")?.available, true);
});

test("local dates convert through the restaurant time zone, including DST days", () => {
  assert.equal(
    zonedTimeToUtc("2026-10-12", 19 * 60, "Asia/Kolkata").toISOString(),
    "2026-10-12T13:30:00.000Z",
  );
  // London moves back to GMT on 25 Oct 2026.
  assert.equal(
    zonedTimeToUtc("2026-10-24", 19 * 60, "Europe/London").toISOString(),
    "2026-10-24T18:00:00.000Z",
  );
  assert.equal(
    zonedTimeToUtc("2026-10-25", 19 * 60, "Europe/London").toISOString(),
    "2026-10-25T19:00:00.000Z",
  );
  assert.equal(localDateOf(new Date("2026-10-12T20:00:00.000Z"), "Asia/Kolkata"), "2026-10-13");
});

test("impossible dates and party sizes are rejected", () => {
  assert.equal(parseLocalDate("2026-02-30"), null);
  assert.equal(parseLocalDate("2026-2-3"), null);
  assert.deepEqual(parseLocalDate("2028-02-29"), { year: 2028, month: 2, day: 29 });
  assert.throws(() => computeAvailability(input({ date: "2026-13-01" })), AvailabilityInputError);
  assert.throws(() => computeAvailability(input({ partySize: 0 })), AvailabilityInputError);
});

test("without operating hours the whole day is offered", () => {
  const slots = computeAvailability(input({ operatingHours: undefined }));
  assert.equal(slots[0].localTime, "00:00");
  assert.equal(slots.at(-1)?.localTime, "22:30");
});
