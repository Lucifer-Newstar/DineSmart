import type { Db, ObjectId, WithId } from "mongodb";
import {
  COLLECTIONS,
  type RestaurantUserDocument,
  type StaffDocument,
} from "../database/schema.js";
import {
  MANAGEABLE_STAFF_ROLES,
  type ManageableStaffRole,
  STAFF_LIST_LIMIT,
  type StaffListResult,
  type StaffRecord,
  type StaffRepository,
  type StaffUpdate,
} from "./staff.types.js";

export class StaffSelfDeactivationError extends Error {
  constructor() {
    super("A manager cannot deactivate their own staff account.");
    this.name = "StaffSelfDeactivationError";
  }
}

export class StaffUpdateConflictError extends Error {
  constructor() {
    super("The staff account changed during the update.");
    this.name = "StaffUpdateConflictError";
  }
}

export class StaffProjectionSyncError extends Error {
  constructor() {
    super("The staff account changed, but its membership record could not be synchronized.");
    this.name = "StaffProjectionSyncError";
  }
}

function isManageableStaffRole(role: string): role is ManageableStaffRole {
  return (MANAGEABLE_STAFF_ROLES as readonly string[]).includes(role);
}

function toRecord(
  membership: WithId<StaffDocument>,
  user: WithId<RestaurantUserDocument>,
): StaffRecord {
  if (!isManageableStaffRole(user.role)) {
    throw new Error("A staff membership is linked to an unsupported role.");
  }

  return {
    id: membership._id,
    userId: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.status === "active",
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  };
}

const SAFE_USER_PROJECTION = {
  _id: 1,
  name: 1,
  email: 1,
  role: 1,
  status: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

export class MongoStaffRepository implements StaffRepository {
  private readonly staff;
  private readonly users;

  constructor(db: Db) {
    this.staff = db.collection<StaffDocument>(COLLECTIONS.staff);
    this.users = db.collection<RestaurantUserDocument>(COLLECTIONS.users);
  }

  async listForRestaurant(restaurantId: ObjectId): Promise<StaffListResult> {
    const memberships = await this.staff
      .find({ restaurantId })
      .sort({ createdAt: 1, _id: 1 })
      .limit(STAFF_LIST_LIMIT + 1)
      .toArray();
    const boundedMemberships = memberships.slice(0, STAFF_LIST_LIMIT);
    const userIds = boundedMemberships.map((membership) => membership.userId);
    const users = userIds.length
      ? await this.users
          .find(
            {
              _id: { $in: userIds },
              restaurantId,
              role: { $in: [...MANAGEABLE_STAFF_ROLES] },
              status: { $in: ["active", "disabled"] },
            },
            { projection: SAFE_USER_PROJECTION },
          )
          .toArray()
      : [];
    const usersById = new Map(users.map((user) => [user._id.toHexString(), user]));
    const staff = boundedMemberships.flatMap((membership) => {
      const user = usersById.get(membership.userId.toHexString());
      return user ? [toRecord(membership as WithId<StaffDocument>, user)] : [];
    });

    staff.sort(
      (left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
        left.userId.toHexString().localeCompare(right.userId.toHexString()),
    );

    return { staff, truncated: memberships.length > STAFF_LIST_LIMIT };
  }

  async findForRestaurant(restaurantId: ObjectId, staffId: ObjectId): Promise<StaffRecord | null> {
    const membership = await this.staff.findOne({ _id: staffId, restaurantId });
    if (!membership) return null;
    const user = await this.users.findOne(
      {
        _id: membership.userId,
        restaurantId,
        role: { $in: [...MANAGEABLE_STAFF_ROLES] },
        status: { $in: ["active", "disabled"] },
      },
      { projection: SAFE_USER_PROJECTION },
    );
    return user ? toRecord(membership as WithId<StaffDocument>, user) : null;
  }

  async updateForRestaurant(
    restaurantId: ObjectId,
    staffId: ObjectId,
    actorUserId: ObjectId,
    changes: StaffUpdate,
    now: Date,
  ): Promise<StaffRecord | null> {
    const membership = await this.staff.findOne({ _id: staffId, restaurantId });
    if (!membership?._id) return null;
    if (membership.userId.equals(actorUserId) && changes.isActive === false) {
      throw new StaffSelfDeactivationError();
    }

    const currentUser = await this.users.findOne(
      {
        _id: membership.userId,
        restaurantId,
        role: { $in: [...MANAGEABLE_STAFF_ROLES] },
        status: { $in: ["active", "disabled"] },
      },
      { projection: SAFE_USER_PROJECTION },
    );
    if (!currentUser?._id || !isManageableStaffRole(currentUser.role)) return null;

    const nextRole = changes.role ?? currentUser.role;
    const nextStatus =
      changes.isActive === undefined
        ? currentUser.status
        : changes.isActive
          ? "active"
          : "disabled";
    const authChanged = nextRole !== currentUser.role || nextStatus !== currentUser.status;
    let updatedUser = currentUser;

    if (authChanged) {
      const result = await this.users.findOneAndUpdate(
        {
          _id: currentUser._id,
          restaurantId,
          role: currentUser.role,
          status: currentUser.status,
          updatedAt: currentUser.updatedAt,
        },
        {
          $set: {
            role: nextRole,
            status: nextStatus,
            refreshSessionsInvalidBefore: now,
            updatedAt: now,
          },
        },
        {
          returnDocument: "after",
          includeResultMetadata: false,
          projection: SAFE_USER_PROJECTION,
        },
      );
      if (!result?._id) {
        const stillExists = await this.users.findOne({ _id: currentUser._id, restaurantId });
        if (stillExists) throw new StaffUpdateConflictError();
        return null;
      }
      updatedUser = result;
    }

    const membershipUpdate = await this.staff.updateOne(
      { _id: staffId, restaurantId, userId: membership.userId },
      {
        $set: {
          role: nextRole,
          isActive: nextStatus === "active",
          updatedAt: now,
        },
      },
    );
    if (membershipUpdate.matchedCount === 0) throw new StaffProjectionSyncError();

    return toRecord(
      { ...membership, role: nextRole, isActive: nextStatus === "active", updatedAt: now },
      updatedUser,
    );
  }
}
