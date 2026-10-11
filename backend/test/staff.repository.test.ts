import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import {
  COLLECTIONS,
  type RestaurantUserDocument,
  type StaffDocument,
} from "../src/database/schema.js";
import {
  MongoStaffRepository,
  StaffProjectionSyncError,
  StaffSelfDeactivationError,
  StaffUpdateConflictError,
} from "../src/staff/staff.repository.js";
import { STAFF_LIST_LIMIT } from "../src/staff/staff.types.js";

const now = new Date("2026-10-11T12:00:00.000Z");

function fixture(
  options: {
    projectionMatched?: number;
    userUpdateConflict?: boolean;
    membershipCount?: number;
  } = {},
) {
  const restaurantId = new ObjectId();
  const userId = new ObjectId();
  const staffId = new ObjectId();
  const user: RestaurantUserDocument & { _id: ObjectId } = {
    _id: userId,
    name: "Ananya Menon",
    email: "ananya@example.test",
    normalizedEmail: "ananya@example.test",
    role: "Reception",
    restaurantId,
    status: "active",
    passwordHash: "not-to-be-returned",
    createdAt: now,
    updatedAt: now,
  };
  const membership: StaffDocument & { _id: ObjectId } = {
    _id: staffId,
    restaurantId,
    userId,
    role: "Reception",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const memberships =
    options.membershipCount === undefined
      ? [membership]
      : Array.from({ length: options.membershipCount }, (_, index) =>
          index === 0
            ? membership
            : {
                ...membership,
                _id: new ObjectId(),
                userId: new ObjectId(),
              },
        );
  const limits: number[] = [];
  const queries: Array<{
    collection: string;
    operation: string;
    filter?: Record<string, unknown>;
  }> = [];
  const updates: Array<{
    collection: string;
    filter: Record<string, unknown>;
    update: Record<string, unknown>;
  }> = [];
  const projections: Record<string, unknown>[] = [];

  const db = {
    collection(name: string) {
      if (name === COLLECTIONS.staff) {
        return {
          find(filter: Record<string, unknown>) {
            queries.push({ collection: name, operation: "find", filter });
            return {
              sort() {
                return this;
              },
              limit(value: number) {
                limits.push(value);
                return this;
              },
              async toArray() {
                return memberships;
              },
            };
          },
          async findOne(filter: Record<string, unknown>) {
            queries.push({ collection: name, operation: "findOne", filter });
            return filter._id === staffId && filter.restaurantId === restaurantId
              ? membership
              : null;
          },
          async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
            queries.push({ collection: name, operation: "updateOne", filter });
            updates.push({ collection: name, filter, update });
            if (options.projectionMatched === 0) return { matchedCount: 0 };
            Object.assign(membership, update.$set);
            return { matchedCount: 1 };
          },
        };
      }
      if (name === COLLECTIONS.users) {
        return {
          find(
            filter: Record<string, unknown>,
            options?: { projection?: Record<string, unknown> },
          ) {
            queries.push({ collection: name, operation: "find", filter });
            if (options?.projection) projections.push(options.projection);
            return {
              async toArray() {
                const requestedIds = (filter._id as { $in?: ObjectId[] } | undefined)?.$in ?? [];
                return requestedIds.some((id) => id.equals(userId)) &&
                  filter.restaurantId === restaurantId
                  ? [user]
                  : [];
              },
            };
          },
          async findOne(
            filter: Record<string, unknown>,
            options?: { projection?: Record<string, unknown> },
          ) {
            queries.push({ collection: name, operation: "findOne", filter });
            if (options?.projection) projections.push(options.projection);
            return filter._id === userId && filter.restaurantId === restaurantId ? user : null;
          },
          async findOneAndUpdate(
            filter: Record<string, unknown>,
            update: Record<string, unknown>,
            findOptions?: { projection?: Record<string, unknown> },
          ) {
            queries.push({ collection: name, operation: "findOneAndUpdate", filter });
            updates.push({ collection: name, filter, update });
            if (options.userUpdateConflict) return null;
            if (
              filter._id !== userId ||
              filter.restaurantId !== restaurantId ||
              filter.role !== user.role ||
              filter.status !== user.status ||
              filter.updatedAt !== user.updatedAt
            ) {
              return null;
            }
            Object.assign(user, update.$set);
            if (findOptions?.projection) projections.push(findOptions.projection);
            return user;
          },
        };
      }
      throw new Error(`Unexpected collection ${name}`);
    },
  } as unknown as Db;

  return {
    repository: new MongoStaffRepository(db),
    restaurantId,
    userId,
    staffId,
    user,
    membership,
    queries,
    updates,
    projections,
    limits,
  };
}

