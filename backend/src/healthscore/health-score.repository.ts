import type { Db, ObjectId } from "mongodb";
import type {
  IncidentDocument,
  InventoryItemDocument,
  OrderDocument,
  ReservationDocument,
  RestaurantDocument,
  TableDocument,
} from "../database/schema.js";
import { COLLECTIONS } from "../database/schema.js";
import { HEALTH_SCORE_RECORD_LIMIT } from "./health-score.service.js";
import type {
  HealthScoreIncident,
  HealthScoreInventoryItem,
  HealthScoreOrder,
  HealthScoreRepository,
  HealthScoreReservation,
  HealthScoreSnapshot,
  HealthScoreTable,
} from "./health-score.types.js";

function capped<T>(collectionName: string, records: T[], truncatedCollections: Set<string>): T[] {
  if (records.length > HEALTH_SCORE_RECORD_LIMIT) {
    truncatedCollections.add(collectionName);
    return records.slice(0, HEALTH_SCORE_RECORD_LIMIT);
  }
  return records;
}

export class MongoHealthScoreRepository implements HealthScoreRepository {
  constructor(private readonly db: Db) {}

  async listActiveRestaurantIds(): Promise<ObjectId[]> {
    const restaurants = await this.db
      .collection<RestaurantDocument>(COLLECTIONS.restaurants)
      .find({ status: "active" }, { projection: { _id: 1 } })
      .sort({ _id: 1 })
      .toArray();
    return restaurants.map((restaurant) => restaurant._id);
  }

  async getSnapshot(restaurantId: ObjectId, from: Date, until: Date): Promise<HealthScoreSnapshot> {
    const [
      orderRecords,
      inventoryRecords,
      reservationRecords,
      tableRecords,
      incidentRecords,
      restaurant,
    ] = await Promise.all([
      this.db
        .collection<OrderDocument>(COLLECTIONS.orders)
        .find(
          { restaurantId, createdAt: { $gte: from, $lte: until } },
          { projection: { status: 1, statusTimestamps: 1, createdAt: 1 } },
        )
        .sort({ createdAt: -1 })
        .limit(HEALTH_SCORE_RECORD_LIMIT + 1)
        .toArray(),
      this.db
        .collection<InventoryItemDocument>(COLLECTIONS.inventoryItems)
        .find({ restaurantId }, { projection: { quantity: 1, lowStockThreshold: 1 } })
        .sort({ _id: 1 })
        .limit(HEALTH_SCORE_RECORD_LIMIT + 1)
        .toArray(),
      this.db
        .collection<ReservationDocument>(COLLECTIONS.reservations)
        .find(
          { restaurantId, startAt: { $gte: from, $lte: until } },
          { projection: { status: 1, startAt: 1, endAt: 1 } },
        )
        .sort({ startAt: -1 })
        .limit(HEALTH_SCORE_RECORD_LIMIT + 1)
        .toArray(),
      this.db
        .collection<TableDocument>(COLLECTIONS.tables)
        .find({ restaurantId }, { projection: { status: 1 } })
        .sort({ _id: 1 })
        .limit(HEALTH_SCORE_RECORD_LIMIT + 1)
        .toArray(),
      this.db
        .collection<IncidentDocument>(COLLECTIONS.incidents)
        .find(
          {
            restaurantId,
            status: { $in: ["open", "active"] },
            createdAt: { $gte: from, $lte: until },
          },
          { projection: { status: 1, severity: 1, createdAt: 1 } },
        )
        .sort({ createdAt: -1 })
        .limit(HEALTH_SCORE_RECORD_LIMIT + 1)
        .toArray(),
      this.db
        .collection<RestaurantDocument>(COLLECTIONS.restaurants)
        .findOne({ _id: restaurantId }, { projection: { thresholds: 1 } }),
    ]);

    const truncatedCollections = new Set<string>();
    const orders = capped("orders", orderRecords, truncatedCollections).map(
      ({ status, createdAt, statusTimestamps }): HealthScoreOrder => ({
        status,
        createdAt,
        statusTimestamps,
      }),
    );
    const inventoryItems = capped("inventoryItems", inventoryRecords, truncatedCollections).map(
      ({ quantity, lowStockThreshold }): HealthScoreInventoryItem => ({
        quantity,
        lowStockThreshold,
      }),
    );
    const reservations = capped("reservations", reservationRecords, truncatedCollections).map(
      ({ status, startAt, endAt }): HealthScoreReservation => ({ status, startAt, endAt }),
    );
    const tables = capped("tables", tableRecords, truncatedCollections).map(
      ({ status }): HealthScoreTable => ({ status }),
    );
    const incidents = capped("incidents", incidentRecords, truncatedCollections).map(
      ({ status, severity, createdAt }): HealthScoreIncident => ({ status, severity, createdAt }),
    );

    return {
      orders,
      inventoryItems,
      reservations,
      tables,
      incidents,
      thresholds: restaurant?.thresholds ?? {},
      truncatedCollections: [...truncatedCollections],
    };
  }
}
