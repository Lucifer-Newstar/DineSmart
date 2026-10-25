import type { ObjectId } from "mongodb";
import type { AuditRecorder } from "../audit/audit.service.js";
import type { AuditActor } from "../audit/audit.types.js";
import type { HealthScoreRefreshNotifier } from "../healthscore/health-score.types.js";
import type { IncidentDetectionNotifier } from "../incidents/incident.types.js";
import type { RestaurantRealtimePublisher } from "../realtime/realtime.types.js";
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
    private readonly notifyHealthScoreRefresh: HealthScoreRefreshNotifier = () => undefined,
    private readonly notifyIncidentDetection: IncidentDetectionNotifier = () => undefined,
    private readonly publishRealtime: RestaurantRealtimePublisher = () => undefined,
    private readonly audit?: AuditRecorder,
  ) {}

  list(restaurantId: ObjectId): Promise<InventoryListResult> {
    return this.repository.listForRestaurant(restaurantId);
  }

  private async findBefore(restaurantId: ObjectId, itemId: ObjectId) {
    if (this.repository.findForRestaurant) {
      return this.repository.findForRestaurant(restaurantId, itemId);
    }
    const { items } = await this.repository.listForRestaurant(restaurantId);
    return items.find((item) => item.id.equals(itemId)) ?? null;
  }

  async adjust(
    restaurantId: ObjectId,
    itemId: ObjectId,
    adjustment: InventoryAdjustment,
    actor?: AuditActor,
  ): Promise<InventoryItemRecord> {
    validateAdjustment(adjustment);
    // Quantity counts are routine; only threshold changes are audited.
    const auditThreshold =
      this.audit && actor && adjustment.lowStockThreshold !== undefined
        ? await this.findBefore(restaurantId, itemId)
        : null;
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
    if (auditThreshold && actor && auditThreshold.lowStockThreshold !== item.lowStockThreshold) {
      try {
        await this.audit?.({
          restaurantId,
          actor,
          action: "inventory.threshold_changed",
          target: { type: "inventory_item", id: item.id, label: item.name },
          before: { lowStockThreshold: auditThreshold.lowStockThreshold },
          after: { lowStockThreshold: item.lowStockThreshold },
        });
      } catch {
        console.error("An audit log entry could not be written.");
      }
    }
    this.notifyHealthScoreRefresh(restaurantId);
    this.notifyIncidentDetection(restaurantId);
    this.publishRealtime({
      restaurantId,
      event: "inventory.updated",
      data: { inventoryItemId: item.id.toHexString() },
    });
    return item;
  }
}
