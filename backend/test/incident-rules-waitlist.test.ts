import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import {
  DEFAULT_INCIDENT_THRESHOLDS,
  evaluateIncidentRules,
  normalizeIncidentThresholds,
} from "../src/incidents/incident.rules.js";
import type {
  DetectionTable,
  DetectionWaitlistEntry,
  IncidentCandidate,
  IncidentDetectionSnapshot,
} from "../src/incidents/incident.types.js";

const restaurantId = new ObjectId();
const now = new Date("2026-10-11T12:00:00.000Z");
const minute = 60_000;

function emptySnapshot(): IncidentDetectionSnapshot {
  return {
    restaurantId,
    thresholds: {},
    orders: [],
    orderItems: [],
    inventoryItems: [],
    reservations: [],
    tables: [],
    waitlistEntries: [],
    truncatedSources: [],
  };
}

function table(capacity: number, status = "available"): DetectionTable {
  return { id: new ObjectId(), capacity, status };
}

function waiting(partySize: number, waitedMinutes: number): DetectionWaitlistEntry {
  return {
    id: new ObjectId(),
    partySize,
    status: "waiting",
    createdAt: new Date(now.getTime() - waitedMinutes * minute),
  };
}

function find(incidents: IncidentCandidate[], type: string): IncidentCandidate | undefined {
  return incidents.find((incident) => incident.type === type);
}

test("queue congestion thresholds default and validate as a warning/critical pair", () => {
  const defaults = normalizeIncidentThresholds({});
  assert.equal(defaults.queueCongestionWarningParties, 4);
  assert.equal(defaults.queueCongestionCriticalParties, 7);
  assert.equal(defaults.queueCongestionWarningWaitMinutes, 25);
  assert.equal(defaults.queueCongestionCriticalWaitMinutes, 45);
  assert.deepEqual(defaults, { ...DEFAULT_INCIDENT_THRESHOLDS, ...defaults });

  // A non-integer party count or an inverted pair falls back to the defaults.
  assert.equal(
    normalizeIncidentThresholds({ queueCongestionWarningParties: 2.5 })
      .queueCongestionWarningParties,
    DEFAULT_INCIDENT_THRESHOLDS.queueCongestionWarningParties,
  );
  assert.equal(
    normalizeIncidentThresholds({
      queueCongestionWarningParties: 9,
      queueCongestionCriticalParties: 3,
    }).queueCongestionCriticalParties,
    DEFAULT_INCIDENT_THRESHOLDS.queueCongestionCriticalParties,
  );
});

test("a short queue under every threshold raises nothing", () => {
  const snapshot = emptySnapshot();
  snapshot.waitlistEntries = [waiting(2, 5), waiting(4, 3)];
  snapshot.tables = [table(4), table(2)];

  const evaluation = evaluateIncidentRules(snapshot, now);
  assert.equal(find(evaluation.incidents, "queue_congestion"), undefined);
  assert.equal(find(evaluation.incidents, "table_congestion"), undefined);
  assert.ok(evaluation.nextEvaluationAt, "the next wait boundary must be scheduled");
});

test("the queue escalates from warning to critical on count and on longest wait", () => {
  const snapshot = emptySnapshot();
  snapshot.waitlistEntries = [waiting(2, 2), waiting(2, 3), waiting(3, 4), waiting(4, 5)];
  snapshot.tables = [table(8)];

  const warning = find(evaluateIncidentRules(snapshot, now).incidents, "queue_congestion");
  assert.equal(warning?.severity, "warning");
  assert.equal(warning?.affectedEntity.type, "restaurant");
  assert.equal(warning?.affectedEntity.id, restaurantId);
  assert.equal(warning?.triggerSnapshot.queueLength, 4);
  assert.equal(warning?.triggerSnapshot.partySize, 4);
  assert.equal(warning?.triggerSnapshot.thresholdMinutes, 25);

  snapshot.waitlistEntries.push(waiting(2, 1), waiting(2, 1), waiting(6, 2));
  const critical = find(evaluateIncidentRules(snapshot, now).incidents, "queue_congestion");
  assert.equal(critical?.severity, "critical");
  assert.equal(critical?.triggerSnapshot.queueLength, 7);
  assert.equal(critical?.triggerSnapshot.thresholdMinutes, 45);

  // Count alone can stay warning; the longest wait is what escalates it.
  const longWait = emptySnapshot();
  longWait.waitlistEntries = [waiting(2, 46)];
  longWait.tables = [table(8)];
  assert.equal(
    find(evaluateIncidentRules(longWait, now).incidents, "queue_congestion")?.severity,
    "critical",
  );
});

