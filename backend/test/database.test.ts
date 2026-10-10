import assert from "node:assert/strict";
import { test } from "node:test";
import { createMongoClient } from "../src/database.js";

test("MongoDB client requires a configured connection URI", () => {
  assert.throws(() => createMongoClient(""), /MONGODB_URI/);
});

test("local MongoDB URI selects the Andhrímnir development database", async () => {
  const client = createMongoClient("mongodb://127.0.0.1:27017/andhrimnir");

  try {
    assert.equal(client.db().databaseName, "andhrimnir");
  } finally {
    await client.close();
  }
});
