import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDemoFixtureSummary, summarizeDemoFixtures } from "../src/database/demo-fixtures.js";
import { COLLECTIONS } from "../src/database/schema.js";
import { DEMO_IDS, DEMO_PASSWORD } from "../src/database/seed-data.js";

const summary = summarizeDemoFixtures(new Date("2026-10-12T09:00:00.000Z"));

test("the fixture summary describes the demo restaurant and its accounts", () => {
  assert.equal(summary.restaurant.id, DEMO_IDS.restaurant);
  assert.equal(summary.restaurant.name, "Saffron & Co.");
  assert.equal(summary.restaurant.currency, "INR");

  const byRole = new Map(summary.accounts.map((account) => [account.role, account]));
  assert.deepEqual([...byRole.keys()].sort(), [
    "Administrator",
    "Customer",
    "Kitchen Staff",
    "Manager",
    "Reception",
  ]);
  assert.equal(byRole.get("Manager")?.email, "manager@saffronandco.demo");
  assert.equal(byRole.get("Customer")?.email, "ananya@saffronandco.demo");

  const report = formatDemoFixtureSummary(summary);
  assert.ok(!report.includes(DEMO_PASSWORD), "the report never prints the demo password");
  assert.ok(!report.includes("passwordHash"));
  assert.match(report, /40 seeded records/);
});

test("the fixture summary reports every seeded collection count", () => {
  const counts = new Map(summary.counts.map(({ collection, count }) => [collection, count]));

  assert.equal(counts.get(COLLECTIONS.users), 5);
  assert.equal(counts.get(COLLECTIONS.menuItems), 4);
  assert.equal(counts.get(COLLECTIONS.tables), 4);
  assert.equal(counts.get(COLLECTIONS.inventoryItems), 4);
  assert.equal(counts.get(COLLECTIONS.orders), 3);
  assert.equal(counts.get(COLLECTIONS.incidents), 3);
  assert.equal(counts.get(COLLECTIONS.recommendations), 2);
  assert.equal(counts.get(COLLECTIONS.notifications), 3);
  assert.equal(counts.get(COLLECTIONS.bills), 1);
  assert.equal(summary.counts.length, 15);
  assert.equal(
    summary.totalRecords,
    summary.counts.reduce((total, { count }) => total + count, 0),
  );
});

test("the fixture summary describes the seeded incident and recommendation scenario", () => {
  assert.deepEqual(
    summary.incidents.map((incident) => [incident.id, incident.status]),
    [
      [DEMO_IDS.incidentKitchen, "open"],
      [DEMO_IDS.incidentInventory, "open"],
      [DEMO_IDS.incidentReservation, "resolved"],
    ],
  );
  assert.deepEqual(
    summary.incidents.map((incident) => incident.type),
    ["kitchen_delay", "inventory_shortage", "reservation_conflict"],
  );

  assert.deepEqual(
    summary.recommendations.map((recommendation) => [
      recommendation.id,
      recommendation.incidentId,
      recommendation.source,
    ]),
    [
      [DEMO_IDS.recommendationKitchen, DEMO_IDS.incidentKitchen, "demo"],
      [DEMO_IDS.recommendationInventory, DEMO_IDS.incidentInventory, "demo"],
    ],
  );
  assert.equal(summary.recommendations[0].actionCount, 2);
  assert.equal(summary.recommendations[1].priority, "critical");
});
