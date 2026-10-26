import type { Db, ObjectId } from "mongodb";
import {
  COLLECTIONS,
  type ReservationDocument,
  type RestaurantDocument,
  type TableDocument,
} from "../database/schema.js";
import type {
  AvailabilityBooking,
  AvailabilityRepository,
  AvailabilityRestaurant,
  AvailabilityTable,
} from "./availability.service.js";

/** Statuses that no longer hold a table. Matches the legacy spellings the seed used. */
export const INACTIVE_BOOKING_STATUSES = [
  "Cancelled",
  "cancelled",
  "Canceled",
  "canceled",
  "Completed",
  "completed",
  "NoShow",
  "No Show",
  "no_show",
  "no-show",
] as const;

const AVAILABILITY_TABLE_LIMIT = 200;
const AVAILABILITY_BOOKING_LIMIT = 2_000;

export class MongoAvailabilityRepository implements AvailabilityRepository {
  private readonly restaurants;
  private readonly tables;
  private readonly reservations;

  constructor(db: Db) {
    this.restaurants = db.collection<RestaurantDocument>(COLLECTIONS.restaurants);
    this.tables = db.collection<TableDocument>(COLLECTIONS.tables);
    this.reservations = db.collection<ReservationDocument>(COLLECTIONS.reservations);
  }

  async getActiveRestaurant(restaurantId: ObjectId): Promise<AvailabilityRestaurant | null> {
    const restaurant = await this.restaurants.findOne(
      { _id: restaurantId, status: "active" },
      { projection: { timezone: 1, operatingHours: 1, bookingRules: 1 } },
    );
    if (!restaurant) return null;
    return {
      timeZone: restaurant.timezone,
      ...(restaurant.operatingHours ? { operatingHours: restaurant.operatingHours } : {}),
      ...(restaurant.bookingRules ? { bookingRules: restaurant.bookingRules } : {}),
    };
  }

  async listTables(restaurantId: ObjectId): Promise<AvailabilityTable[]> {
    const tables = await this.tables
      .find(
        { restaurantId },
        { projection: { capacity: 1, status: 1, tableNumber: 1, zone: 1, accessible: 1 } },
      )
      .limit(AVAILABILITY_TABLE_LIMIT)
      .toArray();
    return tables.map((table) => ({
      id: table._id.toHexString(),
      capacity: table.capacity,
      status: table.status,
      tableNumber: table.tableNumber,
      ...(table.zone ? { zone: table.zone } : {}),
      ...(table.accessible ? { accessible: true } : {}),
    }));
  }

  async findBooking(
    restaurantId: ObjectId,
    reservationId: ObjectId,
  ): Promise<{ partySize: number; startAt: Date; endAt: Date } | null> {
    const booking = await this.reservations.findOne(
      { _id: reservationId, restaurantId },
      { projection: { partySize: 1, startAt: 1, endAt: 1 } },
    );
    return booking
      ? { partySize: booking.partySize, startAt: booking.startAt, endAt: booking.endAt }
      : null;
  }

  async listActiveBookings(
    restaurantId: ObjectId,
    from: Date,
    to: Date,
    excludingReservationId?: ObjectId,
  ): Promise<AvailabilityBooking[]> {
    const filter: Record<string, unknown> = {
      restaurantId,
      status: { $nin: INACTIVE_BOOKING_STATUSES },
      startAt: { $lt: to },
      endAt: { $gt: from },
    };
    if (excludingReservationId) filter._id = { $ne: excludingReservationId };
    const bookings = await this.reservations
      .find(filter, { projection: { tableId: 1, partySize: 1, startAt: 1, endAt: 1 } })
      .sort({ startAt: 1 })
      .limit(AVAILABILITY_BOOKING_LIMIT)
      .toArray();
    return bookings.map((booking) => ({
      tableId: booking.tableId ? booking.tableId.toHexString() : null,
      partySize: booking.partySize,
      startAt: booking.startAt,
      endAt: booking.endAt,
    }));
  }
}
