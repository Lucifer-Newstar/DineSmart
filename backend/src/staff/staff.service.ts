import type { ObjectId } from "mongodb";
import {
  StaffProjectionSyncError,
  StaffSelfDeactivationError,
  StaffUpdateConflictError,
} from "./staff.repository.js";
import type {
  ManageableStaffRole,
  StaffListResult,
  StaffRecord,
  StaffRepository,
  StaffServiceReader,
  StaffUpdate,
} from "./staff.types.js";
import { MANAGEABLE_STAFF_ROLES } from "./staff.types.js";

export class StaffServiceError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StaffServiceError";
  }
}

function isManageableStaffRole(role: unknown): role is ManageableStaffRole {
  return typeof role === "string" && (MANAGEABLE_STAFF_ROLES as readonly string[]).includes(role);
}

function validateUpdate(changes: StaffUpdate): void {
  if (
    !changes ||
    typeof changes !== "object" ||
    Object.keys(changes).length === 0 ||
    Object.keys(changes).some((key) => key !== "role" && key !== "isActive") ||
    (changes.role === undefined && changes.isActive === undefined) ||
    (changes.role !== undefined && !isManageableStaffRole(changes.role)) ||
    (changes.isActive !== undefined && typeof changes.isActive !== "boolean")
  ) {
    throw new StaffServiceError(
      400,
      "invalid_staff_update",
      "Provide a supported role and/or active-state change.",
    );
  }
}

export class StaffService implements StaffServiceReader {
  constructor(
    private readonly repository: StaffRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  list(restaurantId: ObjectId): Promise<StaffListResult> {
    return this.repository.listForRestaurant(restaurantId);
  }

  async update(
    restaurantId: ObjectId,
    staffId: ObjectId,
    actorUserId: ObjectId,
    changes: StaffUpdate,
  ): Promise<StaffRecord> {
    validateUpdate(changes);

    try {
      const staff = await this.repository.updateForRestaurant(
        restaurantId,
        staffId,
        actorUserId,
        changes,
        this.clock(),
      );
      if (!staff) {
        throw new StaffServiceError(404, "staff_not_found", "The staff member was not found.");
      }
      return staff;
    } catch (error) {
      if (error instanceof StaffServiceError) throw error;
      if (error instanceof StaffSelfDeactivationError) {
        throw new StaffServiceError(
          409,
          "staff_self_deactivation_forbidden",
          "You cannot deactivate your own account.",
        );
      }
      if (error instanceof StaffUpdateConflictError) {
        throw new StaffServiceError(
          409,
          "staff_update_conflict",
          "The staff member changed during this request. Reload and try again.",
        );
      }
      if (error instanceof StaffProjectionSyncError) {
        throw new StaffServiceError(
          503,
          "staff_update_incomplete",
          "The account changed, but its staff record may not have synchronized. Reload and retry.",
        );
      }
      throw error;
    }
  }
}
