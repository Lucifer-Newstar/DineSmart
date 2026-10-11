import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import {
  DEFAULT_INCIDENT_THRESHOLDS,
  evaluateIncidentRules,
  normalizeIncidentThresholds,
} from "../src/incidents/incident.rules.js";
import type { IncidentDetectionSnapshot } from "../src/incidents/incident.types.js";

const restaurantId = new ObjectId();
const now = new Date("2026-10-11T12:00:00.000Z");

function emptySnapshot(): IncidentDetectionSnapshot {
  return {
    restaurantId,
    thresholds: {},
    orders: [],
    orderItems: [],
    inventoryItems: [],
    reservations: [],
    tables: [],
    truncatedSources: [],
  };
}

test("approved delay and congestion defaults are used when configured threshold pairs are invalid", () => {
  assert.deepEqual(normalizeIncidentThresholds({}), DEFAULT_INCIDENT_THRESHOLDS);
  assert.deepEqual(
    normalizeIncidentThresholds({
      kitchenDelayWarningMinutes: 40,
      kitchenDelayCriticalMinutes: 20,
      kitchenCongestionWarningOrders: 8.5,
      kitchenCongestionCriticalOrders: 12,
    }),
    DEFAULT_INCIDENT_THRESHOLDS,
  );
});

test("kitchen item delays cross warning and critical thresholds and schedule the next boundary", () => {
  const orderId = new ObjectId();
  const itemId = new ObjectId();
  const startedAt = new Date(now.getTime() - 16 * 60_000);
  const snapshot = emptySnapshot();
  snapshot.orders = [
    {
      id: orderId,
      status: "Preparing",
      createdAt: startedAt,
      statusTimestamps: { Accepted: new Date(now.getTime() - 2 * 60_000) },
    },
  ];
  snapshot.orderItems = [
    { id: itemId, orderId, preparationStatus: "Preparing", updatedAt: startedAt },
  ];

  const warning = evaluateIncidentRules(snapshot, now);
  const warningIncident = warning.incidents.find((incident) => incident.type === "kitchen_delay");
  assert.equal(warningIncident?.severity, "warning");
  assert.equal(warningIncident?.affectedEntity.id, orderId);
  assert.deepEqual(warningIncident?.triggerSnapshot, {
    elapsedMinutes: 16,
    thresholdMinutes: 15,
  });
  assert.equal(warning.nextEvaluationAt?.getTime(), startedAt.getTime() + 25 * 60_000 + 1);

  const critical = evaluateIncidentRules(snapshot, new Date(startedAt.getTime() + 25 * 60_000 + 1));
  assert.equal(
    critical.incidents.find((incident) => incident.type === "kitchen_delay")?.severity,
    "critical",
  );
});

test("accepted-to-ready order delay escalates and clears once the order is ready", () => {
  const orderId = new ObjectId();
  const acceptedAt = new Date(now.getTime() - 21 * 60_000);
  const snapshot = emptySnapshot();
  snapshot.orders = [
    {
      id: orderId,
      status: "Accepted",
      createdAt: acceptedAt,
      statusTimestamps: { Accepted: acceptedAt },
    },
  ];

  const warning = evaluateIncidentRules(snapshot, now).incidents.find(
    (incident) => incident.type === "order_delay",
  );
  assert.equal(warning?.severity, "warning");
  assert.equal(warning?.triggerSnapshot.thresholdMinutes, 20);

  const critical = evaluateIncidentRules(
    snapshot,
    new Date(acceptedAt.getTime() + 30 * 60_000 + 1),
  );
  assert.equal(
    critical.incidents.find((incident) => incident.type === "order_delay")?.severity,
    "critical",
  );

  snapshot.orders[0].status = "Ready";
  assert.equal(
    evaluateIncidentRules(snapshot, now).incidents.some(
      (incident) => incident.type === "order_delay",
    ),
    false,
  );
});

