import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, type Document, ObjectId } from "mongodb";
import { MongoIncidentContextRepository } from "../src/ai/incident-context.repository.js";
import { COLLECTIONS } from "../src/database/schema.js";
import {
  MongoTableStatusRepository,
  TableStatusWriteConflictError,
} from "../src/tables/table-status.repository.js";

interface CapturedQuery {
  collection: string;
  filter: Document;
  options: Document | undefined;
}

/**
 * Records one row per collection so a flow that reads several collections can
 * be replayed with realistic, per-collection documents.
 */
function recordingDb(
  rowByCollection: Record<string, Document>,
  recording: { updateResult?: Document | null } = {},
): {
  db: Db;
  queries: CapturedQuery[];
  updates: CapturedQuery[];
} {
  const queries: CapturedQuery[] = [];
  const updates: CapturedQuery[] = [];

  const collection = (name: string) => ({
    find(filter: Document, options?: Document) {
      queries.push({ collection: name, filter, options });
      return {
        sort() {
          return this;
        },
        limit() {
          return this;
        },
        async toArray() {
          return rowByCollection[name] ? [rowByCollection[name]] : [];
        },
      };
    },
    async findOne(filter: Document, options?: Document) {
      queries.push({ collection: name, filter, options });
      return rowByCollection[name] ?? null;
    },
    async findOneAndUpdate(filter: Document, _update: Document, options?: Document) {
      updates.push({ collection: name, filter, options });
      return "updateResult" in recording
        ? ((recording.updateResult ?? null) as Document | null)
        : ((rowByCollection[name] ?? null) as Document | null);
    },
  });

  return { db: { collection } as unknown as Db, queries, updates };
}

const EXPECTED_TABLE_PROJECTION = [
  "capacity",
  "createdAt",
  "currentOrderId",
  "currentReservationId",
  "currentWaitlistId",
  "status",
  "tableNumber",
  "updatedAt",
  "zone",
];

function projectionOf(query: CapturedQuery | undefined): Document {
  const projection = query?.options?.projection;
  assert.ok(
    projection && typeof projection === "object",
    `${query?.collection ?? "query"} read must request an explicit projection`,
  );
  return projection as Document;
}

function queryFor(queries: CapturedQuery[], collection: string): CapturedQuery | undefined {
  return queries.find((query) => query.collection === collection);
}

test("incident context reads project only the fields the advisory prompt consumes", async () => {
  const restaurantId = new ObjectId();
  const { db, queries } = recordingDb({});
  const repository = new MongoIncidentContextRepository(db);

  await repository.findIncident(restaurantId, new ObjectId());
  await repository.findRestaurant(restaurantId);
  await repository.findActiveOrders(restaurantId);
  await repository.findLowStockItems(restaurantId);
  await repository.findUpcomingReservations(restaurantId, new Date());

  assert.deepEqual(Object.keys(projectionOf(queryFor(queries, COLLECTIONS.incidents))).sort(), [
    "createdAt",
    "severity",
    "status",
    "triggerSnapshot",
    "type",
  ]);
  assert.deepEqual(Object.keys(projectionOf(queryFor(queries, COLLECTIONS.restaurants))).sort(), [
    "currency",
    "thresholds",
    "timezone",
  ]);
  assert.deepEqual(Object.keys(projectionOf(queryFor(queries, COLLECTIONS.orders))).sort(), [
    "createdAt",
    "status",
    "statusTimestamps",
  ]);
  assert.deepEqual(
    Object.keys(projectionOf(queryFor(queries, COLLECTIONS.inventoryItems))).sort(),
    ["lowStockThreshold", "name", "quantity", "unit"],
  );
  assert.deepEqual(Object.keys(projectionOf(queryFor(queries, COLLECTIONS.reservations))).sort(), [
    "partySize",
    "startAt",
  ]);
});

test("table status reads project the serialized table fields and guard inputs only", async () => {
  const restaurantId = new ObjectId();
  const tableId = new ObjectId();
  const reservationId = new ObjectId();
  const orderId = new ObjectId();
  const waitlistId = new ObjectId();
  const updatedAt = new Date("2026-10-12T09:00:00.000Z");

  const { db, queries, updates } = recordingDb({
    [COLLECTIONS.tables]: {
      _id: tableId,
      restaurantId,
      tableNumber: "T4",
      capacity: 4,
      zone: "Main hall",
      status: "occupied",
      createdAt: updatedAt,
      updatedAt,
      currentReservationId: reservationId,
      currentOrderId: orderId,
      currentWaitlistId: waitlistId,
    },
    [COLLECTIONS.reservations]: {
      _id: reservationId,
      tableId,
      status: "completed",
    },
    [COLLECTIONS.orders]: {
      _id: orderId,
      tableId,
      status: "completed",
    },
    [COLLECTIONS.waitlist]: {
      _id: waitlistId,
      status: "seated",
    },
  });
  const repository = new MongoTableStatusRepository(db);

  const result = await repository.updateStatusForRestaurant(
    restaurantId,
    tableId,
    "available",
    new Date("2026-10-12T09:05:00.000Z"),
  );

  assert.equal(result?.changed, true);
  assert.equal(result?.table.status, "occupied");

  assert.deepEqual(
    Object.keys(projectionOf(queryFor(queries, COLLECTIONS.tables))).sort(),
    EXPECTED_TABLE_PROJECTION,
  );
  assert.deepEqual(Object.keys(projectionOf(queryFor(queries, COLLECTIONS.reservations))).sort(), [
    "status",
    "tableId",
  ]);
  assert.deepEqual(Object.keys(projectionOf(queryFor(queries, COLLECTIONS.orders))).sort(), [
    "status",
    "tableId",
  ]);
  assert.deepEqual(Object.keys(projectionOf(queryFor(queries, COLLECTIONS.waitlist))).sort(), [
    "_id",
  ]);
  assert.deepEqual(Object.keys(projectionOf(updates[0])).sort(), EXPECTED_TABLE_PROJECTION);
});

test("a lost table status race re-reads with the same projection", async () => {
  const restaurantId = new ObjectId();
  const tableId = new ObjectId();
  const updatedAt = new Date("2026-10-12T09:00:00.000Z");

  const { db, queries, updates } = recordingDb(
    {
      [COLLECTIONS.tables]: {
        _id: tableId,
        restaurantId,
        tableNumber: "T7",
        capacity: 2,
        // Reserved -> available is a legal release, so the conditional update is
        // attempted; returning null simulates another writer winning the race.
        status: "reserved",
        createdAt: updatedAt,
        updatedAt,
      },
    },
    { updateResult: null },
  );
  const repository = new MongoTableStatusRepository(db);

  await assert.rejects(
    () =>
      repository.updateStatusForRestaurant(
        restaurantId,
        tableId,
        "available",
        new Date("2026-10-12T09:06:00.000Z"),
      ),
    TableStatusWriteConflictError,
  );

  assert.equal(updates.length, 1);
  assert.deepEqual(Object.keys(projectionOf(updates[0])).sort(), EXPECTED_TABLE_PROJECTION);
  const tableReads = queries.filter((query) => query.collection === COLLECTIONS.tables);
  assert.equal(tableReads.length, 2);
  assert.deepEqual(Object.keys(projectionOf(tableReads[0])).sort(), EXPECTED_TABLE_PROJECTION);
  assert.deepEqual(Object.keys(projectionOf(tableReads[1])).sort(), EXPECTED_TABLE_PROJECTION);
});
