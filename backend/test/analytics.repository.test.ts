import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db, ObjectId } from "mongodb";
import { MongoAnalyticsRepository } from "../src/analytics/analytics.repository.js";
import { ANALYTICS_RECORD_LIMIT } from "../src/analytics/analytics.types.js";
import { COLLECTIONS } from "../src/database/schema.js";

interface CapturedQuery {
  collection: string;
  filter: Record<string, unknown>;
  options: Record<string, unknown>;
  limit?: number;
}

test("analytics repository scopes each dataset to the signed tenant and caps sampled records", async () => {
  const restaurantId = { toHexString: () => "64b000000000000000000001" } as ObjectId;
  const from = new Date("2026-10-05T18:30:00.000Z");
  const until = new Date("2026-10-11T20:00:00.000Z");
  const queries: CapturedQuery[] = [];
  const orderRecords = Array.from({ length: ANALYTICS_RECORD_LIMIT + 1 }, (_, index) => ({
    status: index === 0 ? "Completed" : "Accepted",
    createdAt: new Date(from.getTime() + index),
    statusTimestamps: {},
  }));
  const db = {
    collection(name: string) {
      return {
        find(filter: Record<string, unknown>, options: Record<string, unknown>) {
          const query: CapturedQuery = { collection: name, filter, options };
          queries.push(query);
          let limit = Number.POSITIVE_INFINITY;
          const records =
            name === COLLECTIONS.orders
              ? orderRecords
              : name === COLLECTIONS.reservations
                ? [{ status: "Confirmed", startAt: from }]
                : [{ quantity: 2, lowStockThreshold: 4 }];
          return {
            limit(value: number) {
              limit = value;
              query.limit = value;
              return this;
            },
            async toArray() {
              return records.slice(0, limit);
            },
          };
        },
        async findOne(filter: Record<string, unknown>, options: Record<string, unknown>) {
          queries.push({ collection: name, filter, options });
          return { timezone: "Asia/Kolkata" };
        },
      };
    },
  } as unknown as Db;
  const repository = new MongoAnalyticsRepository(db);

  assert.equal(await repository.getRestaurantTimeZone(restaurantId), "Asia/Kolkata");
  const snapshot = await repository.getSnapshot(restaurantId, from, until);

  assert.equal(snapshot.orders.length, ANALYTICS_RECORD_LIMIT);
  assert.equal(snapshot.reservations.length, 1);
  assert.equal(snapshot.inventoryItems.length, 1);
  assert.deepEqual(snapshot.truncatedCollections, ["orders"]);
  for (const collection of [
    COLLECTIONS.orders,
    COLLECTIONS.reservations,
    COLLECTIONS.inventoryItems,
  ]) {
    const query = queries.find((entry) => entry.collection === collection);
    assert.ok(query, `expected a query for ${collection}`);
    assert.equal(query.filter.restaurantId, restaurantId);
    assert.equal(query.limit, ANALYTICS_RECORD_LIMIT + 1);
  }

  const orderQuery = queries.find((entry) => entry.collection === COLLECTIONS.orders);
  assert.deepEqual(orderQuery?.filter.createdAt, { $gte: from, $lte: until });
  assert.deepEqual(orderQuery?.options.projection, {
    status: 1,
    createdAt: 1,
    statusTimestamps: 1,
  });
  const reservationQuery = queries.find((entry) => entry.collection === COLLECTIONS.reservations);
  assert.deepEqual(reservationQuery?.filter.startAt, { $gte: from, $lte: until });
  const inventoryQuery = queries.find((entry) => entry.collection === COLLECTIONS.inventoryItems);
  assert.deepEqual(inventoryQuery?.filter, { restaurantId });
  assert.deepEqual(inventoryQuery?.options.projection, { quantity: 1, lowStockThreshold: 1 });
});

test("analytics repository reads only the restaurant timezone setting by tenant ID", async () => {
  const restaurantId = { toHexString: () => "64b000000000000000000001" } as ObjectId;
  let captured: CapturedQuery | undefined;
  const db = {
    collection(name: string) {
      return {
        async findOne(filter: Record<string, unknown>, options: Record<string, unknown>) {
          captured = { collection: name, filter, options };
          return { timezone: "Asia/Singapore" };
        },
      };
    },
  } as unknown as Db;
  const repository = new MongoAnalyticsRepository(db);

  assert.equal(await repository.getRestaurantTimeZone(restaurantId), "Asia/Singapore");
  assert.deepEqual(captured, {
    collection: COLLECTIONS.restaurants,
    filter: { _id: restaurantId },
    options: { projection: { timezone: 1 } },
  });
});
