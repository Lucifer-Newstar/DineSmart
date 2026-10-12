import assert from "node:assert/strict";
import test from "node:test";
import { parseIncidentsResponse } from "../src/app/incident-data.ts";

const INCIDENT_ID = "71000000000000000000001d";
const ENTITY_ID = "710000000000000000000016";
const OTHER_INCIDENT_ID = "71000000000000000000001c";

function incident(overrides = {}) {
  return {
    id: INCIDENT_ID,
    type: "inventory_shortage",
    severity: "critical",
    status: "open",
    triggerSnapshot: { available: 2.4, lowStockThreshold: 4, unit: "kg" },
    affectedEntity: { type: "inventory_item", id: ENTITY_ID },
    rootCause: "Paneer stock is below the configured reorder threshold.",
    createdAt: "2026-10-12T06:00:00.000Z",
    updatedAt: "2026-10-12T06:01:00.000Z",
    resolvedAt: null,
    resolutionReason: null,
    ...overrides,
  };
}

function parseSingle(record) {
  return parseIncidentsResponse({ incidents: [record], truncated: false });
}

test("incident parser preserves bounded live fields and normalizes timestamps", () => {
  const resolved = incident({
    id: OTHER_INCIDENT_ID,
    type: "reservation_conflict",
    severity: "warning",
    status: "resolved",
    triggerSnapshot: { partySize: 2, conflictCount: 1, tableStatus: "reserved" },
    affectedEntity: { type: "reservation", id: "710000000000000000000025" },
    rootCause: "A reservation overlap was cleared.",
    createdAt: "2026-10-12T06:00:00Z",
    updatedAt: "2026-10-12T06:10:00Z",
    resolvedAt: "2026-10-12T06:10:00Z",
    resolutionReason: "condition_cleared",
  });

  const parsed = parseIncidentsResponse({ incidents: [incident(), resolved], truncated: true });
  assert.equal(parsed?.truncated, true);
  assert.equal(parsed?.incidents.length, 2);
  assert.equal(parsed?.incidents[0].triggerSnapshot.available, 2.4);
  assert.equal(
    parsed?.incidents[0].rootCause,
    "Paneer stock is below the configured reorder threshold.",
  );
  assert.equal(parsed?.incidents[1].status, "resolved");
  assert.equal(parsed?.incidents[1].resolvedAt, "2026-10-12T06:10:00.000Z");
  assert.equal(parsed?.incidents[1].resolutionReason, "condition_cleared");
});

test("incident parser distinguishes an empty list from malformed payloads", () => {
  assert.deepEqual(parseIncidentsResponse({ incidents: [], truncated: false }), {
    incidents: [],
    truncated: false,
  });
  assert.equal(parseIncidentsResponse({ incidents: [], truncated: "false" }), null);
  assert.equal(parseIncidentsResponse({ incidents: "not-an-array", truncated: false }), null);
  assert.equal(parseIncidentsResponse(null), null);
});

test("incident parser rejects invalid, duplicate, or oversized records", () => {
  const invalidRecords = [
    incident({ id: "not-an-object-id" }),
    incident({ type: "Inventory Shortage" }),
    incident({ severity: "urgent" }),
    incident({ status: "acknowledged" }),
    incident({ affectedEntity: { type: "inventory_item", id: "bad-id" } }),
    incident({ rootCause: "x".repeat(501) }),
    incident({ resolutionReason: "x".repeat(81) }),
    incident({ createdAt: "October 12, 2026" }),
    incident({ updatedAt: "2026-10-12T00:00:00.000Z\nignored" }),
  ];
  for (const record of invalidRecords) assert.equal(parseSingle(record), null);

  assert.equal(
    parseIncidentsResponse({ incidents: [incident(), incident()], truncated: false }),
    null,
  );
  assert.equal(
    parseIncidentsResponse({
      incidents: Array.from({ length: 201 }, () => incident()),
      truncated: true,
    }),
    null,
  );
});

test("incident parser fails closed on unsafe or unbounded trigger snapshot fields", () => {
  const unsafeSnapshots = [
    { customerEmail: "guest@example.com" },
    { note: "customer-specific detail" },
    { available: -1 },
    { available: Number.POSITIVE_INFINITY },
    { unit: "k".repeat(81) },
    Object.fromEntries(Array.from({ length: 13 }, (_, index) => [`field${index}`, index])),
  ];
  for (const triggerSnapshot of unsafeSnapshots) {
    assert.equal(parseSingle(incident({ triggerSnapshot })), null);
  }
});
