import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import { MongoCustomerProfileRepository } from "../src/customers/customer-profile.repository.js";
import {
  COLLECTIONS,
  type CustomerDocument,
  type CustomerUserDocument,
} from "../src/database/schema.js";

const now = new Date("2026-10-11T06:00:00.000Z");

function customerUser(userId: ObjectId, status: CustomerUserDocument["status"] = "active") {
  return {
    _id: userId,
    name: "Ananya Menon",
    email: "ananya@example.test",
    normalizedEmail: "ananya@example.test",
    role: "Customer",
    restaurantId: null,
    status,
    createdAt: now,
    updatedAt: now,
  } satisfies CustomerUserDocument & { _id: ObjectId };
}

test("customer profile repository upserts one global profile for an active Customer", async () => {
  const userId = new ObjectId();
  const customerId = new ObjectId();
  const user = customerUser(userId);
  const profile = {
    _id: customerId,
    userId,
    displayName: user.name,
    email: user.email,
    contactPreferences: { email: true },
    createdAt: now,
    updatedAt: now,
  } satisfies CustomerDocument & { _id: ObjectId };
  const calls: Array<{ collection: string; operation: string; filter: unknown }> = [];
  const db = {
    collection(name: string) {
      return {
        async findOne(filter: unknown) {
          calls.push({ collection: name, operation: "findOne", filter });
          return name === COLLECTIONS.users ? user : profile;
        },
        async findOneAndUpdate(filter: unknown, update: unknown, options: unknown) {
          calls.push({ collection: name, operation: "findOneAndUpdate", filter });
          assert.deepEqual(update, {
            $setOnInsert: {
              userId,
              displayName: "Ananya Menon",
              email: "ananya@example.test",
              contactPreferences: { email: true },
              createdAt: now,
              updatedAt: now,
            },
          });
          assert.deepEqual(options, {
            upsert: true,
            returnDocument: "after",
            includeResultMetadata: false,
          });
          return profile;
        },
      };
    },
  } as unknown as Db;

  const result = await new MongoCustomerProfileRepository(db).getCustomerIdForUser(userId, now);
  assert.equal(result, customerId);
  assert.deepEqual(calls, [
    {
      collection: COLLECTIONS.users,
      operation: "findOne",
      filter: { _id: userId, role: "Customer", status: "active" },
    },
    { collection: COLLECTIONS.customers, operation: "findOneAndUpdate", filter: { userId } },
  ]);
});

test("inactive Customer accounts cannot resolve or create a Customer profile", async () => {
  const userId = new ObjectId();
  const calls: string[] = [];
  const db = {
    collection(name: string) {
      return {
        async findOne() {
          calls.push(`${name}.findOne`);
          return name === COLLECTIONS.users ? customerUser(userId, "disabled") : null;
        },
        async findOneAndUpdate() {
          calls.push(`${name}.findOneAndUpdate`);
          return null;
        },
      };
    },
  } as unknown as Db;

  const result = await new MongoCustomerProfileRepository(db).getCustomerIdForUser(userId, now);
  assert.equal(result, null);
  assert.deepEqual(calls, [`${COLLECTIONS.users}.findOne`]);
});

test("duplicate-key race falls back to the winning global Customer profile", async () => {
  const userId = new ObjectId();
  const customerId = new ObjectId();
  const user = customerUser(userId);
  const profile = { _id: customerId };
  const calls: string[] = [];
  const duplicateKey = Object.assign(new Error("duplicate profile"), { code: 11000 });
  const db = {
    collection(name: string) {
      return {
        async findOne(filter: unknown) {
          calls.push(`${name}.findOne`);
          if (name === COLLECTIONS.users) return user;
          assert.deepEqual(filter, { userId });
          return profile;
        },
        async findOneAndUpdate() {
          calls.push(`${name}.findOneAndUpdate`);
          throw duplicateKey;
        },
      };
    },
  } as unknown as Db;

  const result = await new MongoCustomerProfileRepository(db).getCustomerIdForUser(userId, now);
  assert.equal(result, customerId);
  assert.deepEqual(calls, [
    `${COLLECTIONS.users}.findOne`,
    `${COLLECTIONS.customers}.findOneAndUpdate`,
    `${COLLECTIONS.customers}.findOne`,
  ]);
});
