import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "mongodb";
import {
  COLLECTION_INDEXES,
  COLLECTIONS,
  type CollectionName,
  initializeDatabaseSchema,
  normalizeEmail,
} from "../src/database/schema.js";

const GLOBAL_COLLECTIONS = new Set<CollectionName>([
  "users",
  "refreshSessions",
  "restaurants",
  "customers",
]);

function indexFor(collection: CollectionName, name: string) {
  return COLLECTION_INDEXES[collection].find((index) => index.name === name);
}

test("schema defines a non-empty index plan for every collection", () => {
  assert.deepEqual(Object.keys(COLLECTION_INDEXES).sort(), Object.keys(COLLECTIONS).sort());

  for (const indexes of Object.values(COLLECTION_INDEXES)) {
    assert.ok(indexes.length > 0);
    assert.ok(indexes.every((index) => typeof index.name === "string" && index.name.length > 0));
    assert.equal(new Set(indexes.map((index) => index.name)).size, indexes.length);
  }
});

test("operational collections lead at least one compound index with restaurantId", () => {
  for (const collection of Object.keys(COLLECTIONS) as CollectionName[]) {
    if (GLOBAL_COLLECTIONS.has(collection)) continue;

    const hasTenantLeadingIndex = COLLECTION_INDEXES[collection].some(
      (index) => Object.keys(index.key)[0] === "restaurantId",
    );
    assert.equal(
      hasTenantLeadingIndex,
      true,
      `${COLLECTIONS[collection]} needs a restaurantId-leading index`,
    );
  }
});

test("identity and one-to-one domain constraints have unique indexes", () => {
  assert.equal(indexFor("users", "users_normalized_email_unique")?.unique, true);
  const linkedCustomerIndex = indexFor("customers", "customers_user_unique");
  assert.equal(linkedCustomerIndex?.unique, true);
  assert.deepEqual(linkedCustomerIndex?.partialFilterExpression, { userId: { $type: "objectId" } });
  assert.equal(indexFor("staff", "staff_restaurant_user_unique")?.unique, true);
  assert.equal(indexFor("tables", "tables_restaurant_number_unique")?.unique, true);
  assert.equal(indexFor("refreshSessions", "refresh_sessions_token_hash_unique")?.unique, true);
  assert.equal(indexFor("refreshSessions", "refresh_sessions_expiry_ttl")?.expireAfterSeconds, 0);
  assert.equal(indexFor("bills", "bills_restaurant_order_unique")?.unique, true);
});

test("email lookup normalization trims whitespace and ignores case", () => {
  assert.equal(
    normalizeEmail("  Guest+news.Example@Example.COM  "),
    "guest+news.example@example.com",
  );
});

test("schema initialization creates the named indexes without a live database", async () => {
  const created: Array<{ collection: string; indexCount: number }> = [];
  const fakeDb = {
    collection(name: string) {
      return {
        async createIndexes(indexes: Array<{ name?: string }>) {
          created.push({ collection: name, indexCount: indexes.length });
          return indexes.map((index) => index.name ?? "");
        },
      };
    },
  } as unknown as Db;

  await initializeDatabaseSchema(fakeDb);

  assert.deepEqual(
    created.map((entry) => entry.collection),
    Object.values(COLLECTIONS),
  );
  assert.deepEqual(
    created.map((entry) => entry.indexCount),
    Object.values(COLLECTION_INDEXES).map((indexes) => indexes.length),
  );
});
