import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { IncidentDetectionService } from "../src/incidents/incident.service.js";
import {
  type IncidentCandidate,
  type IncidentDetectionRepository,
  type IncidentDetectionSnapshot,
  type IncidentListResult,
  type IncidentRecord,
  incidentIdentityKey,
} from "../src/incidents/incident.types.js";
import type { RestaurantRealtimeEvent } from "../src/realtime/realtime.types.js";

const restaurantId = new ObjectId();
const itemId = new ObjectId();
const now = new Date("2026-10-11T12:00:00.000Z");

class FakeIncidentRepository implements IncidentDetectionRepository {
  snapshot: IncidentDetectionSnapshot = {
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
  incidents: IncidentRecord[] = [];

  async listActiveRestaurantIds(): Promise<ObjectId[]> {
    return [restaurantId];
  }

  async getSnapshot(): Promise<IncidentDetectionSnapshot> {
    return this.snapshot;
  }

  async listActiveIncidents(): Promise<IncidentListResult> {
    return {
      incidents: this.incidents.filter((incident) => ["open", "active"].includes(incident.status)),
      truncated: false,
    };
  }

  async upsertActiveIncident(
    scopedRestaurantId: ObjectId,
    candidate: IncidentCandidate,
    at: Date,
  ): Promise<boolean> {
    const key = incidentIdentityKey(candidate);
    const active = this.incidents.find(
      (incident) =>
        incident.restaurantId.equals(scopedRestaurantId) &&
        ["open", "active"].includes(incident.status) &&
        incidentIdentityKey(incident) === key,
    );
    if (active) {
      active.status = "open";
      active.severity = candidate.severity;
      active.triggerSnapshot = candidate.triggerSnapshot;
      active.affectedEntity = candidate.affectedEntity;
      active.rootCause = candidate.rootCause;
      active.updatedAt = at;
      active.resolvedAt = null;
      active.resolutionReason = undefined;
      return false;
    }
    this.incidents.push({
      id: new ObjectId(),
      restaurantId: scopedRestaurantId,
      type: candidate.type,
      severity: candidate.severity,
      status: "open",
      triggerSnapshot: candidate.triggerSnapshot,
      affectedEntity: candidate.affectedEntity,
      rootCause: candidate.rootCause,
      createdAt: at,
      updatedAt: at,
    });
    return true;
  }

  async resolveActiveIncident(
    scopedRestaurantId: ObjectId,
    incidentId: ObjectId,
    at: Date,
  ): Promise<void> {
    const incident = this.incidents.find(
      (item) => item.restaurantId.equals(scopedRestaurantId) && item.id.equals(incidentId),
    );
    if (!incident || !["open", "active"].includes(incident.status)) return;
    incident.status = "resolved";
    incident.resolvedAt = at;
    incident.resolutionReason = "condition_cleared";
    incident.updatedAt = at;
  }

  async listForRestaurant(scopedRestaurantId: ObjectId): Promise<IncidentListResult> {
    return {
      incidents: this.incidents.filter((incident) =>
        incident.restaurantId.equals(scopedRestaurantId),
      ),
      truncated: false,
    };
  }
}

test("incident evaluation updates one active record, auto-resolves it, and creates a fresh recurrence", async () => {
  const repository = new FakeIncidentRepository();
  repository.snapshot.inventoryItems = [
    { id: itemId, quantity: 3, lowStockThreshold: 5, unit: "kg" },
  ];
  const healthRefreshes: ObjectId[] = [];
  const realtimeEvents: RestaurantRealtimeEvent[] = [];
  const service = new IncidentDetectionService(
    repository,
    () => now,
    (tenantId) => {
      healthRefreshes.push(tenantId);
    },
    (event) => realtimeEvents.push(event),
  );

  const created = await service.evaluateRestaurant(restaurantId);
  assert.equal(created.upsertedCount, 1);
  assert.equal(created.resolvedCount, 0);
  const firstId = repository.incidents[0].id;
  assert.equal(repository.incidents[0].status, "open");

  repository.snapshot.inventoryItems[0].quantity = 0;
  const updated = await service.evaluateRestaurant(restaurantId, new Date(now.getTime() + 1000));
  assert.equal(updated.upsertedCount, 1);
  assert.equal(repository.incidents.length, 1);
  assert.equal(repository.incidents[0].id, firstId);
  assert.equal(repository.incidents[0].severity, "critical");

  repository.snapshot.inventoryItems[0].quantity = 6;
  const resolved = await service.evaluateRestaurant(restaurantId, new Date(now.getTime() + 2000));
  assert.equal(resolved.resolvedCount, 1);
  assert.equal(repository.incidents[0].status, "resolved");
  assert.equal(repository.incidents[0].resolutionReason, "condition_cleared");
  assert.equal(repository.incidents[0].resolvedAt?.getTime(), now.getTime() + 2000);

  repository.snapshot.inventoryItems[0].quantity = 4;
  const recurrence = await service.evaluateRestaurant(restaurantId, new Date(now.getTime() + 3000));
  assert.equal(recurrence.upsertedCount, 1);
  assert.equal(repository.incidents.length, 2);
  assert.notEqual(repository.incidents[1].id, firstId);
  assert.equal(repository.incidents[1].status, "open");
  assert.deepEqual(
    healthRefreshes,
    Array.from({ length: 4 }, () => restaurantId),
  );
  assert.deepEqual(
    realtimeEvents.map((event) => event.data),
    [{ changedCount: 1 }, { changedCount: 1 }, { changedCount: 1 }, { changedCount: 1 }],
  );
});

test("only newly opened incidents notify, and a notifier failure does not fail the sweep", async () => {
  const repository = new FakeIncidentRepository();
  repository.snapshot.inventoryItems = [
    { id: itemId, quantity: 3, lowStockThreshold: 5, unit: "kg" },
  ];
  const notified: string[][] = [];
  let failNext = false;
  const service = new IncidentDetectionService(
    repository,
    () => now,
    undefined,
    undefined,
    async (_tenantId, incidents) => {
      notified.push(incidents.map((incident) => incident.type));
      if (failNext) throw new Error("notification store unavailable");
    },
  );

  await service.evaluateRestaurant(restaurantId);
  assert.deepEqual(notified, [["inventory_shortage"]]);

  repository.snapshot.inventoryItems[0].quantity = 0;
  await service.evaluateRestaurant(restaurantId, new Date(now.getTime() + 1000));
  assert.equal(notified.length, 1, "a severity refresh of an open incident is not a new alert");

  repository.snapshot.inventoryItems[0].quantity = 6;
  await service.evaluateRestaurant(restaurantId, new Date(now.getTime() + 2000));
  repository.snapshot.inventoryItems[0].quantity = 4;
  failNext = true;
  const recurrence = await service.evaluateRestaurant(restaurantId, new Date(now.getTime() + 3000));
  assert.equal(recurrence.upsertedCount, 1);
  assert.equal(notified.length, 2, "a recurrence after resolution alerts again");
});

test("truncated source snapshots never auto-resolve incidents on incomplete evidence", async () => {
  const repository = new FakeIncidentRepository();
  repository.snapshot.inventoryItems = [
    { id: itemId, quantity: 3, lowStockThreshold: 5, unit: "kg" },
  ];
  const service = new IncidentDetectionService(repository, () => now);
  await service.evaluateRestaurant(restaurantId);
  repository.snapshot.inventoryItems[0].quantity = 8;
  repository.snapshot.truncatedSources = ["inventoryItems"];

  const result = await service.evaluateRestaurant(restaurantId, new Date(now.getTime() + 1000));
  assert.equal(result.resolvedCount, 0);
  assert.deepEqual(result.truncatedSources, ["inventoryItems"]);
  assert.equal(repository.incidents[0].status, "open");
});

test("evaluation leaves incidents outside the supported rule set untouched", async () => {
  const repository = new FakeIncidentRepository();
  repository.incidents.push({
    id: new ObjectId(),
    restaurantId,
    type: "staff_shortage",
    severity: "warning",
    status: "open",
    triggerSnapshot: {},
    affectedEntity: { type: "restaurant", id: restaurantId },
    createdAt: now,
    updatedAt: now,
  });
  const service = new IncidentDetectionService(repository, () => now);

  const result = await service.evaluateRestaurant(restaurantId);
  assert.equal(result.resolvedCount, 0);
  assert.equal(repository.incidents[0].status, "open");
});
