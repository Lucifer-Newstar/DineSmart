import assert from "node:assert/strict";
import test from "node:test";
import {
  formatQuotedWait,
  minutesWaiting,
  parseTables,
  parseWaitlist,
  quotedWaitOf,
  TABLE_TRANSITIONS,
  tablesForParty,
} from "../src/app/_dashboard/floor-data.ts";

const tables = [
  { id: "a", tableNumber: "T1", capacity: 2, status: "available" },
  { id: "b", tableNumber: "T2", capacity: 4, status: "available" },
  { id: "c", tableNumber: "T3", capacity: 6, status: "occupied" },
  { id: "d", tableNumber: "T4", capacity: 4, status: "available" },
];

test("seating offers only free tables that fit, smallest first", () => {
  assert.deepEqual(
    tablesForParty(tables, 3).map((table) => table.tableNumber),
    ["T2", "T4"],
  );
  assert.deepEqual(tablesForParty(tables, 7), []);
});

test("table menus mirror the API's allowed transitions", () => {
  assert.deepEqual(TABLE_TRANSITIONS.occupied, ["available"]);
  assert.ok(TABLE_TRANSITIONS.available.includes("reserved"));
  assert.ok(!TABLE_TRANSITIONS.reserved.includes("out_of_service"));
});

test("table and waitlist responses are validated item by item", () => {
  assert.equal(parseTables({ tables: [...tables, { id: 1 }] })?.length, 4);
  assert.equal(parseTables({}), null);
  const entries = parseWaitlist({
    entries: [
      {
        id: "w1",
        guestName: "Ravi",
        partySize: 3,
        createdAt: "2026-10-23T10:00:00Z",
        notes: "Window",
      },
      { id: "w2", guestName: "Bad" },
    ],
  });
  assert.deepEqual(entries, [
    {
      id: "w1",
      guestName: "Ravi",
      partySize: 3,
      createdAt: "2026-10-23T10:00:00Z",
      notes: "Window",
    },
  ]);
});

test("wait time is whole minutes and never negative", () => {
  const now = Date.parse("2026-10-23T10:30:00Z");
  assert.equal(minutesWaiting("2026-10-23T10:00:00Z", now), 30);
  assert.equal(minutesWaiting("2026-10-23T11:00:00Z", now), 0);
  assert.equal(minutesWaiting("nonsense", now), 0);
});

test("waitlist quotes are read from the list and the add response", () => {
  const entries = parseWaitlist({
    entries: [
      {
        id: "w1",
        guestName: "Ravi",
        partySize: 2,
        createdAt: "2026-10-11T12:00:00Z",
        quotedWaitMinutes: 25,
      },
      {
        id: "w2",
        guestName: "Asha",
        partySize: 4,
        createdAt: "2026-10-11T12:05:00Z",
        quotedWaitMinutes: -5,
      },
    ],
  });
  assert.equal(entries?.[0].quotedWaitMinutes, 25);
  assert.equal("quotedWaitMinutes" in (entries?.[1] ?? {}), false);
  assert.equal(quotedWaitOf({ entry: { quotedWaitMinutes: 0 } }), 0);
  assert.equal(quotedWaitOf({ entry: {} }), null);
  assert.equal(formatQuotedWait(0), "Table ready now");
  assert.equal(formatQuotedWait(25), "About 25 min");
  assert.equal(formatQuotedWait(120), "Over 2 hours");
});
