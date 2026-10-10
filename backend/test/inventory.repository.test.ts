import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import { COLLECTIONS, type InventoryItemDocument } from "../src/database/schema.js";
import { MongoInventoryRepository } from "../src/inventory/inventory.repository.js";

test("inventory repository scopes reads and writes by restaurant and item IDs", async () => {
  const restaurantId = new ObjectId();
  const itemId = new ObjectId();
  const now = new Date("2026-10-10T12:00:00.000Z");
  const document = {
    _id: itemId,
    restaurantId,
    name: "Paneer",
    quantity: 2.4,
    unit: "kg",
    lowStockThreshold: 4,
    lastAdjustedAt: now,
    createdAt: now,
    updatedAt: now,
  } satisfies InventoryItemDocument & { _id: ObjectId };
  const queries: Array<{ operation: string; filter: Record<string, unknown> }> = [];
  let updateDocument: Record<string, unknown> | undefined;
  const db = {
    collection(name: string) {
      assert.equal(name, COLLECTIONS.inventoryItems);
      return {
        find(filter: Record<string, unknown>) {
          queries.push({ operation: "find", filter });
          return {
            sort() {
              return this;
            },
            limit() {
              return this;
            },
            async toArray() {
              return [document];
            },
          };
        },
        async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
          queries.push({ operation: "updateOne", filter });
          updateDocument = update;
          return { matchedCount: 1 };
        },
        async findOne(filter: Record<string, unknown>) {
          queries.push({ operation: "findOne", filter });
          return document;
        },
      };
    },
  } as unknown as Db;
  const repository = new MongoInventoryRepository(db);

  const list = await repository.listForRestaurant(restaurantId);
  const updated = await repository.adjustItem(restaurantId, itemId, {
    quantity: 8,
    lowStockThreshold: 5,
    adjustedAt: now,
  });

  assert.equal(list.items[0]?.id, itemId);
  assert.equal(list.truncated, false);
  assert.equal(updated?.id, itemId);
  assert.equal(queries[0]?.filter.restaurantId, restaurantId);
  assert.equal(queries[1]?.filter.restaurantId, restaurantId);
  assert.equal(queries[1]?.filter._id, itemId);
  assert.equal(queries[2]?.filter.restaurantId, restaurantId);
  assert.equal(queries[2]?.filter._id, itemId);
  assert.deepEqual(updateDocument?.$set as Record<string, unknown>, {
    quantity: 8,
    lowStockThreshold: 5,
    lastAdjustedAt: now,
    updatedAt: now,
  });
});
