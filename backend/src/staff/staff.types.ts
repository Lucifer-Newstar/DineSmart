import type { ObjectId } from "mongodb";
import type { UserRole } from "../database/schema.js";

export const STAFF_LIST_LIMIT = 500;
export const MANAGEABLE_STAFF_ROLES = [
  "Reception",
  "Kitchen Staff",
  "Manager",
  "Administrator",
] as const satisfies readonly UserRole[];

export type ManageableStaffRole = (typeof MANAGEABLE_STAFF_ROLES)[number];

export interface StaffRecord {
  id: ObjectId;
  userId: ObjectId;
  name: string;
  email: string;
  role: ManageableStaffRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffListResult {
  staff: StaffRecord[];
  truncated: boolean;
}

export interface StaffUpdate {
  role?: ManageableStaffRole;
  isActive?: boolean;
}

export interface StaffRepository {
  listForRestaurant(restaurantId: ObjectId): Promise<StaffListResult>;
  updateForRestaurant(
    restaurantId: ObjectId,
    staffId: ObjectId,
    actorUserId: ObjectId,
    changes: StaffUpdate,
    now: Date,
  ): Promise<StaffRecord | null>;
}

export interface StaffServiceReader {
  list(restaurantId: ObjectId): Promise<StaffListResult>;
  update(
    restaurantId: ObjectId,
    staffId: ObjectId,
    actorUserId: ObjectId,
    changes: StaffUpdate,
  ): Promise<StaffRecord>;
}
