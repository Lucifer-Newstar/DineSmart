import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateHealthScore,
  HEALTH_SCORE_RECORD_LIMIT,
} from "../src/healthscore/health-score.service.js";
import {
  HEALTH_SCORE_WEIGHTS,
  type HealthScoreSnapshot,
} from "../src/healthscore/health-score.types.js";

const calculatedAt = new Date("2026-10-10T12:00:00.000Z");
const hourAgo = (minutes: number) => new Date(calculatedAt.getTime() - minutes * 60_000);

function emptySnapshot(): HealthScoreSnapshot {
  return {
    orders: [],
    inventoryItems: [],
    reservations: [],
    tables: [],
    incidents: [],
    thresholds: {},
    truncatedCollections: [],
  };
}

test("health score weights total 100 and all-observed healthy metrics score 100", () => {
  const snapshot = emptySnapshot();
  snapshot.thresholds = {
    kitchenDelayWarningMinutes: 15,
    kitchenDelayCriticalMinutes: 25,
    orderDelayWarningMinutes: 20,
  };
  snapshot.orders = [
    {
      status: "Completed",
      createdAt: hourAgo(60),
      statusTimestamps: { Preparing: hourAgo(25), Ready: hourAgo(10) },
    },
  ];
  snapshot.inventoryItems = [{ quantity: 8, lowStockThreshold: 4 }];
  snapshot.reservations = [{ status: "Seated", startAt: hourAgo(120), endAt: hourAgo(30) }];
  snapshot.tables = [{ status: "occupied" }];

  const result = calculateHealthScore(snapshot, calculatedAt);
  const totalWeight = Object.values(HEALTH_SCORE_WEIGHTS).reduce(
    (total, weight) => total + weight,
    0,
  );

  assert.equal(totalWeight, 100);
  assert.equal(result.score, 100);
  assert.deepEqual(result.sampling, {
    perCollectionLimit: HEALTH_SCORE_RECORD_LIMIT,
    truncatedCollections: [],
  });
  assert.equal(result.components.kitchenEfficiency.status, "observed");
  assert.equal(result.components.inventoryHealth.score, 100);
  assert.equal(result.components.orderCompletionRate.score, 100);
  assert.equal(result.components.reservationEfficiency.score, 100);
  assert.equal(result.components.tableUtilization.score, 100);
  assert.equal(result.components.incidentFrequency.score, 100);
});

test("uses a neutral 50 for missing components without reweighting and treats an empty incident window as observed", () => {
  const result = calculateHealthScore(emptySnapshot(), calculatedAt);

  assert.equal(result.score, 55);
  for (const name of [
    "kitchenEfficiency",
    "inventoryHealth",
    "orderCompletionRate",
    "reservationEfficiency",
    "tableUtilization",
  ] as const) {
    assert.equal(result.components[name].score, 50);
    assert.equal(result.components[name].observations, 0);
    assert.equal(result.components[name].status, "insufficient_data");
  }
  assert.equal(result.components.incidentFrequency.score, 100);
  assert.equal(result.components.incidentFrequency.status, "observed");
  assert.equal(result.components.incidentFrequency.observations, 1);
});

test("normalizes delayed prep, stock, mature orders, reservation outcomes, tables, and incidents", () => {
  const snapshot = emptySnapshot();
  snapshot.thresholds = {
    kitchenDelayWarningMinutes: 15,
    kitchenDelayCriticalMinutes: 25,
    orderDelayWarningMinutes: 20,
  };
  snapshot.orders = [
    {
      status: "Completed",
      createdAt: hourAgo(60),
      statusTimestamps: { Preparing: hourAgo(40), Ready: hourAgo(20) },
    },
    { status: "Accepted", createdAt: hourAgo(60) },
    { status: "Preparing", createdAt: hourAgo(5) },
    { status: "Cancelled", createdAt: hourAgo(60) },
  ];
  snapshot.inventoryItems = [
    { quantity: 4, lowStockThreshold: 4 },
    { quantity: 5, lowStockThreshold: 4 },
  ];
  snapshot.reservations = [
    { status: "Seated", startAt: hourAgo(90), endAt: hourAgo(30) },
    { status: "NoShow", startAt: hourAgo(90), endAt: hourAgo(30) },
    { status: "Cancelled", startAt: hourAgo(90), endAt: hourAgo(30) },
    { status: "Confirmed", startAt: hourAgo(10), endAt: hourAgo(5) },
  ];
  snapshot.tables = [{ status: "occupied" }, { status: "available" }, { status: "out_of_service" }];
  snapshot.incidents = [
    { status: "open", severity: "critical", createdAt: hourAgo(20) },
    { status: "open", severity: "warning", createdAt: hourAgo(10) },
    { status: "open", severity: "info", createdAt: hourAgo(5) },
  ];

  const result = calculateHealthScore(snapshot, calculatedAt);

  assert.equal(result.components.kitchenEfficiency.score, 50);
  assert.equal(result.components.inventoryHealth.score, 50);
  assert.equal(result.components.orderCompletionRate.score, 50);
  assert.equal(result.components.orderCompletionRate.observations, 2);
  assert.equal(result.components.reservationEfficiency.score, 50);
  assert.equal(result.components.reservationEfficiency.observations, 2);
  assert.equal(result.components.tableUtilization.score, 50);
  assert.equal(result.components.incidentFrequency.score, 45);
  assert.equal(result.score, 50);
});
