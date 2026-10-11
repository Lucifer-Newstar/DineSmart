import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import {
  StaffProjectionSyncError,
  StaffSelfDeactivationError,
  StaffUpdateConflictError,
} from "../src/staff/staff.repository.js";
import { StaffService, StaffServiceError } from "../src/staff/staff.service.js";
import type { StaffRecord, StaffRepository, StaffUpdate } from "../src/staff/staff.types.js";

const now = new Date("2026-10-11T12:00:00.000Z");

function makeStaffRecord(): StaffRecord {
  return {
    id: new ObjectId(),
    userId: new ObjectId(),
    name: "Ananya Menon",
    email: "ananya@example.test",
    role: "Reception",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

class FakeStaffRepository implements StaffRepository {
  record: StaffRecord | null = makeStaffRecord();
  changes?: StaffUpdate;
  updatedAt?: Date;
  actorUserId?: ObjectId;
  failure?: Error;

  async listForRestaurant() {
    return { staff: this.record ? [this.record] : [], truncated: false };
  }

  async updateForRestaurant(
    _restaurantId: ObjectId,
    _staffId: ObjectId,
    actorUserId: ObjectId,
    changes: StaffUpdate,
    updatedAt: Date,
  ): Promise<StaffRecord | null> {
    this.actorUserId = actorUserId;
    this.changes = changes;
    this.updatedAt = updatedAt;
    if (this.failure) throw this.failure;
    return this.record;
  }
}

test("staff service lists tenant-scoped records through the repository", async () => {
  const repository = new FakeStaffRepository();
  const service = new StaffService(repository);
  const restaurantId = new ObjectId();
  const result = await service.list(restaurantId);

  assert.equal(result.staff[0]?.id, repository.record?.id);
  assert.equal(result.truncated, false);
});

test("staff service updates with the injected clock and actor identity", async () => {
  const repository = new FakeStaffRepository();
  const actorUserId = new ObjectId();
  const service = new StaffService(repository, () => now);
  const result = await service.update(
    new ObjectId(),
    repository.record?.id ?? new ObjectId(),
    actorUserId,
    { role: "Kitchen Staff", isActive: false },
  );

  assert.equal(repository.actorUserId, actorUserId);
  assert.deepEqual(repository.changes, { role: "Kitchen Staff", isActive: false });
  assert.equal(repository.updatedAt, now);
  assert.equal(result.id, repository.record?.id);
});

test("staff service rejects invalid and empty updates before persistence", async () => {
  const repository = new FakeStaffRepository();
  const service = new StaffService(repository, () => now);
  const inputs = [
    {},
    { role: "Customer" },
    { isActive: "false" },
    { role: "Reception", unknown: true },
  ];

  for (const input of inputs) {
    await assert.rejects(
      service.update(new ObjectId(), new ObjectId(), new ObjectId(), input as StaffUpdate),
      (error: unknown) => error instanceof StaffServiceError && error.statusCode === 400,
    );
  }
  assert.equal(repository.changes, undefined);
});

test("staff service returns 404 when the scoped membership is absent", async () => {
  const repository = new FakeStaffRepository();
  repository.record = null;
  const service = new StaffService(repository, () => now);

  await assert.rejects(
    service.update(new ObjectId(), new ObjectId(), new ObjectId(), { isActive: true }),
    (error: unknown) => error instanceof StaffServiceError && error.statusCode === 404,
  );
});

test("staff service maps self-deactivation and optimistic conflicts to safe errors", async () => {
  const repository = new FakeStaffRepository();
  const service = new StaffService(repository, () => now);

  repository.failure = new StaffSelfDeactivationError();
  await assert.rejects(
    service.update(new ObjectId(), new ObjectId(), new ObjectId(), { isActive: false }),
    (error: unknown) =>
      error instanceof StaffServiceError && error.code === "staff_self_deactivation_forbidden",
  );

  repository.failure = new StaffUpdateConflictError();
  await assert.rejects(
    service.update(new ObjectId(), new ObjectId(), new ObjectId(), { role: "Manager" }),
    (error: unknown) =>
      error instanceof StaffServiceError && error.code === "staff_update_conflict",
  );
});

test("staff service reports partial user/membership synchronization without hiding it", async () => {
  const repository = new FakeStaffRepository();
  repository.failure = new StaffProjectionSyncError();
  const service = new StaffService(repository, () => now);

  await assert.rejects(
    service.update(new ObjectId(), new ObjectId(), new ObjectId(), { isActive: false }),
    (error: unknown) => error instanceof StaffServiceError && error.statusCode === 503,
  );
});
