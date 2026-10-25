import type { ObjectId } from "mongodb";
import type { UserRole } from "../database/schema.js";

export const AUDIT_ACTIONS = [
  "staff.role_changed",
  "staff.activated",
  "staff.deactivated",
  "inventory.threshold_changed",
  "menu.item_created",
  "menu.item_updated",
  "menu.item_archived",
  "menu.availability_changed",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_PAGE_DEFAULT = 50;
export const AUDIT_PAGE_MAX = 200;

export interface AuditActor {
  userId: ObjectId;
  role: UserRole;
}

export interface AuditEntryInput {
  restaurantId: ObjectId;
  actor: AuditActor;
  action: AuditAction;
  target: { type: string; id: ObjectId; label?: string };
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface AuditEntry extends AuditEntryInput {
  id: ObjectId;
  createdAt: Date;
}

export interface AuditQuery {
  limit: number;
  /** Return entries strictly older than this entry (keyset pagination). */
  before?: { createdAt: Date; id: ObjectId };
  action?: AuditAction;
}

export interface AuditPage {
  entries: AuditEntry[];
  hasMore: boolean;
}

export interface AuditRepository {
  insert(entry: AuditEntryInput, createdAt: Date): Promise<AuditEntry>;
  findById(restaurantId: ObjectId, id: ObjectId): Promise<AuditEntry | null>;
  listForRestaurant(restaurantId: ObjectId, query: AuditQuery): Promise<AuditPage>;
}