test("a waiting queue with no table able to seat the largest party raises table congestion", () => {
  const snapshot = emptySnapshot();
  // The largest party has waited past the warning threshold with no table that
  // can seat it, although the queue is short.
  snapshot.waitlistEntries = [waiting(2, 6), waiting(6, 26), waiting(5, 2)];
  snapshot.tables = [table(2, "available"), table(4, "occupied"), table(2, "reserved")];

  const evaluation = evaluateIncidentRules(snapshot, now);
  const queue = find(evaluation.incidents, "queue_congestion");
  const tablesIncident = find(evaluation.incidents, "table_congestion");
  assert.equal(tablesIncident?.severity, "warning");
  assert.equal(tablesIncident?.affectedEntity.id, restaurantId);
  assert.equal(tablesIncident?.triggerSnapshot.partySize, 6);
  assert.equal(tablesIncident?.triggerSnapshot.available, 1);
  assert.equal(tablesIncident?.triggerSnapshot.capacity, 2);
  assert.equal(queue?.triggerSnapshot.queueLength, 3);

  // Seating the large party at a big enough free table clears the table incident
  // but leaves the queue itself over its party-count threshold.
  snapshot.tables.push(table(8, "available"));
  const cleared = evaluateIncidentRules(snapshot, now);
  assert.equal(find(cleared.incidents, "table_congestion"), undefined);
  assert.ok(find(cleared.incidents, "queue_congestion"));
});

test("an empty floor while parties wait is critical once the queue is critical", () => {
  const snapshot = emptySnapshot();
  snapshot.waitlistEntries = [waiting(2, 1), waiting(3, 2), waiting(4, 3), waiting(5, 46)];
  snapshot.tables = [table(4, "occupied"), table(6, "disabled")];

  const incident = find(evaluateIncidentRules(snapshot, now).incidents, "table_congestion");
  assert.equal(incident?.severity, "critical");
  assert.equal(incident?.triggerSnapshot.available, 0);
  assert.equal(incident?.triggerSnapshot.capacity, 0);
  assert.match(String(incident?.rootCause), /No table is available/);
});

test("a short wait with no free table stays quiet until the wait threshold is crossed", () => {
  const snapshot = emptySnapshot();
  snapshot.waitlistEntries = [waiting(6, 4)];
  snapshot.tables = [table(2, "occupied"), table(4, "disabled")];

  const evaluation = evaluateIncidentRules(snapshot, now);
  assert.equal(find(evaluation.incidents, "table_congestion"), undefined);
  assert.equal(find(evaluation.incidents, "queue_congestion"), undefined);

  snapshot.waitlistEntries = [waiting(6, 26)];
  assert.equal(
    find(evaluateIncidentRules(snapshot, now).incidents, "table_congestion")?.severity,
    "warning",
  );
});

test("seated, cancelled, and no-show entries are ignored by the queue rules", () => {
  const snapshot = emptySnapshot();
  snapshot.waitlistEntries = [
    { ...waiting(9, 90), status: "seated" },
    { ...waiting(9, 90), status: "cancelled" },
    { ...waiting(9, 90), status: "no_show" },
    waiting(2, 1),
  ];
  snapshot.tables = [table(8, "occupied")];

  const evaluation = evaluateIncidentRules(snapshot, now);
  assert.equal(find(evaluation.incidents, "queue_congestion"), undefined);
  assert.equal(find(evaluation.incidents, "table_congestion"), undefined);
});
