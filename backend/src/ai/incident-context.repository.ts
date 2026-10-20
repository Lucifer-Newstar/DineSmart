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

// The advisory prompt is built from a fixed field list, so each read names the
// fields it will actually consume instead of hydrating whole documents.
const INCIDENT_PROJECTION = {
  type: 1,
  severity: 1,
  status: 1,
  createdAt: 1,
  triggerSnapshot: 1,
} as const;

const RESTAURANT_PROJECTION = { timezone: 1, currency: 1, thresholds: 1 } as const;
const ACTIVE_ORDER_PROJECTION = { status: 1, statusTimestamps: 1, createdAt: 1 } as const;
const LOW_STOCK_PROJECTION = { name: 1, quantity: 1, unit: 1, lowStockThreshold: 1 } as const;
const UPCOMING_RESERVATION_PROJECTION = { partySize: 1, startAt: 1 } as const;

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
    return this.incidents.findOne(
      { _id: incidentId, restaurantId },
      {
        projection: INCIDENT_PROJECTION,
      },
    );
  }

  findRestaurant(restaurantId: ObjectId): Promise<WithId<RestaurantDocument> | null> {
    return this.restaurants.findOne({ _id: restaurantId }, { projection: RESTAURANT_PROJECTION });
  }

  findActiveOrders(restaurantId: ObjectId): Promise<Array<WithId<OrderDocument>>> {
    return this.orders
      .find(
        { restaurantId, status: { $in: [...ACTIVE_ORDER_STATUSES] } },
        {
          projection: ACTIVE_ORDER_PROJECTION,
        },
      )
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();
  }

  findLowStockItems(restaurantId: ObjectId): Promise<Array<WithId<InventoryItemDocument>>> {
    return this.inventoryItems
      .find(
        { restaurantId, $expr: { $lte: ["$quantity", "$lowStockThreshold"] } },
        {
          projection: LOW_STOCK_PROJECTION,
        },
      )
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
      .find(
        { restaurantId, status: "Confirmed", startAt: { $gte: now, $lte: horizon } },
        {
          projection: UPCOMING_RESERVATION_PROJECTION,
        },
      )
      .sort({ startAt: 1 })
      .limit(20)
      .toArray();
  }
}
