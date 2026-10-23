import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import { COLLECTION_INDEXES, COLLECTIONS } from "../src/database/schema.js";
import {
  INCIDENT_SOURCE_RECORD_LIMIT,
  MongoIncidentDetectionRepository,
} from "../src/incidents/incident.repository.js";
import { type IncidentCandidate, incidentActiveKey } from "../src/incidents/incident.types.js";

const restaurantId = new ObjectId("64b000000000000000000001");
const orderId = new ObjectId("64b000000000000000000002");
const itemId = new ObjectId("64b000000000000000000003");
const now = new Date("2026-10-11T12:00:00.000Z");

interface CapturedQuery {
  collection: string;
  filter: Record<string, unknown>;
  options?: Record<string, unknown>;
  sort?: Record<string, number>;
  limit?: number;
}

function makeRepository(
  overrides: { records?: Record<string, unknown[]>; failFirstUpdate?: boolean } = {},
) {
  const queries: CapturedQuery[] = [];
  const updates: Array<{
    collection: string;
    filter: Record<string, unknown>;
    update: Record<string, unknown>;
    options?: Record<string, unknown>;
  }> = [];
  let failUpdate = overrides.failFirstUpdate ?? false;
  const db = {
    collection(name: string) {
      return {
        find(filter: Record<string, unknown>, options?: Record<string, unknown>) {
          const query: CapturedQuery = { collection: name, filter, options };
          queries.push(query);
          return {
            sort(value: Record<string, number>) {
              query.sort = value;
              return this;
            },
            limit(value: number) {
              query.limit = value;
              return this;
            },
            async toArray() {
              return overrides.records?.[name] ?? [];
            },
          };
        },
        async findOne(filter: Record<string, unknown>, options?: Record<string, unknown>) {
          queries.push({ collection: name, filter, options });
          return name === COLLECTIONS.restaurants ? { _id: restaurantId, thresholds: {} } : null;
        },
        async updateOne(
          filter: Record<string, unknown>,
          update: Record<string, unknown>,
          options?: Record<string, unknown>,
        ) {
          updates.push({ collection: name, filter, update, options });
          if (failUpdate) {
            failUpdate = false;
            throw { code: 11000 };
          }
          return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        },
      };
    },
  } as unknown as Db;
  return { repository: new MongoIncidentDetectionRepository(db), queries, updates };
}

function candidate(): IncidentCandidate {
  return {
    type: "inventory_shortage",
    severity: "warning",
    triggerSnapshot: { available: 3, lowStockThreshold: 5, unit: "kg" },
    affectedEntity: { type: "inventory_item", id: itemId },
    rootCause: "Available inventory is at or below the item's configured low-stock threshold.",
  };
}

test("incident snapshot reads every operational source through the signed tenant scope", async () => {
  const order = {
    _id: orderId,
    restaurantId,
    status: "Accepted",
    createdAt: now,
    updatedAt: now,
    statusTimestamps: { Accepted: now },
  };
  const item = {
    _id: new ObjectId(),
    restaurantId,
    orderId,
    preparationStatus: "Preparing",
    updatedAt: now,
  };
  const { repository, queries } = makeRepository({
    records: {
      [COLLECTIONS.orders]: [order],
      [COLLECTIONS.orderItems]: [item],
    },
  });

  const snapshot = await repository.getSnapshot(restaurantId, now);
  const expected = [
    COLLECTIONS.orders,
    COLLECTIONS.inventoryItems,
    COLLECTIONS.reservations,
    COLLECTIONS.tables,
    COLLECTIONS.orderItems,
  ];
  for (const collection of expected) {
    const query = queries.find(
      (entry) => entry.collection === collection && "restaurantId" in entry.filter,
    );
    assert.ok(query, `expected a tenant-scoped ${collection} query`);
    assert.equal(query.filter.restaurantId, restaurantId);
    assert.equal(query.limit, INCIDENT_SOURCE_RECORD_LIMIT + 1);
  }
  const orderItemQuery = queries.find((entry) => entry.collection === COLLECTIONS.orderItems);
  assert.deepEqual(orderItemQuery?.filter.orderId, { $in: [orderId] });
  assert.equal(orderItemQuery?.filter.preparationStatus, "Preparing");
  assert.equal(snapshot.restaurantId, restaurantId);
  assert.equal(snapshot.orders.length, 1);
  assert.equal(snapshot.orderItems.length, 1);
  assert.deepEqual(snapshot.truncatedSources, []);
});

