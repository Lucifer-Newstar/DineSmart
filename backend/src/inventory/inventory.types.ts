import type { ObjectId } from "mongodb";

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
