import type { ObjectId } from "mongodb";
import type {
  InventoryAdjustment,
  InventoryItemRecord,
  InventoryListResult,
  InventoryRepository,
  InventoryServiceReader,
} from "./inventory.types.js";

export class InventoryError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InventoryError";
  }
}

function validateAdjustment(adjustment: InventoryAdjustment): void {
  if (
    typeof adjustment.quantity !== "number" ||
    !Number.isFinite(adjustment.quantity) ||
    adjustment.quantity < 0
  ) {
    throw new InventoryError(
      400,
      "invalid_inventory_adjustment",
      "Quantity must be a finite non-negative number.",
    );
  }
  if (
    adjustment.lowStockThreshold !== undefined &&
    (typeof adjustment.lowStockThreshold !== "number" ||
      !Number.isFinite(adjustment.lowStockThreshold) ||
      adjustment.lowStockThreshold < 0)
  ) {
    throw new InventoryError(
      400,
      "invalid_inventory_adjustment",
      "The low-stock threshold must be a finite non-negative number.",
    );
  }
}

export class InventoryService implements InventoryServiceReader {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  list(restaurantId: ObjectId): Promise<InventoryListResult> {
    return this.repository.listForRestaurant(restaurantId);
  }

  async adjust(
    restaurantId: ObjectId,
    itemId: ObjectId,
    adjustment: InventoryAdjustment,
  ): Promise<InventoryItemRecord> {
    validateAdjustment(adjustment);
    const item = await this.repository.adjustItem(restaurantId, itemId, {
      ...adjustment,
      adjustedAt: this.clock(),
    });
    if (!item) {
      throw new InventoryError(
        404,
        "inventory_item_not_found",
        "The inventory item was not found.",
      );
    }
    return item;
  }
}
