import type { Db, ObjectId, WithId } from "mongodb";
import {
  COLLECTIONS,
  type IncidentDocument,
  type InventoryItemDocument,
  type OrderDocument,
  type ReservationDocument,
  type RestaurantDocument,
} from "../database/schema.js";
import type { IncidentContextSource } from "./incident-context.builder.js";

const ACTIVE_ORDER_STATUSES = ["Created", "Accepted", "Preparing"] as const;

export class MongoIncidentContextRepository implements IncidentContextSource {
  private readonly incidents;
  private readonly restaurants;
  private readonly orders;
  private readonly inventoryItems;
  private readonly reservations;

  constructor(db: Db) {
    this.incidents = db.collection<IncidentDocument>(COLLECTIONS.incidents);
    this.restaurants = db.collection<RestaurantDocument>(COLLECTIONS.restaurants);
    this.orders = db.collection<OrderDocument>(COLLECTIONS.orders);
    this.inventoryItems = db.collection<InventoryItemDocument>(COLLECTIONS.inventoryItems);
    this.reservations = db.collection<ReservationDocument>(COLLECTIONS.reservations);
  }

  findIncident(
    restaurantId: ObjectId,
    incidentId: ObjectId,
  ): Promise<WithId<IncidentDocument> | null> {
    return this.incidents.findOne({ _id: incidentId, restaurantId });
  }

  findRestaurant(restaurantId: ObjectId): Promise<WithId<RestaurantDocument> | null> {
    return this.restaurants.findOne({ _id: restaurantId });
  }

  findActiveOrders(restaurantId: ObjectId): Promise<Array<WithId<OrderDocument>>> {
    return this.orders
      .find({ restaurantId, status: { $in: [...ACTIVE_ORDER_STATUSES] } })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
  }

  findLowStockItems(restaurantId: ObjectId): Promise<Array<WithId<InventoryItemDocument>>> {
    return this.inventoryItems
      .find({ restaurantId, $expr: { $lte: ["$quantity", "$lowStockThreshold"] } })
      .sort({ quantity: 1 })
      .limit(20)
      .toArray();
  }

  findUpcomingReservations(
    restaurantId: ObjectId,
    now: Date,
  ): Promise<Array<WithId<ReservationDocument>>> {
    const horizon = new Date(now.getTime() + 3 * 60 * 60 * 1_000);
    return this.reservations
      .find({ restaurantId, status: "Confirmed", startAt: { $gte: now, $lte: horizon } })
      .sort({ startAt: 1 })
      .limit(20)
      .toArray();
  }
}
