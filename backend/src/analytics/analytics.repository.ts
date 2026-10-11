import type { Db, ObjectId } from "mongodb";
import type {
  InventoryItemDocument,
  OrderDocument,
  ReservationDocument,
  RestaurantDocument,
} from "../database/schema.js";
import { COLLECTIONS } from "../database/schema.js";
import {
  ANALYTICS_RECORD_LIMIT,
  type AnalyticsInventoryItem,
  type AnalyticsOrder,
  type AnalyticsRepository,
  type AnalyticsReservation,
  type AnalyticsSnapshot,
} from "./analytics.types.js";

function capped<T>(collectionName: string, records: T[], truncatedCollections: Set<string>): T[] {
  if (records.length > ANALYTICS_RECORD_LIMIT) {
    truncatedCollections.add(collectionName);
    return records.slice(0, ANALYTICS_RECORD_LIMIT);
  }
  return records;
}

export class MongoAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly db: Db) {}

  async getRestaurantTimeZone(restaurantId: ObjectId): Promise<string | null> {
    const restaurant = await this.db
      .collection<RestaurantDocument>(COLLECTIONS.restaurants)
      .findOne({ _id: restaurantId }, { projection: { timezone: 1 } });
    return restaurant?.timezone ?? null;
  }

  async getSnapshot(restaurantId: ObjectId, from: Date, until: Date): Promise<AnalyticsSnapshot> {
    const [orderRecords, reservationRecords, inventoryRecords] = await Promise.all([
      this.db
        .collection<OrderDocument>(COLLECTIONS.orders)
        .find(
          { restaurantId, createdAt: { $gte: from, $lte: until } },
          { projection: { status: 1, createdAt: 1, statusTimestamps: 1 } },
        )
        .limit(ANALYTICS_RECORD_LIMIT + 1)
        .toArray(),
      this.db
        .collection<ReservationDocument>(COLLECTIONS.reservations)
        .find(
          { restaurantId, startAt: { $gte: from, $lte: until } },
          { projection: { status: 1, startAt: 1 } },
        )
        .limit(ANALYTICS_RECORD_LIMIT + 1)
        .toArray(),
      this.db
        .collection<InventoryItemDocument>(COLLECTIONS.inventoryItems)
        .find({ restaurantId }, { projection: { quantity: 1, lowStockThreshold: 1 } })
        .limit(ANALYTICS_RECORD_LIMIT + 1)
        .toArray(),
    ]);

    const truncatedCollections = new Set<string>();
    const orders = capped("orders", orderRecords, truncatedCollections).map(
      ({ status, createdAt, statusTimestamps }): AnalyticsOrder => ({
        status,
        createdAt,
        statusTimestamps,
      }),
    );
    const reservations = capped("reservations", reservationRecords, truncatedCollections).map(
      ({ status, startAt }): AnalyticsReservation => ({ status, startAt }),
    );
    const inventoryItems = capped("inventoryItems", inventoryRecords, truncatedCollections).map(
      ({ quantity, lowStockThreshold }): AnalyticsInventoryItem => ({
        quantity,
        lowStockThreshold,
      }),
    );

    return {
      orders,
      reservations,
      inventoryItems,
      truncatedCollections: [...truncatedCollections],
    };
  }
}
