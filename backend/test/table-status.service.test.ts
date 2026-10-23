import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import {
  TableStatusReferenceError,
  TableStatusTransitionError,
  TableStatusWriteConflictError,
} from "../src/tables/table-status.repository.js";
import { TableStatusService, TableStatusServiceError } from "../src/tables/table-status.service.js";
import type {
  TableOperationalStatus,
  TableStatusRecord,
  TableStatusRepository,
} from "../src/tables/table-status.types.js";

const restaurantId = new ObjectId();
const tableId = new ObjectId();
const now = new Date("2026-10-11T13:00:00.000Z");

function tableRecord(status: TableOperationalStatus = "occupied"): TableStatusRecord {
  return {
    id: tableId,
    tableNumber: "05",
    capacity: 4,
    zone: "Dining room",
    status,
    createdAt: now,
    updatedAt: now,
  };
}

class FakeTableStatusRepository implements TableStatusRepository {
  listCalls: Array<{ restaurantId: ObjectId; limit: number }> = [];

  async listForRestaurant(restaurantId: ObjectId, limit: number) {
    this.listCalls.push({ restaurantId, limit });
    return { tables: [tableRecord()], truncated: false };
  }

  calls: Array<{
    restaurantId: ObjectId;
    tableId: ObjectId;
    status: TableOperationalStatus;
    now: Date;
  }> = [];
  result: { table: TableStatusRecord; changed: boolean } | null = {
    table: tableRecord(),
    changed: true,
  };
  error?: Error;

  async updateStatusForRestaurant(
    id: ObjectId,
    targetId: ObjectId,
    status: TableOperationalStatus,
    timestamp: Date,
  ) {
    this.calls.push({ restaurantId: id, tableId: targetId, status, now: timestamp });
    if (this.error) throw this.error;
    return this.result;
  }
}

test("successful table status changes request health/incident refresh and publish a minimal event", async () => {
  const repository = new FakeTableStatusRepository();
  const refreshes: ObjectId[] = [];
  const incidentChecks: ObjectId[] = [];
  const events: unknown[] = [];
  const service = new TableStatusService(
    repository,
    () => now,
    (id) => refreshes.push(id),
    (id) => incidentChecks.push(id),
    (event) => events.push(event),
  );

  const updated = await service.updateStatus(restaurantId, tableId, "occupied");

  assert.equal(updated.status, "occupied");
  assert.deepEqual(repository.calls, [{ restaurantId, tableId, status: "occupied", now }]);
  assert.deepEqual(refreshes, [restaurantId]);
  assert.deepEqual(incidentChecks, [restaurantId]);
  assert.deepEqual(events, [
    {
      restaurantId,
      event: "table.updated",
      data: { tableId: tableId.toHexString(), status: "occupied" },
    },
  ]);
});

test("idempotent table status updates do not request unnecessary refreshes", async () => {
  const repository = new FakeTableStatusRepository();
  repository.result = { table: tableRecord("occupied"), changed: false };
  const refreshes: ObjectId[] = [];
  const events: unknown[] = [];
  const service = new TableStatusService(
    repository,
    () => now,
    (id) => refreshes.push(id),
    undefined,
    (event) => events.push(event),
  );

  const unchanged = await service.updateStatus(restaurantId, tableId, "occupied");

  assert.equal(unchanged.status, "occupied");
  assert.deepEqual(refreshes, []);
  assert.deepEqual(events, []);
});

test("invalid status, missing tables, invalid transitions, assignments, and write conflicts map safely", async () => {
  const repository = new FakeTableStatusRepository();
  const service = new TableStatusService(repository, () => now);

  await assert.rejects(
    service.updateStatus(restaurantId, tableId, "open" as TableOperationalStatus),
    (error: unknown) => error instanceof TableStatusServiceError && error.statusCode === 400,
  );
  assert.equal(repository.calls.length, 0);

  repository.result = null;
  await assert.rejects(
    service.updateStatus(restaurantId, tableId, "available"),
    (error: unknown) => error instanceof TableStatusServiceError && error.statusCode === 404,
  );

  repository.error = new TableStatusTransitionError();
  await assert.rejects(
    service.updateStatus(restaurantId, tableId, "occupied"),
    (error: unknown) =>
      error instanceof TableStatusServiceError && error.code === "invalid_table_status_transition",
  );

  repository.error = new TableStatusReferenceError();
  await assert.rejects(
    service.updateStatus(restaurantId, tableId, "available"),
    (error: unknown) =>
      error instanceof TableStatusServiceError && error.code === "table_assignment_active",
  );

  repository.error = new TableStatusWriteConflictError();
  await assert.rejects(
    service.updateStatus(restaurantId, tableId, "available"),
    (error: unknown) => error instanceof TableStatusServiceError && error.statusCode === 409,
  );
});
