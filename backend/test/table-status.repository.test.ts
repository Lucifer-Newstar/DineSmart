import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import {
  COLLECTIONS,
  type OrderDocument,
  type ReservationDocument,
  type TableDocument,
  type WaitlistDocument,
} from "../src/database/schema.js";
import {
  MongoTableStatusRepository,
  TableStatusReferenceError,
  TableStatusTransitionError,
  TableStatusWriteConflictError,
} from "../src/tables/table-status.repository.js";

interface FakeDocument extends Record<string, unknown> {
  _id: ObjectId;
}

function equal(left: unknown, right: unknown): boolean {
  if (left instanceof ObjectId && right instanceof ObjectId) return left.equals(right);
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

function matches(document: FakeDocument, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (expected === null) return actual === null || actual === undefined;
    return equal(actual, expected);
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
  returnNullNextFindOneAndUpdate = false;
  beforeNullFindOneAndUpdate?: () => void;

  async findOne(filter: Record<string, unknown>): Promise<FakeDocument | null> {
    const document = this.documents.find((candidate) => matches(candidate, filter));
    return document ? { ...document } : null;
  }

  async findOneAndUpdate(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ): Promise<FakeDocument | null> {
    const document = this.documents.find((candidate) => matches(candidate, filter));
    if (!document || this.returnNullNextFindOneAndUpdate) {
      this.returnNullNextFindOneAndUpdate = false;
      this.beforeNullFindOneAndUpdate?.();
      return null;
    }
    applyUpdate(document, update);
    return { ...document };
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

function tableDocument(restaurantId: ObjectId, options: Partial<TableDocument> = {}): FakeDocument {
  const now = new Date("2026-10-11T12:00:00.000Z");
  return {
    _id: new ObjectId(),
    restaurantId,
    tableNumber: "05",
    capacity: 4,
    zone: "Dining room",
    status: "available",
    createdAt: now,
    updatedAt: now,
    ...options,
  };
}

function repositoryFor(db: FakeDb): MongoTableStatusRepository {
  return new MongoTableStatusRepository(db as unknown as Db);
}

test("status update is tenant-scoped and returns a safe, timestamped table summary", async () => {
  const db = new FakeDb();
  const restaurantId = new ObjectId();
  const table = tableDocument(restaurantId);
  db.collection(COLLECTIONS.tables).documents.push(table);
  const now = new Date("2026-10-11T12:10:00.000Z");

  const result = await repositoryFor(db).updateStatusForRestaurant(
    restaurantId,
    table._id,
    "occupied",
    now,
  );

  assert.equal(result?.changed, true);
  assert.equal(result?.table.status, "occupied");
  assert.equal(result?.table.tableNumber, "05");
  assert.equal(result?.table.updatedAt, now);
  assert.equal("restaurantId" in (result?.table ?? {}), false);
  assert.equal("currentWaitlistId" in (result?.table ?? {}), false);
  assert.equal(table.status, "occupied");
});

test("unknown transitions fail, while same-state updates are idempotent", async () => {
  const db = new FakeDb();
  const restaurantId = new ObjectId();
  const table = tableDocument(restaurantId, { status: "disabled" });
  db.collection(COLLECTIONS.tables).documents.push(table);
  const repository = repositoryFor(db);

  await assert.rejects(
    repository.updateStatusForRestaurant(restaurantId, table._id, "occupied", new Date()),
    TableStatusTransitionError,
  );
  const originalUpdatedAt = table.updatedAt;
  const idempotent = await repository.updateStatusForRestaurant(
    restaurantId,
    table._id,
    "disabled",
    new Date("2026-10-11T12:20:00.000Z"),
  );
  assert.equal(idempotent?.changed, false);
  assert.equal(table.updatedAt, originalUpdatedAt);
});

test("returning a table to available validates and clears terminal links but preserves waitlist history", async () => {
  const db = new FakeDb();
  const restaurantId = new ObjectId();
  const tableId = new ObjectId();
  const reservationId = new ObjectId();
  const orderId = new ObjectId();
  const waitlistId = new ObjectId();
  const table = tableDocument(restaurantId, {
    _id: tableId,
    status: "occupied",
    currentReservationId: reservationId,
    currentOrderId: orderId,
    currentWaitlistId: waitlistId,
  });
  db.collection(COLLECTIONS.tables).documents.push(table);
  db.collection(COLLECTIONS.reservations).documents.push({
    _id: reservationId,
    restaurantId,
    tableId,
    status: "Completed",
  } as FakeDocument & Partial<ReservationDocument>);
  db.collection(COLLECTIONS.orders).documents.push({
    _id: orderId,
    restaurantId,
    tableId,
    status: "Cancelled",
  } as FakeDocument & Partial<OrderDocument>);
  const seatedEntry: FakeDocument & Partial<WaitlistDocument> = {
    _id: waitlistId,
    restaurantId,
    tableId,
    status: "seated",
  };
  db.collection(COLLECTIONS.waitlist).documents.push(seatedEntry);

  const result = await repositoryFor(db).updateStatusForRestaurant(
    restaurantId,
    tableId,
    "available",
    new Date("2026-10-11T12:30:00.000Z"),
  );

  assert.equal(result?.changed, true);
  assert.equal(result?.table.status, "available");
  assert.equal(table.currentReservationId, undefined);
  assert.equal(table.currentOrderId, undefined);
  assert.equal(table.currentWaitlistId, undefined);
  assert.equal(seatedEntry.status, "seated");
});

test("active, missing, or mismatched assignment references prevent table release", async () => {
  const restaurantId = new ObjectId();
  const cases: Array<{
    name: string;
    field: "currentReservationId" | "currentOrderId" | "currentWaitlistId";
    linkedCollection: string;
    linked: FakeDocument | null;
  }> = [];

  const orderTableId = new ObjectId();
  const activeOrderId = new ObjectId();
  cases.push({
    name: "active order",
    field: "currentOrderId",
    linkedCollection: COLLECTIONS.orders,
    linked: {
      _id: activeOrderId,
      restaurantId,
      tableId: orderTableId,
      status: "Preparing",
    },
  });

  const reservationTableId = new ObjectId();
  const activeReservationId = new ObjectId();
  cases.push({
    name: "active reservation",
    field: "currentReservationId",
    linkedCollection: COLLECTIONS.reservations,
    linked: {
      _id: activeReservationId,
      restaurantId,
      tableId: reservationTableId,
      status: "Confirmed",
    },
  });

  const waitlistTableId = new ObjectId();
  const seatedWaitlistId = new ObjectId();
  cases.push({
    name: "waitlist table mismatch",
    field: "currentWaitlistId",
    linkedCollection: COLLECTIONS.waitlist,
    linked: {
      _id: seatedWaitlistId,
      restaurantId,
      tableId: waitlistTableId,
      status: "seated",
    },
  });
  cases.push({
    name: "missing link",
    field: "currentOrderId",
    linkedCollection: COLLECTIONS.orders,
    linked: null,
  });

  for (const item of cases) {
    const db = new FakeDb();
    const pointer =
      item.field === "currentOrderId"
        ? (item.linked?._id ?? new ObjectId())
        : item.field === "currentReservationId"
          ? (item.linked?._id ?? new ObjectId())
          : (item.linked?._id ?? new ObjectId());
    const table = tableDocument(restaurantId, {
      _id: new ObjectId(),
      status: "occupied",
      [item.field]: pointer,
    });
    db.collection(COLLECTIONS.tables).documents.push(table);
    if (item.linked) db.collection(item.linkedCollection).documents.push(item.linked);

    await assert.rejects(
      repositoryFor(db).updateStatusForRestaurant(restaurantId, table._id, "available", new Date()),
      TableStatusReferenceError,
      item.name,
    );
    assert.equal(table.status, "occupied", item.name);
    assert.equal(table[item.field] instanceof ObjectId, true, item.name);
  }
});

test("active linked orders and reservations block release, while a matching active reservation can be reserved", async () => {
  const restaurantId = new ObjectId();
  const orderDb = new FakeDb();
  const orderId = new ObjectId();
  const orderTable = tableDocument(restaurantId, {
    status: "occupied",
    currentOrderId: orderId,
  });
  orderDb.collection(COLLECTIONS.tables).documents.push(orderTable);
  orderDb.collection(COLLECTIONS.orders).documents.push({
    _id: orderId,
    restaurantId,
    tableId: orderTable._id,
    status: "Preparing",
  });
  await assert.rejects(
    repositoryFor(orderDb).updateStatusForRestaurant(
      restaurantId,
      orderTable._id,
      "available",
      new Date(),
    ),
    TableStatusReferenceError,
  );

  const reservationDb = new FakeDb();
  const reservationId = new ObjectId();
  const reservationTable = tableDocument(restaurantId, {
    status: "occupied",
    currentReservationId: reservationId,
  });
  reservationDb.collection(COLLECTIONS.tables).documents.push(reservationTable);
  reservationDb.collection(COLLECTIONS.reservations).documents.push({
    _id: reservationId,
    restaurantId,
    tableId: reservationTable._id,
    status: "Confirmed",
  });
  await assert.rejects(
    repositoryFor(reservationDb).updateStatusForRestaurant(
      restaurantId,
      reservationTable._id,
      "available",
      new Date(),
    ),
    TableStatusReferenceError,
  );

  const reservedDb = new FakeDb();
  const activeReservationId = new ObjectId();
  const availableTable = tableDocument(restaurantId, {
    currentReservationId: activeReservationId,
  });
  reservedDb.collection(COLLECTIONS.tables).documents.push(availableTable);
  reservedDb.collection(COLLECTIONS.reservations).documents.push({
    _id: activeReservationId,
    restaurantId,
    tableId: availableTable._id,
    status: "Confirmed",
  });
  const reserved = await repositoryFor(reservedDb).updateStatusForRestaurant(
    restaurantId,
    availableTable._id,
    "reserved",
    new Date(),
  );
  assert.equal(reserved?.table.status, "reserved");
});

test("manual reservation holds are allowed, but order/waitlist links cannot be reserved", async () => {
  const db = new FakeDb();
  const restaurantId = new ObjectId();
  const table = tableDocument(restaurantId);
  db.collection(COLLECTIONS.tables).documents.push(table);
  const manualHold = await repositoryFor(db).updateStatusForRestaurant(
    restaurantId,
    table._id,
    "reserved",
    new Date(),
  );
  assert.equal(manualHold?.table.status, "reserved");

  const otherTable = tableDocument(restaurantId);
  otherTable.currentOrderId = new ObjectId();
  db.collection(COLLECTIONS.tables).documents.push(otherTable);
  await assert.rejects(
    repositoryFor(db).updateStatusForRestaurant(
      restaurantId,
      otherTable._id,
      "reserved",
      new Date(),
    ),
    TableStatusReferenceError,
  );
});

test("stale table status compare-and-set returns conflict instead of overwriting another state", async () => {
  const db = new FakeDb();
  const restaurantId = new ObjectId();
  const table = tableDocument(restaurantId);
  db.collection(COLLECTIONS.tables).documents.push(table);
  const collection = db.collection(COLLECTIONS.tables);
  collection.returnNullNextFindOneAndUpdate = true;
  collection.beforeNullFindOneAndUpdate = () => {
    table.status = "disabled";
    table.updatedAt = new Date("2026-10-11T12:45:00.000Z");
  };

  await assert.rejects(
    repositoryFor(db).updateStatusForRestaurant(
      restaurantId,
      table._id,
      "occupied",
      new Date("2026-10-11T12:50:00.000Z"),
    ),
    TableStatusWriteConflictError,
  );
  assert.equal(table.status, "disabled");
});

test("cross-tenant table IDs are indistinguishable from missing tables", async () => {
  const db = new FakeDb();
  const table = tableDocument(new ObjectId());
  db.collection(COLLECTIONS.tables).documents.push(table);
  const result = await repositoryFor(db).updateStatusForRestaurant(
    new ObjectId(),
    table._id,
    "occupied",
    new Date(),
  );
  assert.equal(result, null);
});
