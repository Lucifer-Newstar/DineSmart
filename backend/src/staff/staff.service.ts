import type { ObjectId } from "mongodb";
import type { AuditRecorder } from "../audit/audit.service.js";
import type { UserRole } from "../database/schema.js";
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
    private readonly audit?: AuditRecorder,
  ) {}

  private async findBefore(restaurantId: ObjectId, staffId: ObjectId) {
    if (this.repository.findForRestaurant) {
      return this.repository.findForRestaurant(restaurantId, staffId);
    }
    const { staff } = await this.repository.listForRestaurant(restaurantId);
    return staff.find((member) => member.id.equals(staffId)) ?? null;
  }

  /**
   * One audit entry per kind of change. A failed write is reported but does
   * not undo or fail the change the manager already made.
   */
  private async recordChanges(
    restaurantId: ObjectId,
    actor: { userId: ObjectId; role: UserRole },
    before: StaffRecord,
    after: StaffRecord,
  ): Promise<void> {
    if (!this.audit) return;
    const target = { type: "staff", id: after.id, label: after.name };
    const changes = [];
    if (before.role !== after.role) {
      changes.push({
        action: "staff.role_changed" as const,
        before: { role: before.role },
        after: { role: after.role },
      });
    }
    if (before.isActive !== after.isActive) {
      changes.push({
        action: after.isActive ? ("staff.activated" as const) : ("staff.deactivated" as const),
        before: { isActive: before.isActive },
        after: { isActive: after.isActive },
      });
    }
    for (const change of changes) {
      try {
        await this.audit({ restaurantId, actor, target, ...change });
      } catch {
        console.error("An audit log entry could not be written.");
      }
    }
  }

  list(restaurantId: ObjectId): Promise<StaffListResult> {
    return this.repository.listForRestaurant(restaurantId);
  }

  async update(
    restaurantId: ObjectId,
    staffId: ObjectId,
    actorUserId: ObjectId,
    changes: StaffUpdate,
    actorRole: UserRole = "Manager",
  ): Promise<StaffRecord> {
    validateUpdate(changes);

    try {
      const before = this.audit ? await this.findBefore(restaurantId, staffId) : null;
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
      if (before) {
        await this.recordChanges(
          restaurantId,
          { userId: actorUserId, role: actorRole },
          before,
          staff,
        );
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
