import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSlotTime,
  openSlots,
  parseAvailability,
  reconcileSelection,
  shouldOfferWaitlist,
  slotLabel,
} from "../src/app/book/booking-data.ts";

function slot(localTime, available, reason) {
  const [hour, minute] = localTime.split(":").map(Number);
  const start = new Date(Date.UTC(2026, 9, 12, hour - 5, minute - 30));
  return {
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + 90 * 60_000).toISOString(),
    localTime,
    available,
    ...(reason ? { reason } : {}),
  };
}

const payload = {
  date: "2026-10-12",
  partySize: 2,
  timeZone: "Asia/Kolkata",
  turnMinutes: 90,
  slots: [
    slot("19:30", true),
    slot("19:00", false, "no_table"),
    slot("20:00", true),
    { localTime: "25:00" },
  ],
};

test("availability parsing keeps valid slots in time order and drops broken ones", () => {
  const day = parseAvailability(payload);
  assert.ok(day);
  assert.deepEqual(
    day.slots.map((entry) => entry.localTime),
    ["19:00", "19:30", "20:00"],
  );
  assert.equal(day.slots[0].reason, "no_table");
  assert.equal(parseAvailability({ slots: "nope" }), null);
  assert.equal(parseAvailability(null), null);
  assert.equal(parseAvailability({ ...payload, turnMinutes: "90" }), null);
});

test("only open slots are selectable and a closed choice moves to the next open one", () => {
  const day = parseAvailability(payload);
  assert.deepEqual(
    openSlots(day).map((entry) => entry.localTime),
    ["19:30", "20:00"],
  );
  assert.equal(reconcileSelection(day, "19:30"), "19:30");
  assert.equal(reconcileSelection(day, "19:00"), "19:30");
  // Nothing open after 21:00, so the latest open slot is chosen.
  assert.equal(reconcileSelection(day, "21:00"), "20:00");
});

test("an empty day offers the waitlist and keeps no selection", () => {
  const full = parseAvailability({ ...payload, slots: [slot("19:00", false, "no_table")] });
  assert.equal(shouldOfferWaitlist(full), true);
  assert.equal(reconcileSelection(full, "19:00"), null);
  assert.equal(shouldOfferWaitlist(parseAvailability(payload)), false);
  // A failed load is not the same as a full day.
  assert.equal(shouldOfferWaitlist(null), false);
});

test("slot labels and times read naturally", () => {
  assert.equal(formatSlotTime("19:30"), "7:30 pm");
  assert.equal(formatSlotTime("00:00"), "12:00 am");
  assert.equal(formatSlotTime("12:15"), "12:15 pm");
  assert.equal(slotLabel(slot("19:00", true)), "Open");
  assert.equal(slotLabel(slot("19:00", false, "past")), "Passed");
  assert.equal(slotLabel(slot("19:00", false, "pacing")), "Fully booked");
  assert.equal(slotLabel(slot("19:00", false, "no_table")), "No table");
});
