import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BookingRulesError,
  DEFAULT_BOOKING_RULES,
  parseBookingRules,
  resolveBookingRules,
  turnTimeMinutes,
} from "../src/reservations/booking-rules.js";

const validRules = {
  turnTimes: [
    { maxPartySize: 6, minutes: 120 },
    { maxPartySize: 2, minutes: 75 },
    { maxPartySize: 12, minutes: 150 },
  ],
  pacingCoversPer15Min: 16,
  minLeadMinutes: 30,
  maxAdvanceDays: 30,
  changeCutoffMinutes: 60,
};

test("booking rules sort turn times by party size and pick the first rule that fits", () => {
  const rules = parseBookingRules(validRules);
  assert.deepEqual(
    rules.turnTimes.map((rule) => rule.maxPartySize),
    [2, 6, 12],
  );
  assert.equal(turnTimeMinutes(rules, 1), 75);
  assert.equal(turnTimeMinutes(rules, 2), 75);
  assert.equal(turnTimeMinutes(rules, 3), 120);
  assert.equal(turnTimeMinutes(rules, 12), 150);
});

test("booking rules reject unknown keys, duplicate sizes, gaps at the top and out-of-range values", () => {
  for (const bad of [
    null,
    [],
    { ...validRules, extra: 1 },
    { ...validRules, turnTimes: [] },
    { ...validRules, turnTimes: [{ maxPartySize: 6, minutes: 90 }] },
    {
      ...validRules,
      turnTimes: [
        { maxPartySize: 12, minutes: 90 },
        { maxPartySize: 12, minutes: 100 },
      ],
    },
    { ...validRules, turnTimes: [{ maxPartySize: 12, minutes: 10 }] },
    { ...validRules, turnTimes: [{ maxPartySize: 12, minutes: 90, zone: "patio" }] },
    { ...validRules, pacingCoversPer15Min: 0 },
    { ...validRules, minLeadMinutes: 1.5 },
    { ...validRules, maxAdvanceDays: 0 },
    { ...validRules, changeCutoffMinutes: -1 },
  ]) {
    assert.throws(() => parseBookingRules(bad), BookingRulesError);
  }
});

test("stored rules fall back to the defaults when missing or damaged, without sharing state", () => {
  const fallback = resolveBookingRules(undefined);
  assert.deepEqual(fallback, DEFAULT_BOOKING_RULES);
  fallback.turnTimes[0].minutes = 5;
  assert.equal(DEFAULT_BOOKING_RULES.turnTimes[0].minutes, 90);
  assert.deepEqual(resolveBookingRules({ turnTimes: "broken" }), DEFAULT_BOOKING_RULES);
  assert.equal(resolveBookingRules(validRules).pacingCoversPer15Min, 16);
});
