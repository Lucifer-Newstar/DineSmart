import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDemoSeedData,
  DEMO_IDS,
  DEMO_SEED_COLLECTION_NAMES,
} from "../src/database/seed-data.js";
import {
  databaseNameFromUri,
  readCliOption,
  requireLocalSeedTarget,
  requireSeedTarget,
} from "../src/database/seed-safety.js";

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
  assert.equal(seed.waitlist.length, 0);
  assert.ok(DEMO_SEED_COLLECTION_NAMES.includes("waitlist"));
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

test("a remote seed needs --allow-remote, the matching database name and a demo password", () => {
  const atlasUri =
    "mongodb+srv://user:pass@cluster0.example.mongodb.net/andhrimnir?retryWrites=true";
  assert.equal(databaseNameFromUri(atlasUri), "andhrimnir");
  assert.throws(() => requireSeedTarget("development", atlasUri), /--allow-remote/);
  assert.throws(
    () => requireSeedTarget("development", atlasUri, { allowRemote: true }),
    /--confirm andhrimnir/,
  );
  assert.throws(
    () =>
      requireSeedTarget("development", atlasUri, {
        allowRemote: true,
        confirmDatabase: "other",
      }),
    /--confirm andhrimnir/,
  );
  assert.throws(
    () =>
      requireSeedTarget("development", atlasUri, {
        allowRemote: true,
        confirmDatabase: "andhrimnir",
      }),
    /SEED_DEMO_PASSWORD/,
  );
  assert.equal(
    requireSeedTarget("development", atlasUri, {
      allowRemote: true,
      confirmDatabase: "andhrimnir",
      demoPassword: "a-different-demo-password",
    }),
    atlasUri,
  );
  assert.throws(
    () =>
      requireSeedTarget("production", atlasUri, {
        allowRemote: true,
        confirmDatabase: "andhrimnir",
        demoPassword: "a-different-demo-password",
      }),
    /NODE_ENV=development/,
  );
  assert.throws(
    () =>
      requireSeedTarget("development", "mongodb+srv://user:pass@cluster0.example.mongodb.net/", {
        allowRemote: true,
        confirmDatabase: "",
        demoPassword: "a-different-demo-password",
      }),
    /must name its database/,
  );
});

test("seed CLI options accept flag, spaced and equals forms", () => {
  assert.equal(readCliOption(["--allow-remote"], "allow-remote"), true);
  assert.equal(readCliOption(["--confirm", "andhrimnir"], "confirm"), "andhrimnir");
  assert.equal(readCliOption(["--confirm=andhrimnir"], "confirm"), "andhrimnir");
  assert.equal(readCliOption(["--confirm", "--allow-remote"], "confirm"), true);
  assert.equal(readCliOption([], "confirm"), undefined);
});
