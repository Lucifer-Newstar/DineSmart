import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { InventoryError, InventoryService } from "../src/inventory/inventory.service.js";
import type { InventoryRepository } from "../src/inventory/inventory.types.js";

test("inventory service validates manual stock counts and stamps adjustments", async () => {
  const restaurantId = new ObjectId();
  const itemId = new ObjectId();
  const now = new Date("2026-10-10T12:00:00.000Z");
  let receivedAdjustment:
    | { quantity: number; lowStockThreshold?: number; adjustedAt: Date }
    | undefined;
  const repository: InventoryRepository = {
    listForRestaurant: async () => ({ items: [], truncated: false }),
    adjustItem: async (_restaurantId, _itemId, adjustment) => {
      receivedAdjustment = adjustment;
      return {
        id: itemId,
        name: "Paneer",
        quantity: adjustment.quantity,
        unit: "kg",
        lowStockThreshold: adjustment.lowStockThreshold ?? 4,
        lastAdjustedAt: adjustment.adjustedAt,
      };
    },
  };
  const incidentRequests: ObjectId[] = [];
  const service = new InventoryService(
    repository,
    () => now,
    (tenantId) => incidentRequests.push(tenantId),
  );

  await assert.rejects(
    service.adjust(restaurantId, itemId, { quantity: -1 }),
    (error: unknown) => error instanceof InventoryError && error.statusCode === 400,
  );
  const result = await service.adjust(restaurantId, itemId, { quantity: 8, lowStockThreshold: 5 });

  assert.equal(result.quantity, 8);
  assert.deepEqual(receivedAdjustment, { quantity: 8, lowStockThreshold: 5, adjustedAt: now });
  assert.deepEqual(incidentRequests, [restaurantId]);
});

test("inventory service reports a scoped missing item as not found", async () => {
  const repository: InventoryRepository = {
    listForRestaurant: async () => ({ items: [], truncated: false }),
    adjustItem: async () => null,
  };
  const service = new InventoryService(repository);

  await assert.rejects(
    service.adjust(new ObjectId(), new ObjectId(), { quantity: 1 }),
    (error: unknown) =>
      error instanceof InventoryError &&
      error.statusCode === 404 &&
      error.code === "inventory_item_not_found",
  );
});
