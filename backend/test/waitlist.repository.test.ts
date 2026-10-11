import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import { COLLECTIONS, type TableDocument, type WaitlistDocument } from "../src/database/schema.js";
import {
  MongoWaitlistRepository,
  WaitlistEntryConflictError,
  WaitlistSynchronizationError,
  WaitlistTableNotFoundError,
  WaitlistTableUnavailableError,
} from "../src/waitlist/waitlist.repository.js";

interface FakeDocument extends Record<string, unknown> {
  _id: ObjectId;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left instanceof ObjectId && right instanceof ObjectId) return left.equals(right);
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

function matches(document: FakeDocument, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (expected === null) return actual === null || actual === undefined;
    if (
      expected &&
      typeof expected === "object" &&
      !(expected instanceof ObjectId) &&
      !(expected instanceof Date)
    ) {
      const operators = expected as Record<string, unknown>;
      return Object.entries(operators).every(([operator, value]) => {
        if (operator === "$gte") return typeof actual === "number" && actual >= Number(value);
        return false;
      });
    }
    return sameValue(actual, expected);
  });
}

function applyUpdate(document: FakeDocument, update: Record<string, unknown>): void {
  const set = update.$set as Record<string, unknown> | undefined;
  const unset = update.$unset as Record<string, unknown> | undefined;
  if (set) Object.assign(document, set);
  if (unset) for (const key of Object.keys(unset)) delete document[key];
}

class FakeCollection {
  documents: FakeDocument[] = [];
  throwNextFindOneAndUpdate = false;
  returnNullNextFindOneAndUpdate = false;
  beforeNullFindOneAndUpdate?: (filter: Record<string, unknown>) => void;
  nextUpdateMatchedCount: number | undefined;

  find(filter: Record<string, unknown>) {
    const result = this.documents.filter((document) => matches(document, filter));
    let limit = Number.POSITIVE_INFINITY;
    const cursor = {
      sort: (spec: Record<string, 1 | -1>) => {
        const keys = Object.entries(spec);
        result.sort((left, right) => {
          for (const [key, direction] of keys) {
            const a = left[key];
            const b = right[key];
            let order = 0;
            if (a instanceof Date && b instanceof Date) order = a.getTime() - b.getTime();
            else if (a instanceof ObjectId && b instanceof ObjectId) {
              order = a.toHexString().localeCompare(b.toHexString());
            } else if (typeof a === "string" && typeof b === "string") {
              order = a.localeCompare(b);
            }
            if (order !== 0) return order * direction;
          }
          return 0;
        });
        return cursor;
      },
      limit: (count: number) => {
        limit = count;
        return cursor;
      },
      toArray: async () => result.slice(0, limit).map((document) => ({ ...document })),
    };
    return cursor;
  }

  async findOne(filter: Record<string, unknown>): Promise<FakeDocument | null> {
    const document = this.documents.find((candidate) => matches(candidate, filter));
    return document ? { ...document } : null;
  }

  async insertOne(document: FakeDocument): Promise<void> {
    this.documents.push({ ...document });
  }

  async findOneAndUpdate(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<FakeDocument | null> {
    if (this.throwNextFindOneAndUpdate) {
      this.throwNextFindOneAndUpdate = false;
      throw new Error("simulated write failure");
    }
    const document = this.documents.find((candidate) => matches(candidate, filter));
    if (!document || this.returnNullNextFindOneAndUpdate) {
      this.returnNullNextFindOneAndUpdate = false;
      this.beforeNullFindOneAndUpdate?.(filter);
      return null;
    }
    applyUpdate(document, update);
    return { ...document };
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    const forcedMatchedCount = this.nextUpdateMatchedCount;
    this.nextUpdateMatchedCount = undefined;
    if (forcedMatchedCount === 0) return { matchedCount: 0, modifiedCount: 0 };
    const document = this.documents.find((candidate) => matches(candidate, filter));
    if (!document) return { matchedCount: 0, modifiedCount: 0 };
    applyUpdate(document, update);
    return { matchedCount: 1, modifiedCount: 1 };
  }
}

class FakeDb {
  readonly collections = new Map<string, FakeCollection>();

