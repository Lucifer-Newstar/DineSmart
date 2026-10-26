import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTableSuggestion,
  reservationActions,
} from "../src/app/_dashboard/reservation-actions.ts";

const startAt = "2026-10-11T13:30:00.000Z";
const labels = (status, now = "2026-10-11T13:00:00.000Z") =>
  reservationActions({ status, startAt }, new Date(now)).map((action) => action.label);

test("each status offers the next steps the API accepts", () => {
  assert.deepEqual(labels("Awaiting"), ["Confirm", "Mark arrived"]);
  assert.deepEqual(labels("Confirmed"), ["Mark arrived", "Seat guest"]);
  assert.deepEqual(labels("Arrived"), ["Seat guest"]);
  assert.deepEqual(labels("Seated"), ["Complete"]);
  assert.deepEqual(labels("Completed"), []);
  assert.deepEqual(labels("Cancelled"), []);
});

test("no-show appears only after the 15-minute grace period", () => {
  assert.deepEqual(labels("Confirmed", "2026-10-11T13:44:59.000Z"), ["Mark arrived", "Seat guest"]);
  assert.deepEqual(labels("Confirmed", "2026-10-11T13:45:00.000Z"), [
    "Mark arrived",
    "Seat guest",
    "No-show",
  ]);
});

test("table suggestions parse single and combined answers and reject the rest", () => {
  assert.deepEqual(
    parseTableSuggestion({
      suggestion: { kind: "single", tables: [{ id: "a", tableNumber: "02", capacity: 4 }] },
    }),
    { kind: "single", tables: [{ id: "a", tableNumber: "02" }] },
  );
  assert.equal(
    parseTableSuggestion({
      suggestion: {
        kind: "combined",
        tables: [
          { id: "a", tableNumber: "02" },
          { id: "b", tableNumber: "03" },
        ],
      },
    })?.tables.length,
    2,
  );
  assert.equal(parseTableSuggestion({ suggestion: null }), null);
  assert.equal(parseTableSuggestion({ suggestion: { kind: "odd", tables: [] } }), null);
  assert.equal(parseTableSuggestion({ suggestion: { kind: "single", tables: [{}] } }), null);
});
