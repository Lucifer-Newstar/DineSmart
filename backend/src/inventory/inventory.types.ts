import type { ObjectId } from "mongodb";
import type { AuditActor } from "../audit/audit.types.js";

export interface InventoryItemRecord {
  id: ObjectId;
  name: string;
  quantity: number;
  unit: string;
  lowStockThreshold: number;
  lastAdjustedAt: Date;
}

export interface InventoryListResult {
  items: InventoryItemRecord[];
  truncated: boolean;
}

export interface InventoryAdjustment {
  quantity: number;
  lowStockThreshold?: number;
}

export interface InventoryRepository {
  listForRestaurant(restaurantId: ObjectId): Promise<InventoryListResult>;
  /** Used to capture the audit log's "before" state; optional for test doubles. */
  findForRestaurant?(restaurantId: ObjectId, itemId: ObjectId): Promise<InventoryItemRecord | null>;
  adjustItem(
    restaurantId: ObjectId,
    itemId: ObjectId,
    adjustment: InventoryAdjustment & { adjustedAt: Date },
  ): Promise<InventoryItemRecord | null>;
}

export interface InventoryServiceReader {
  list(restaurantId: ObjectId): Promise<InventoryListResult>;
  adjust(
    restaurantId: ObjectId,
    itemId: ObjectId,
    adjustment: InventoryAdjustment,
    actor?: AuditActor,
  ): Promise<InventoryItemRecord>;
}

export interface InventoryFullItemResponse {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  lowStockThreshold: number;
  isLowStock: boolean;
  lastAdjustedAt: string;
}

export interface InventoryAvailabilityResponse {
  id: string;
  name: string;
  availability: "low" | "available";
}