test("incident snapshot caps each operational source and marks incomplete evidence", async () => {
  const inventoryItems = Array.from({ length: INCIDENT_SOURCE_RECORD_LIMIT + 1 }, () => ({
    _id: new ObjectId(),
    restaurantId,
    quantity: 3,
    lowStockThreshold: 5,
    unit: "kg",
  }));
  const { repository } = makeRepository({
    records: { [COLLECTIONS.inventoryItems]: inventoryItems },
  });

  const snapshot = await repository.getSnapshot(restaurantId, now);
  assert.equal(snapshot.inventoryItems.length, INCIDENT_SOURCE_RECORD_LIMIT);
  assert.deepEqual(snapshot.truncatedSources, ["inventoryItems"]);
});

test("active restaurant sweep is restricted to active restaurants", async () => {
  const secondId = new ObjectId("64b000000000000000000004");
  const { repository, queries } = makeRepository({
    records: { [COLLECTIONS.restaurants]: [{ _id: restaurantId }, { _id: secondId }] },
  });

  assert.deepEqual(await repository.listActiveRestaurantIds(), [restaurantId, secondId]);
  assert.deepEqual(queries[0], {
    collection: COLLECTIONS.restaurants,
    filter: { status: "active" },
    options: { projection: { _id: 1 } },
    sort: { _id: 1 },
  });
});

test("incident feed is tenant-scoped, newest-first, and capped at 200", async () => {
  const records = Array.from({ length: 201 }, () => ({
    _id: new ObjectId(),
    restaurantId,
    type: "inventory_shortage",
    severity: "warning",
    status: "open",
    triggerSnapshot: {},
    affectedEntity: { type: "inventory_item", id: new ObjectId() },
    createdAt: now,
    updatedAt: now,
  }));
  const { repository, queries } = makeRepository({ records: { [COLLECTIONS.incidents]: records } });

  const result = await repository.listForRestaurant(restaurantId);
  assert.equal(result.incidents.length, 200);
  assert.equal(result.truncated, true);
  assert.deepEqual(queries[0].filter, {
    restaurantId,
    status: { $in: ["open", "active", "resolved"] },
  });
  assert.deepEqual(queries[0].sort, { updatedAt: -1, _id: -1 });
  assert.equal(queries[0].limit, 201);
});

test("active incident upsert is tenant-keyed and recovers a duplicate-key race", async () => {
  const incident = candidate();
  const { repository, updates } = makeRepository({ failFirstUpdate: true });

  const opened = await repository.upsertActiveIncident(restaurantId, incident, now);

  assert.equal(opened, false, "a duplicate-key race means another writer opened it");
  assert.equal(updates.length, 2);
  assert.deepEqual(updates[0].filter, {
    restaurantId,
    type: incident.type,
    "affectedEntity.type": "inventory_item",
    "affectedEntity.id": itemId,
    status: { $in: ["open", "active"] },
  });
  assert.equal(updates[0].options?.upsert, true);
  const update = updates[0].update as {
    $set: Record<string, unknown>;
    $setOnInsert: Record<string, unknown>;
    $unset: Record<string, unknown>;
  };
  assert.equal(update.$set.status, "open");
  assert.equal(update.$set.activeKey, incidentActiveKey(restaurantId, incident));
  assert.equal(update.$set.severity, "warning");
  assert.equal(update.$setOnInsert.restaurantId, restaurantId);
  assert.equal(update.$unset.resolvedAt, "");
  assert.deepEqual(updates[1].filter, {
    restaurantId,
    activeKey: incidentActiveKey(restaurantId, incident),
  });
});

test("auto-resolution clears the unique active key and records its reason", async () => {
  const incidentId = new ObjectId();
  const { repository, updates } = makeRepository();

  await repository.resolveActiveIncident(restaurantId, incidentId, now);

  assert.deepEqual(updates[0].filter, {
    _id: incidentId,
    restaurantId,
    status: { $in: ["open", "active"] },
  });
  const update = updates[0].update as {
    $set: Record<string, unknown>;
    $unset: Record<string, unknown>;
  };
  assert.deepEqual(update.$set, {
    status: "resolved",
    resolvedAt: now,
    resolutionReason: "condition_cleared",
    updatedAt: now,
  });
  assert.deepEqual(update.$unset, { activeKey: "" });
});

test("incident schema has a tenant-scoped unique partial index for active rule identities", () => {
  const index = COLLECTION_INDEXES.incidents.find(
    (candidateIndex) => candidateIndex.name === "incidents_restaurant_active_key_unique",
  );
  assert.equal(index?.unique, true);
  assert.deepEqual(index?.key, { restaurantId: 1, activeKey: 1 });
  assert.deepEqual(index?.partialFilterExpression, { activeKey: { $type: "string" } });
});
