import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDemoSeedData,
  DEMO_IDS,
  DEMO_SEED_COLLECTION_NAMES,
} from "../src/database/seed-data.js";
import { requireLocalSeedTarget } from "../src/database/seed-safety.js";

const FIXED_NOW = new Date("2026-10-10T12:00:00.000Z");

test("demo fixtures are deterministic, restaurant-scoped, and internally connected", () => {
  const seed = buildDemoSeedData("$argon2id$fixture-hash", FIXED_NOW);
  const secondBuild = buildDemoSeedData("$argon2id$fixture-hash", FIXED_NOW);
  assert.equal(seed.restaurants.length, 1);
  assert.equal(seed.users.length, 5);
  assert.equal(seed.menuItems.length, 4);
  assert.equal(seed.orders.length, 3);
  assert.equal(seed.incidents.length, 3);
  assert.equal(seed.recommendations.length, 2);
  assert.ok(DEMO_SEED_COLLECTION_NAMES.includes("menu_items"));
  assert.ok(DEMO_SEED_COLLECTION_NAMES.includes("inventory_items"));
  assert.ok(DEMO_SEED_COLLECTION_NAMES.includes("order_items"));
  assert.ok(!DEMO_SEED_COLLECTION_NAMES.includes("menuItems"));
  assert.deepEqual(
    seed.users.map((user) => user._id.toHexString()),
    secondBuild.users.map((user) => user._id.toHexString()),
  );

  const restaurantId = seed.restaurants[0]._id;
  for (const collection of [
    seed.staff,
    seed.menuItems,
    seed.tables,
    seed.inventoryItems,
    seed.reservations,
    seed.orders,
    seed.orderItems,
    seed.incidents,
    seed.recommendations,
    seed.notifications,
    seed.bills,
  ]) {
    assert.ok(collection.every((document) => document.restaurantId.equals(restaurantId)));
  }

  const customerUser = seed.users.find((user) => user._id.toHexString() === DEMO_IDS.customerUser);
  assert.equal(customerUser?.role, "Customer");
  assert.equal(customerUser?.restaurantId, null);
  assert.ok(
    seed.users.every(
      (user) => user.status === "active" && user.passwordHash === "$argon2id$fixture-hash",
    ),
  );
  assert.ok(seed.recommendations.every((recommendation) => recommendation.provider === "demo"));
});

test("seed guard allows only development URIs pointed at local MongoDB hosts", () => {
  const localUri = "mongodb://127.0.0.1:27017/andhrimnir";
  assert.equal(requireLocalSeedTarget("development", localUri), localUri);
  assert.equal(
    requireLocalSeedTarget("development", "mongodb://localhost:27017/andhrimnir"),
    "mongodb://localhost:27017/andhrimnir",
  );
  assert.equal(
    requireLocalSeedTarget("development", "mongodb://mongodb:27017/andhrimnir"),
    "mongodb://mongodb:27017/andhrimnir",
  );
  assert.throws(() => requireLocalSeedTarget("production", localUri), /NODE_ENV=development/);
  assert.throws(
    () =>
      requireLocalSeedTarget("development", "mongodb+srv://user:pass@cluster.example/andhrimnir"),
    /local MongoDB host/,
  );
  assert.throws(() => requireLocalSeedTarget("development", undefined), /MONGODB_URI/);
});