test("kitchen congestion uses the active-order count and oldest-order critical threshold", () => {
  const snapshot = emptySnapshot();
  snapshot.orders = Array.from({ length: 8 }, (_, index) => {
    const createdAt = new Date(now.getTime() - index * 60_000);
    return {
      id: new ObjectId(),
      status: "Accepted" as const,
      createdAt,
      statusTimestamps: { Accepted: createdAt },
    };
  });
  const warning = evaluateIncidentRules(snapshot, now).incidents.find(
    (incident) => incident.type === "kitchen_congestion",
  );
  assert.equal(warning?.severity, "warning");
  assert.equal(warning?.affectedEntity.id, restaurantId);
  assert.equal(warning?.triggerSnapshot.activeOrderCount, 8);

  snapshot.orders = Array.from({ length: 12 }, () => {
    const acceptedAt = new Date(now.getTime() - 5 * 60_000);
    return {
      id: new ObjectId(),
      status: "Preparing" as const,
      createdAt: acceptedAt,
      statusTimestamps: { Accepted: acceptedAt },
    };
  });
  assert.equal(
    evaluateIncidentRules(snapshot, now).incidents.find(
      (incident) => incident.type === "kitchen_congestion",
    )?.severity,
    "critical",
  );

  snapshot.orders = [
    {
      id: new ObjectId(),
      status: "Preparing",
      createdAt: new Date(now.getTime() - 31 * 60_000),
      statusTimestamps: { Accepted: new Date(now.getTime() - 31 * 60_000) },
    },
  ];
  assert.equal(
    evaluateIncidentRules(snapshot, now).incidents.find(
      (incident) => incident.type === "kitchen_congestion",
    )?.severity,
    "critical",
  );
});

test("inventory shortage uses each item threshold and critical severity at zero", () => {
  const snapshot = emptySnapshot();
  const warningId = new ObjectId();
  const criticalId = new ObjectId();
  snapshot.inventoryItems = [
    { id: warningId, quantity: 4, lowStockThreshold: 4, unit: "kg" },
    { id: criticalId, quantity: 0, lowStockThreshold: 4, unit: "kg" },
    { id: new ObjectId(), quantity: 5, lowStockThreshold: 4, unit: "kg" },
  ];

  const incidents = evaluateIncidentRules(snapshot, now).incidents.filter(
    (incident) => incident.type === "inventory_shortage",
  );
  assert.equal(incidents.length, 2);
  assert.equal(
    incidents.find((incident) => incident.affectedEntity.id === warningId)?.severity,
    "warning",
  );
  assert.equal(
    incidents.find((incident) => incident.affectedEntity.id === criticalId)?.severity,
    "critical",
  );
});

test("reservation conflicts detect overlapping tables, excess capacity, and unavailable confirmed assignments", () => {
  const snapshot = emptySnapshot();
  const tableId = new ObjectId();
  const capacityTableId = new ObjectId();
  const overlapStart = new Date(now.getTime() + 60 * 60_000);
  const tableCapacityStart = new Date(now.getTime() + 3 * 60 * 60_000);
  snapshot.tables = [
    { id: tableId, capacity: 4, status: "Reserved" },
    { id: capacityTableId, capacity: 4, status: "Out of service" },
  ];
  snapshot.reservations = [
    {
      id: new ObjectId(),
      tableId,
      partySize: 3,
      startAt: overlapStart,
      endAt: new Date(overlapStart.getTime() + 90 * 60_000),
      status: "Confirmed",
    },
    {
      id: new ObjectId(),
      tableId,
      partySize: 4,
      startAt: new Date(overlapStart.getTime() + 30 * 60_000),
      endAt: new Date(overlapStart.getTime() + 2 * 60 * 60_000),
      status: "Confirmed",
    },
    {
      id: new ObjectId(),
      tableId: capacityTableId,
      partySize: 6,
      startAt: tableCapacityStart,
      endAt: new Date(tableCapacityStart.getTime() + 90 * 60_000),
      status: "Confirmed",
    },
  ];

  const evaluation = evaluateIncidentRules(snapshot, now);
  const incidents = evaluation.incidents.filter(
    (incident) => incident.type === "reservation_conflict",
  );
  assert.equal(evaluation.nextEvaluationAt?.getTime(), overlapStart.getTime() + 90 * 60_000 + 1);
  assert.equal(incidents.length, 3);
  assert.equal(
    incidents.find(
      (incident) =>
        incident.affectedEntity.type === "table" && incident.affectedEntity.id.equals(tableId),
    )?.severity,
    "warning",
  );
  assert.equal(
    incidents.find((incident) => incident.affectedEntity.type === "reservation")?.severity,
    "warning",
  );
  assert.equal(
    incidents.find(
      (incident) =>
        incident.affectedEntity.type === "table" &&
        incident.affectedEntity.id.equals(capacityTableId),
    )?.severity,
    "critical",
  );
});
