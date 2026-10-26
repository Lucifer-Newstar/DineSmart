import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBookingRulesResponse,
  partyRangeLabel,
  validateBookingRules,
} from "../src/app/_dashboard/booking-rules-data.ts";

const payload = {
  usingDefaults: true,
  rules: {
    turnTimes: [
      { maxPartySize: 4, minutes: 90 },
      { maxPartySize: 2, minutes: 75 },
      { maxPartySize: 12, minutes: 150 },
    ],
    pacingCoversPer15Min: 20,
    minLeadMinutes: 60,
    maxAdvanceDays: 60,
    changeCutoffMinutes: 120,
  },
};

test("rules load into an editable form sorted by party size", () => {
  const parsed = parseBookingRulesResponse(payload);
  assert.equal(parsed?.usingDefaults, true);
  assert.deepEqual(
    parsed?.form.turnTimes.map((row) => [row.maxPartySize, row.minutes]),
    [
      [2, "75"],
      [4, "90"],
      [12, "150"],
    ],
  );
  assert.equal(parsed?.form.pacingCoversPer15Min, "20");
  assert.equal(parseBookingRulesResponse({ rules: { turnTimes: [] } }), null);
  assert.equal(parseBookingRulesResponse(null), null);
});

test("valid values become the API body", () => {
  const parsed = parseBookingRulesResponse(payload);
  assert.ok(parsed);
  const result = validateBookingRules({ ...parsed.form, minLeadMinutes: " 30 " });
  assert.equal(result.errors, null);
  assert.equal(result.body?.minLeadMinutes, 30);
  assert.deepEqual(result.body?.turnTimes[0], { maxPartySize: 2, minutes: 75 });
});

test("out-of-range and non-numeric values are reported per field", () => {
  const parsed = parseBookingRulesResponse(payload);
  assert.ok(parsed);
  const result = validateBookingRules({
    ...parsed.form,
    turnTimes: parsed.form.turnTimes.map((row, index) =>
      index === 1 ? { ...row, minutes: "10" } : row,
    ),
    pacingCoversPer15Min: "0",
    maxAdvanceDays: "two",
    changeCutoffMinutes: "-5",
  });
  assert.equal(result.body, null);
  assert.deepEqual(Object.keys(result.errors ?? {}).sort(), [
    "changeCutoffMinutes",
    "maxAdvanceDays",
    "pacingCoversPer15Min",
    "turn-1",
  ]);
});

test("party ranges read naturally", () => {
  const rows = [
    { maxPartySize: 2, minutes: "75" },
    { maxPartySize: 3, minutes: "90" },
    { maxPartySize: 12, minutes: "150" },
  ];
  assert.equal(partyRangeLabel(rows, 0), "1–2 guests");
  assert.equal(partyRangeLabel(rows, 1), "3 guests");
  assert.equal(partyRangeLabel(rows, 2), "4–12 guests");
});
