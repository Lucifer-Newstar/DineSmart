import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import {
  addStaffAccount,
  BootstrapError,
  bootstrapRestaurant,
  buildRestaurant,
  parseStaffRole,
} from "../src/database/bootstrap.js";

type Row = Record<string, unknown> & { _id: ObjectId };

/** Minimal in-memory stand-in for the three collections bootstrap touches. */
function fakeDb(options: { failStaffInsert?: boolean } = {}) {
  const collections = new Map<string, Row[]>();
  const rows = (name: string) => {
    if (!collections.has(name)) collections.set(name, []);
    return collections.get(name) as Row[];
  };
  const matches = (row: Row, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([key, value]) =>
      value instanceof ObjectId ? value.equals(row[key] as ObjectId) : row[key] === value,
    );
  const db = {
    collection(name: string) {
      return {
        async findOne(filter: Record<string, unknown>) {
          return rows(name).find((row) => matches(row, filter)) ?? null;
        },
        async insertOne(document: Row) {
          if (name === "staff" && options.failStaffInsert) throw new Error("write failed");
          rows(name).push(document);
          return { insertedId: document._id };
        },
        async deleteOne(filter: Record<string, unknown>) {
          const list = rows(name);
          const index = list.findIndex((row) => matches(row, filter));
          if (index >= 0) list.splice(index, 1);
          return { deletedCount: index >= 0 ? 1 : 0 };
        },
      };
    },
  } as unknown as Db;
  return { db, rows };
}

const ADMIN = {
  name: "Restaurant Admin",
  email: " Admin@Example.com ",
  role: "Administrator" as const,
  passwordHash: "$argon2id$hash",
};

test("bootstrap creates an active restaurant and a matching admin user and staff row", async () => {
  const { db, rows } = fakeDb();
  const { restaurant, admin } = await bootstrapRestaurant(db, { name: "Saffron" }, ADMIN);

  assert.equal(restaurant.status, "active");
  assert.equal(restaurant.currency, "INR");
  assert.equal(restaurant.timezone, "Asia/Kolkata");
  assert.equal(admin.normalizedEmail, "admin@example.com");
  assert.equal(admin.status, "active");
  assert.ok(admin.restaurantId?.equals(restaurant._id));
  assert.equal(rows("users").length, 1);
  const staff = rows("staff")[0];
  assert.ok((staff.userId as ObjectId).equals(admin._id));
  assert.equal(staff.role, "Administrator");
  assert.equal(staff.isActive, true);
});

test("bootstrap refuses a duplicate email and rolls back when the staff row fails", async () => {
  const { db, rows } = fakeDb();
  await bootstrapRestaurant(db, { name: "First" }, ADMIN);
  await assert.rejects(bootstrapRestaurant(db, { name: "Second" }, ADMIN), BootstrapError);
  assert.equal(rows("restaurants").length, 1);

  const failing = fakeDb({ failStaffInsert: true });
  await assert.rejects(bootstrapRestaurant(failing.db, { name: "Broken" }, ADMIN));
  assert.equal(failing.rows("restaurants").length, 0);
  assert.equal(failing.rows("users").length, 0);
});

test("staff accounts are added only to an existing restaurant", async () => {
  const { db } = fakeDb();
  const { restaurant } = await bootstrapRestaurant(db, { name: "Saffron" }, ADMIN);
  const chef = await addStaffAccount(db, restaurant._id, {
    name: "Chef",
    email: "chef@example.com",
    role: "Kitchen Staff",
    passwordHash: "$argon2id$hash",
  });
  assert.equal(chef.role, "Kitchen Staff");
  await assert.rejects(
    addStaffAccount(db, new ObjectId(), { ...ADMIN, email: "other@example.com" }),
    /No restaurant/,
  );
});

test("inputs are validated before anything is written", () => {
  assert.equal(parseStaffRole("kitchen staff"), "Kitchen Staff");
  assert.throws(() => parseStaffRole("Customer"), BootstrapError);
  assert.throws(() => buildRestaurant({ name: " " }, new Date()), /Restaurant name/);
  assert.throws(() => buildRestaurant({ name: "X", currency: "rupees" }, new Date()), /Currency/);
  assert.throws(
    () => buildRestaurant({ name: "X", timezone: "Mars/Base" }, new Date()),
    /time zone/,
  );
});
