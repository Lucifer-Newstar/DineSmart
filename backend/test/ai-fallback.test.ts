import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncidentRecommendationContext } from "../src/ai/contracts.js";
import { buildFallbackRecommendation } from "../src/ai/fallback.recommendations.js";

function context(
  type: string,
  options: {
    severity?: "info" | "warning" | "critical";
    trigger?: Record<string, string | number | boolean>;
    activeOrders?: Array<{ status: string; ageMinutes: number }>;
    lowStockItems?: Array<{
      name: string;
      quantity: number;
      unit: string;
      lowStockThreshold: number;
    }>;
  } = {},
): IncidentRecommendationContext {
  return {
    incident: {
      type,
      severity: options.severity ?? "warning",
      status: "active",
      ageMinutes: 12,
      trigger: options.trigger ?? {},
    },
    restaurant: { timezone: "Asia/Kolkata", currency: "INR", thresholds: {} },
    operations: {
      activeOrders: options.activeOrders ?? [],
      lowStockItems: options.lowStockItems ?? [],
      upcomingReservations: [],
    },
  };
}

test("queue congestion guidance cites the queue length, wait, and threshold", () => {
  const recommendation = buildFallbackRecommendation(
    context("queue_congestion", {
      severity: "critical",
      trigger: { queueLength: 7, partySize: 6, elapsedMinutes: 47, thresholdMinutes: 45 },
    }),
  );

  assert.match(recommendation.summary, /7 parties are waiting/);
  assert.match(recommendation.summary, /party of 6/);
  assert.match(recommendation.rootCause, /47 minutes/);
  assert.match(recommendation.rootCause, /45 minutes/);
  assert.equal(recommendation.priority, "critical");
  assert.equal(recommendation.actions.length, 2);
  assert.ok(recommendation.confidence > 0.6);
});

test("table congestion guidance distinguishes no free table from no large enough table", () => {
  const emptyFloor = buildFallbackRecommendation(
    context("table_congestion", { trigger: { available: 0, capacity: 0, partySize: 6 } }),
  );
  assert.match(emptyFloor.rootCause, /No table is currently marked available/);

  const tooSmall = buildFallbackRecommendation(
    context("table_congestion", {
      trigger: { available: 2, capacity: 4, partySize: 6, elapsedMinutes: 26 },
    }),
  );
  assert.match(tooSmall.rootCause, /largest free table seats 4/);
  assert.match(tooSmall.rootCause, /party of 6/);
  assert.match(tooSmall.rootCause, /26 minutes/);
  assert.equal(tooSmall.priority, "warning");
});

test("congestion guidance degrades safely when the trigger snapshot is empty", () => {
  for (const type of ["queue_congestion", "table_congestion"]) {
    const recommendation = buildFallbackRecommendation(context(type));
    assert.ok(recommendation.summary.length > 20);
    assert.match(recommendation.rootCause, /No guest identity is included/);
    assert.ok(
      recommendation.confidence <= 0.5,
      `${type} should be less confident without evidence`,
    );
    for (const action of recommendation.actions) {
      assert.ok(action.description.length > 20);
      assert.ok(action.rationale.length > 20);
      assert.ok(action.expectedImpact.length > 20);
    }
  }
});

test("the fallback never echoes guest identity or invents operational numbers", () => {
  const recommendation = buildFallbackRecommendation(
    context("table_congestion", {
      trigger: { available: 1, capacity: 2, partySize: 5, elapsedMinutes: 31 },
    }),
  );
  const serialized = JSON.stringify(recommendation);
  assert.doesNotMatch(serialized, /@/);
  assert.doesNotMatch(serialized, /\+?\d[\d ().-]{7,}\d/);
  assert.doesNotMatch(serialized, /undefined|NaN/);
});

test("existing branches keep their incident-specific behaviour", () => {
  const inventory = buildFallbackRecommendation(
    context("inventory_shortage", {
      lowStockItems: [{ name: "Paneer", quantity: 1, unit: "kg", lowStockThreshold: 5 }],
    }),
  );
  assert.match(inventory.summary, /Paneer/);
  assert.match(inventory.rootCause, /1 kg/);

  const delay = buildFallbackRecommendation(
    context("kitchen_delay", {
      activeOrders: [{ status: "Preparing", ageMinutes: 22 }],
      trigger: { queueLength: 9 },
    }),
  );
  assert.match(delay.rootCause, /22 minutes/);
  assert.match(delay.rootCause, /queue of 9/);

  const reservation = buildFallbackRecommendation(context("reservation_conflict"));
  assert.match(reservation.summary, /seating window/);

  const unknown = buildFallbackRecommendation(context("staff_shortage"));
  assert.match(unknown.rootCause, /no incident-specific evidence rule/);
  assert.ok(unknown.confidence <= 0.4);
});