  collection(name: string): FakeCollection {
    let collection = this.collections.get(name);
    if (!collection) {
      collection = new FakeCollection();
      this.collections.set(name, collection);
    }
    return collection;
  }
}

function waitlistDocument(
  restaurantId: ObjectId,
  options: Partial<WaitlistDocument> = {},
): FakeDocument {
  const now = new Date("2026-10-11T10:00:00.000Z");
  return {
    _id: new ObjectId(),
    restaurantId,
    guestName: "Asha Raman",
    partySize: 3,
    status: "waiting",
    createdAt: now,
    updatedAt: now,
    ...options,
  };
}

function tableDocument(restaurantId: ObjectId, options: Partial<TableDocument> = {}): FakeDocument {
  const now = new Date("2026-10-11T10:00:00.000Z");
  return {
    _id: new ObjectId(),
    restaurantId,
    tableNumber: "03",
    capacity: 4,
    status: "available",
    currentReservationId: null,
    currentOrderId: null,
    currentWaitlistId: null,
    createdAt: now,
    updatedAt: now,
    ...options,
  };
}

function repositoryFor(db: FakeDb): MongoWaitlistRepository {
  return new MongoWaitlistRepository(db as unknown as Db);
}

test("waitlist listing is tenant-scoped, FIFO, bounded, and only includes waiting parties", async () => {
  const db = new FakeDb();
  const restaurantId = new ObjectId();
  const otherRestaurantId = new ObjectId();
  const collection = db.collection(COLLECTIONS.waitlist);
  const start = Date.parse("2026-10-11T10:00:00.000Z");
  const entries: FakeDocument[] = [];
  for (let index = 0; index < 203; index += 1) {
    entries.push(
      waitlistDocument(restaurantId, {
        _id: new ObjectId((index + 1).toString(16).padStart(24, "0")),
        guestName: `Guest ${index}`,
        createdAt: new Date(start + index * 1_000),
      }),
    );
  }
  entries.push(waitlistDocument(otherRestaurantId));
  entries.push(waitlistDocument(restaurantId, { status: "cancelled" }));
  collection.documents.push(...entries);

  const result = await repositoryFor(db).listWaitingForRestaurant(restaurantId);

  assert.equal(result.entries.length, 200);
  assert.equal(result.truncated, true);
  assert.equal(result.entries[0]?.guestName, "Guest 0");
  assert.equal(result.entries[199]?.guestName, "Guest 199");
  assert.ok(result.entries.every((entry) => entry.status === "waiting"));
  assert.ok(result.entries.every((entry) => entry.restaurantId.equals(restaurantId)));
});

test("waitlist create stores only the supplied tenant-scoped walk-in fields", async () => {
  const db = new FakeDb();
  const restaurantId = new ObjectId();
  const now = new Date("2026-10-11T10:30:00.000Z");
  const created = await repositoryFor(db).addForRestaurant(
    restaurantId,
    { guestName: "Asha Raman", partySize: 3, phone: "+91 90000 11111", notes: "High chair" },
    now,
  );

  assert.equal(created.restaurantId.toHexString(), restaurantId.toHexString());
  assert.equal(created.guestName, "Asha Raman");
  assert.equal(created.partySize, 3);
  assert.equal(created.phone, "+91 90000 11111");
  assert.equal(created.status, "waiting");
  assert.equal(created.createdAt, now);
  const stored = db.collection(COLLECTIONS.waitlist).documents[0];
  assert.ok(stored?._id instanceof ObjectId);
  assert.equal(stored?.updatedAt, now);
  assert.equal(stored?.tableId, undefined);
});

test("waitlist cancellation resolves a waiting party with an atomic tenant/status guard", async () => {
  const db = new FakeDb();
  const restaurantId = new ObjectId();
  const entry = waitlistDocument(restaurantId);
  db.collection(COLLECTIONS.waitlist).documents.push(entry);
  const now = new Date("2026-10-11T10:45:00.000Z");

  const updated = await repositoryFor(db).resolveWaitingForRestaurant(
    restaurantId,
    entry._id,
    { status: "cancelled" },
    now,
  );

  assert.equal(updated?.status, "cancelled");
  assert.equal(updated?.updatedAt, now);
  assert.equal(updated?.tableId, undefined);
});

test("seating conditionally occupies a same-tenant capacity-safe table and records both sides", async () => {
  const db = new FakeDb();
  const restaurantId = new ObjectId();
  const entry = waitlistDocument(restaurantId);
  const table = tableDocument(restaurantId);
  db.collection(COLLECTIONS.waitlist).documents.push(entry);
  db.collection(COLLECTIONS.tables).documents.push(table);
  const now = new Date("2026-10-11T11:00:00.000Z");

  const seated = await repositoryFor(db).resolveWaitingForRestaurant(
    restaurantId,
    entry._id,
    { status: "seated", tableId: table._id },
    now,
  );

  assert.equal(seated?.status, "seated");
  assert.equal(seated?.tableId?.toHexString(), table._id.toHexString());
  assert.equal(seated?.seatedAt, now);
  const storedTable = db.collection(COLLECTIONS.tables).documents[0];
  assert.equal(storedTable?.status, "occupied");
  assert.ok(storedTable?.currentWaitlistId instanceof ObjectId);
  assert.equal(storedTable.currentWaitlistId.toHexString(), entry._id.toHexString());
  assert.equal(storedTable?.updatedAt, now);
});

test("seating rejects missing, cross-tenant, occupied, or undersized tables without mutating the queue", async () => {
  const db = new FakeDb();
  const restaurantId = new ObjectId();
  const otherRestaurantId = new ObjectId();
  const missingEntry = waitlistDocument(restaurantId);
  const otherTenantTable = tableDocument(otherRestaurantId);
  const occupiedTable = tableDocument(restaurantId, { status: "occupied" });
  const smallTable = tableDocument(restaurantId, { capacity: 2 });
  db.collection(COLLECTIONS.waitlist).documents.push(missingEntry);
  db.collection(COLLECTIONS.tables).documents.push(otherTenantTable, occupiedTable, smallTable);
  const repository = repositoryFor(db);

  await assert.rejects(
    repository.resolveWaitingForRestaurant(
      restaurantId,
      missingEntry._id,
      { status: "seated", tableId: new ObjectId() },
      new Date(),
    ),
    WaitlistTableNotFoundError,
  );
  for (const table of [occupiedTable, smallTable]) {
    await assert.rejects(
      repository.resolveWaitingForRestaurant(
        restaurantId,
        missingEntry._id,
        { status: "seated", tableId: table._id },
        new Date(),
      ),
      WaitlistTableUnavailableError,
    );
  }
  assert.equal(db.collection(COLLECTIONS.waitlist).documents[0]?.status, "waiting");
});

test("stale seating rolls the table back and reports a conflict", async () => {
  const db = new FakeDb();
  const restaurantId = new ObjectId();
  const entry = waitlistDocument(restaurantId);
  const table = tableDocument(restaurantId);
  const waitlist = db.collection(COLLECTIONS.waitlist);
  waitlist.documents.push(entry);
  db.collection(COLLECTIONS.tables).documents.push(table);
  waitlist.returnNullNextFindOneAndUpdate = true;
  waitlist.beforeNullFindOneAndUpdate = () => {
    const stored = waitlist.documents[0];
    if (stored) stored.status = "cancelled";
  };

  await assert.rejects(
    repositoryFor(db).resolveWaitingForRestaurant(
      restaurantId,
      entry._id,
      { status: "seated", tableId: table._id },
      new Date(),
    ),
    WaitlistEntryConflictError,
  );
  const storedTable = db.collection(COLLECTIONS.tables).documents[0];
  assert.equal(storedTable?.status, "available");
  assert.equal(storedTable?.currentWaitlistId, undefined);
});

test("uncertain waitlist write is read back before cleanup; failed compensation surfaces 503 condition", async () => {
  const db = new FakeDb();
  const restaurantId = new ObjectId();
  const entry = waitlistDocument(restaurantId);
  const table = tableDocument(restaurantId);
  db.collection(COLLECTIONS.waitlist).documents.push(entry);
  const tables = db.collection(COLLECTIONS.tables);
  tables.documents.push(table);
  db.collection(COLLECTIONS.waitlist).throwNextFindOneAndUpdate = true;

  await assert.rejects(
    repositoryFor(db).resolveWaitingForRestaurant(
      restaurantId,
      entry._id,
      { status: "seated", tableId: table._id },
      new Date(),
    ),
    WaitlistSynchronizationError,
  );
  assert.equal(tables.documents[0]?.status, "available");
  assert.equal(tables.documents[0]?.currentWaitlistId, undefined);

  const secondEntry = waitlistDocument(restaurantId);
  const secondTable = tableDocument(restaurantId);
  db.collection(COLLECTIONS.waitlist).documents.push(secondEntry);
  tables.documents.push(secondTable);
  db.collection(COLLECTIONS.waitlist).throwNextFindOneAndUpdate = true;
  tables.nextUpdateMatchedCount = 0;
  await assert.rejects(
    repositoryFor(db).resolveWaitingForRestaurant(
      restaurantId,
      secondEntry._id,
      { status: "seated", tableId: secondTable._id },
      new Date(),
    ),
    WaitlistSynchronizationError,
  );
  assert.equal(
    secondTable.status,
    "occupied",
    "do not clear a table when compensation cannot be verified",
  );
});
