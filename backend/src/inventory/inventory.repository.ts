import type { Db, ObjectId } from "mongodb";
import { COLLECTIONS, type InventoryItemDocument } from "../database/schema.js";
import type {
  InventoryAdjustment,
  InventoryItemRecord,
  InventoryListResult,
  InventoryRepository,
} from "./inventory.types.js";

export const INVENTORY_LIST_LIMIT = 2_000;

/**
 * Stock reads need the dashboard's display and threshold fields only; the
 * remaining audit fields stay server-side.
 */
const INVENTORY_PROJECTION = {
  _id: 1,
  restaurantId: 1,
  name: 1,
  quantity: 1,
  unit: 1,
  lowStockThreshold: 1,
  lastAdjustedAt: 1,
} as const;

function toRecord(document: InventoryItemDocument & { _id: ObjectId }): InventoryItemRecord {
  return {
    id: document._id,
    name: document.name,
    quantity: document.quantity,
    unit: document.unit,
    lowStockThreshold: document.lowStockThreshold,
    lastAdjustedAt: document.lastAdjustedAt,
  };
}

export class MongoInventoryRepository implements InventoryRepository {
  constructor(private readonly db: Db) {}

  async listForRestaurant(restaurantId: ObjectId): Promise<InventoryListResult> {
    const documents = await this.db
      .collection<InventoryItemDocument>(COLLECTIONS.inventoryItems)
      .find({ restaurantId }, { projection: INVENTORY_PROJECTION })
      .sort({ name: 1 })
      .limit(INVENTORY_LIST_LIMIT + 1)
      .toArray();

    return {
      items: documents
        .slice(0, INVENTORY_LIST_LIMIT)
        .map((document) => toRecord(document as InventoryItemDocument & { _id: ObjectId })),
      truncated: documents.length > INVENTORY_LIST_LIMIT,
    };
  }

  async adjustItem(
    restaurantId: ObjectId,
    itemId: ObjectId,
    adjustment: InventoryAdjustment & { adjustedAt: Date },
  ): Promise<InventoryItemRecord | null> {
    const collection = this.db.collection<InventoryItemDocument>(COLLECTIONS.inventoryItems);
    const fields: Partial<InventoryItemDocument> = {
      quantity: adjustment.quantity,
      lastAdjustedAt: adjustment.adjustedAt,
      updatedAt: adjustment.adjustedAt,
    };
    if (adjustment.lowStockThreshold !== undefined) {
      fields.lowStockThreshold = adjustment.lowStockThreshold;
    }

    const update = await collection.updateOne({ _id: itemId, restaurantId }, { $set: fields });
    if (update.matchedCount === 0) return null;

    const document = await collection.findOne(
      { _id: itemId, restaurantId },
      { projection: INVENTORY_PROJECTION },
    );
    return document ? toRecord(document as InventoryItemDocument & { _id: ObjectId }) : null;
  }
}
