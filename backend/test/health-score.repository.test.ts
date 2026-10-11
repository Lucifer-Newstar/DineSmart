import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db, ObjectId } from "mongodb";
import { COLLECTIONS } from "../src/database/schema.js";
import { MongoHealthScoreRepository } from "../src/healthscore/health-score.repository.js";

interface CapturedQuery {
  collection: string;
  filter: Record<string, unknown>;
}

test("health-score repository scopes every operational query to the signed restaurant ID", async () => {
  const restaurantId = { toHexString: () => "64b000000000000000000001" } as ObjectId;
  const queries: CapturedQuery[] = [];
  const names = [
    COLLECTIONS.orders,
    COLLECTIONS.inventoryItems,
    COLLECTIONS.reservations,
    COLLECTIONS.tables,
    COLLECTIONS.incidents,
  ];
  const db = {
    collection(name: string) {
      return {
        find(filter: Record<string, unknown>) {
          queries.push({ collection: name, filter });
          return {
            sort() {
              return this;
            },
            limit() {
              return this;
            },
            async toArray() {
              return [];
            },
          };
        },
        async findOne(filter: Record<string, unknown>) {
          queries.push({ collection: name, filter });
          return { _id: restaurantId, thresholds: {} };
        },
      };
    },
  } as unknown as Db;
  const repository = new MongoHealthScoreRepository(db);

  await repository.getSnapshot(
    restaurantId,
    new Date("2026-10-09T12:00:00.000Z"),
    new Date("2026-10-10T12:00:00.000Z"),
  );

  assert.equal(queries.length, 6);
  for (const name of names) {
    const query = queries.find((entry) => entry.collection === name);
    assert.ok(query, `expected a query for ${name}`);
    assert.equal(query.filter.restaurantId, restaurantId);
  }
  const restaurantQuery = queries.find((entry) => entry.collection === COLLECTIONS.restaurants);
  assert.ok(restaurantQuery);
  assert.equal(restaurantQuery.filter._id, restaurantId);
});

test("health-score repository lists only active tenant IDs for scheduled refresh", async () => {
  const firstId = { toHexString: () => "64b000000000000000000001" } as ObjectId;
  const secondId = { toHexString: () => "64b000000000000000000002" } as ObjectId;
  let query: CapturedQuery | undefined;
  let sort: Record<string, 1 | -1> | undefined;
  const db = {
    collection(name: string) {
      return {
        find(filter: Record<string, unknown>) {
          query = { collection: name, filter };
          return {
            sort(specification: Record<string, 1 | -1>) {
              sort = specification;
              return this;
            },
            async toArray() {
              return [{ _id: firstId }, { _id: secondId }];
            },
          };
        },
      };
    },
  } as unknown as Db;
  const repository = new MongoHealthScoreRepository(db);

  assert.deepEqual(await repository.listActiveRestaurantIds(), [firstId, secondId]);
  assert.deepEqual(query, { collection: COLLECTIONS.restaurants, filter: { status: "active" } });
  assert.deepEqual(sort, { _id: 1 });
});
