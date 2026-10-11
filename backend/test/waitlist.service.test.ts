import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import {
  WaitlistEntryConflictError,
  WaitlistSynchronizationError,
  WaitlistTableUnavailableError,
} from "../src/waitlist/waitlist.repository.js";
import { WaitlistService, WaitlistServiceError } from "../src/waitlist/waitlist.service.js";
import type {
  WaitlistCreateInput,
  WaitlistRecord,
  WaitlistRepository,
  WaitlistResolution,
} from "../src/waitlist/waitlist.types.js";

const restaurantId = new ObjectId();
const entryId = new ObjectId();
const tableId = new ObjectId();
const now = new Date("2026-10-11T11:15:00.000Z");

function record(status: WaitlistRecord["status"] = "waiting"): WaitlistRecord {
  return {
    id: entryId,
    restaurantId,
    guestName: "Asha Raman",
    partySize: 3,
    status,
    ...(status === "seated" ? { tableId, seatedAt: now } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

class FakeWaitlistRepository implements WaitlistRepository {
  added?: { restaurantId: ObjectId; input: WaitlistCreateInput; now: Date };
  resolution?: {
    restaurantId: ObjectId;
    entryId: ObjectId;
    resolution: WaitlistResolution;
    now: Date;
  };
  result: WaitlistRecord | null = record();
  error?: Error;

  async listWaitingForRestaurant(_id: ObjectId) {
    return { entries: [record()], truncated: false };
  }

  async addForRestaurant(id: ObjectId, input: WaitlistCreateInput, timestamp: Date) {
    this.added = { restaurantId: id, input, now: timestamp };
    if (this.error) throw this.error;
    return record();
  }

  async resolveWaitingForRestaurant(
    id: ObjectId,
    targetId: ObjectId,
    resolution: WaitlistResolution,
    timestamp: Date,
  ) {
    this.resolution = { restaurantId: id, entryId: targetId, resolution, now: timestamp };
    if (this.error) throw this.error;
    return this.result;
  }
}

test("waitlist create normalizes bounded walk-in fields and emits a minimal invalidation event", async () => {
  const repository = new FakeWaitlistRepository();
  const events: unknown[] = [];
  const service = new WaitlistService(
    repository,
    () => now,
    undefined,
    undefined,
    (event) => events.push(event),
  );

  const created = await service.add(restaurantId, {
    guestName: "  Asha Raman  ",
    partySize: 3,
    phone: "  +91 90000 11111  ",
    notes: " High chair ",
  });

  assert.equal(created.status, "waiting");
  assert.deepEqual(repository.added, {
    restaurantId,
    input: {
      guestName: "Asha Raman",
      partySize: 3,
      phone: "+91 90000 11111",
      notes: "High chair",
    },
    now,
  });
  assert.deepEqual(events, [
    {
      restaurantId,
      event: "waitlist.updated",
      data: { waitlistId: entryId.toHexString(), status: "waiting" },
    },
  ]);
});

test("waitlist create rejects invalid names, sizes, contact fields, and unknown properties", async () => {
  const service = new WaitlistService(new FakeWaitlistRepository(), () => now);
  const invalid: unknown[] = [
    { guestName: " ", partySize: 2 },
    { guestName: "x".repeat(101), partySize: 2 },
    { guestName: "Asha", partySize: 0 },
    { guestName: "Asha", partySize: 13 },
    { guestName: "Asha", partySize: 1.5 },
    { guestName: "Asha", partySize: 2, phone: " " },
    { guestName: "Asha", partySize: 2, phone: "1".repeat(21) },
    { guestName: "Asha", partySize: 2, notes: "x".repeat(501) },
    { guestName: "Asha", partySize: 2, restaurantId: new ObjectId() },
  ];
  for (const input of invalid) {
    await assert.rejects(
      service.add(restaurantId, input as WaitlistCreateInput),
      (error: unknown) => error instanceof WaitlistServiceError && error.statusCode === 400,
    );
  }
});

test("seating requires a valid table and triggers scoped operational refresh hooks", async () => {
  const repository = new FakeWaitlistRepository();
  repository.result = record("seated");
  const refreshes: ObjectId[] = [];
  const incidentChecks: ObjectId[] = [];
  const events: unknown[] = [];
  const service = new WaitlistService(
    repository,
    () => now,
    (id) => refreshes.push(id),
    (id) => incidentChecks.push(id),
    (event) => events.push(event),
  );

  const seated = await service.resolve(restaurantId, entryId, { status: "seated", tableId });

  assert.equal(seated.status, "seated");
  assert.deepEqual(repository.resolution, {
    restaurantId,
    entryId,
    resolution: { status: "seated", tableId },
    now,
  });
  assert.deepEqual(refreshes, [restaurantId]);
  assert.deepEqual(incidentChecks, [restaurantId]);
  assert.deepEqual(events, [
    {
      restaurantId,
      event: "table.updated",
      data: { tableId: tableId.toHexString(), status: "occupied" },
    },
    {
      restaurantId,
      event: "waitlist.updated",
      data: { waitlistId: entryId.toHexString(), status: "seated" },
    },
  ]);
});

test("cancellation and no-show do not mutate table state or trigger table refresh", async () => {
  const repository = new FakeWaitlistRepository();
  repository.result = { ...record("cancelled"), tableId: undefined };
  const refreshes: ObjectId[] = [];
  const events: unknown[] = [];
  const service = new WaitlistService(
    repository,
    () => now,
    (id) => refreshes.push(id),
    undefined,
    (event) => events.push(event),
  );

  const cancelled = await service.resolve(restaurantId, entryId, { status: "cancelled" });

  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual(refreshes, []);
  assert.deepEqual(events, [
    {
      restaurantId,
      event: "waitlist.updated",
      data: { waitlistId: entryId.toHexString(), status: "cancelled" },
    },
  ]);
});

test("waitlist resolution validates terminal state and maps repository errors safely", async () => {
  const repository = new FakeWaitlistRepository();
  const service = new WaitlistService(repository, () => now);

  await assert.rejects(
    service.resolve(restaurantId, entryId, { status: "seated" } as WaitlistResolution),
    (error: unknown) => error instanceof WaitlistServiceError && error.statusCode === 400,
  );
  await assert.rejects(
    service.resolve(restaurantId, entryId, { status: "no_show", tableId } as WaitlistResolution),
    (error: unknown) => error instanceof WaitlistServiceError && error.statusCode === 400,
  );

  repository.error = new WaitlistEntryConflictError();
  await assert.rejects(
    service.resolve(restaurantId, entryId, { status: "cancelled" }),
    (error: unknown) =>
      error instanceof WaitlistServiceError &&
      error.statusCode === 409 &&
      error.code === "waitlist_entry_conflict",
  );
  repository.error = new WaitlistTableUnavailableError();
  await assert.rejects(
    service.resolve(restaurantId, entryId, { status: "seated", tableId }),
    (error: unknown) => error instanceof WaitlistServiceError && error.code === "table_unavailable",
  );
  repository.error = new WaitlistSynchronizationError();
  await assert.rejects(
    service.resolve(restaurantId, entryId, { status: "seated", tableId }),
    (error: unknown) => error instanceof WaitlistServiceError && error.statusCode === 503,
  );
  repository.error = undefined;
  repository.result = null;
  await assert.rejects(
    service.resolve(restaurantId, entryId, { status: "cancelled" }),
    (error: unknown) => error instanceof WaitlistServiceError && error.statusCode === 404,
  );
});