test("staff list uses signed tenant filters, safe user projection, bounded join, and auth role/status", async () => {
  const harness = fixture();
  harness.membership.isActive = false;
  const result = await harness.repository.listForRestaurant(harness.restaurantId);

  assert.equal(result.staff.length, 1);
  assert.equal(result.staff[0]?.role, "Reception");
  assert.equal(result.staff[0]?.isActive, true);
  assert.equal("passwordHash" in (result.staff[0] ?? {}), false);
  assert.equal(result.truncated, false);
  assert.deepEqual(harness.queries[0]?.filter, { restaurantId: harness.restaurantId });
  assert.deepEqual(harness.queries[1]?.filter?.restaurantId, harness.restaurantId);
  assert.deepEqual(harness.projections[0], {
    _id: 1,
    name: 1,
    email: 1,
    role: 1,
    status: 1,
    createdAt: 1,
    updatedAt: 1,
  });
  assert.equal("passwordHash" in (harness.projections[0] ?? {}), false);
});

test("staff roster fetches only the configured cap plus one and reports truncation", async () => {
  const harness = fixture({ membershipCount: STAFF_LIST_LIMIT + 1 });
  const result = await harness.repository.listForRestaurant(harness.restaurantId);

  assert.deepEqual(harness.limits, [STAFF_LIST_LIMIT + 1]);
  const userLookup = harness.queries.find(
    (query) => query.collection === COLLECTIONS.users && query.operation === "find",
  );
  const ids = (userLookup?.filter?._id as { $in?: ObjectId[] } | undefined)?.$in;
  assert.equal(ids?.length, STAFF_LIST_LIMIT);
  assert.equal(result.truncated, true);
});

test("staff update changes auth authority, membership projection, and refresh watermark", async () => {
  const harness = fixture();
  const result = await harness.repository.updateForRestaurant(
    harness.restaurantId,
    harness.staffId,
    new ObjectId(),
    { role: "Kitchen Staff", isActive: false },
    now,
  );

  assert.equal(result?.role, "Kitchen Staff");
  assert.equal(result?.isActive, false);
  assert.equal(harness.user.role, "Kitchen Staff");
  assert.equal(harness.user.status, "disabled");
  assert.equal(harness.user.refreshSessionsInvalidBefore, now);
  assert.equal(harness.membership.role, "Kitchen Staff");
  assert.equal(harness.membership.isActive, false);
  assert.deepEqual(harness.updates[0]?.filter, {
    _id: harness.userId,
    restaurantId: harness.restaurantId,
    role: "Reception",
    status: "active",
    updatedAt: now,
  });
  assert.equal(harness.updates[1]?.filter.restaurantId, harness.restaurantId);
  assert.equal(harness.updates[1]?.filter._id, harness.staffId);
});

test("staff update does not invalidate sessions for a no-op projection repair", async () => {
  const harness = fixture();
  harness.membership.role = "Kitchen Staff";
  harness.membership.isActive = false;
  const result = await harness.repository.updateForRestaurant(
    harness.restaurantId,
    harness.staffId,
    new ObjectId(),
    { role: "Reception", isActive: true },
    now,
  );

  assert.equal(result?.role, "Reception");
  assert.equal(result?.isActive, true);
  assert.equal(harness.user.refreshSessionsInvalidBefore, undefined);
});

test("staff list omits memberships without a same-tenant active or disabled auth user", async () => {
  const harness = fixture();
  const result = await harness.repository.listForRestaurant(new ObjectId());

  assert.deepEqual(result, { staff: [], truncated: false });
});

test("staff updates cannot deactivate the acting account", async () => {
  const harness = fixture();

  await assert.rejects(
    harness.repository.updateForRestaurant(
      harness.restaurantId,
      harness.staffId,
      harness.userId,
      { isActive: false },
      now,
    ),
    StaffSelfDeactivationError,
  );
  assert.equal(harness.updates.length, 0);
});

test("staff update detects an optimistic user-document conflict", async () => {
  const harness = fixture({ userUpdateConflict: true });

  await assert.rejects(
    harness.repository.updateForRestaurant(
      harness.restaurantId,
      harness.staffId,
      new ObjectId(),
      { role: "Manager" },
      now,
    ),
    StaffUpdateConflictError,
  );
});

test("staff update reports an incomplete membership synchronization", async () => {
  const harness = fixture({ projectionMatched: 0 });

  await assert.rejects(
    harness.repository.updateForRestaurant(
      harness.restaurantId,
      harness.staffId,
      new ObjectId(),
      { isActive: false },
      now,
    ),
    StaffProjectionSyncError,
  );
});
