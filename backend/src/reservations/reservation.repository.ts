import type { Db, ObjectId, WithId } from "mongodb";
import { MongoCustomerProfileRepository } from "../customers/customer-profile.repository.js";
import {
  COLLECTIONS,
  type CustomerDocument,
  type ReservationDocument,
  type RestaurantDocument,
  type TableDocument,
} from "../database/schema.js";
import type {
  NewReservation,
  ReservationChanges,
  ReservationListResult,
  ReservationRecord,
  ReservationRepository,
  ReservationSchedule,
} from "./reservation.types.js";
import { RESERVATION_OCCASIONS, type ReservationOccasion } from "./reservation.types.js";

export const RESERVATION_LIST_LIMIT = 500;

const INACTIVE_RESERVATION_STATUSES = [
  "Cancelled",
  "cancelled",
  "Canceled",
  "canceled",
  "NoShow",
  "No Show",
  "no_show",
  "no-show",
] as const;

export class MongoReservationRepository implements ReservationRepository {
  private readonly reservations;
  private readonly customers;
  private readonly customerProfiles: MongoCustomerProfileRepository;
  private readonly restaurants;
  private readonly tables;

  constructor(db: Db) {
    this.reservations = db.collection<ReservationDocument>(COLLECTIONS.reservations);
    this.customers = db.collection<CustomerDocument>(COLLECTIONS.customers);
    this.customerProfiles = new MongoCustomerProfileRepository(db);
    this.restaurants = db.collection<RestaurantDocument>(COLLECTIONS.restaurants);
    this.tables = db.collection<TableDocument>(COLLECTIONS.tables);
  }

  getCustomerIdForUser(userId: ObjectId, now: Date): Promise<ObjectId | null> {
    return this.customerProfiles.getCustomerIdForUser(userId, now);
  }

  async getActiveRestaurant(restaurantId: ObjectId): Promise<ReservationSchedule | null> {
    const restaurant = await this.restaurants.findOne({ _id: restaurantId, status: "active" });
    if (!restaurant) return null;
    return {
      timeZone: restaurant.timezone,
      ...(restaurant.operatingHours ? { operatingHours: restaurant.operatingHours } : {}),
      ...(restaurant.bookingRules ? { bookingRules: restaurant.bookingRules } : {}),
    };
  }

  async customerExists(customerId: ObjectId): Promise<boolean> {
    return (await this.customers.findOne({ _id: customerId }, { projection: { _id: 1 } })) !== null;
  }

  async getTable(
    restaurantId: ObjectId,
    tableId: ObjectId,
  ): Promise<{ capacity: number; status: string; tableNumber: string } | null> {
    const table = await this.tables.findOne({ _id: tableId, restaurantId });
    return table
      ? { capacity: table.capacity, status: table.status, tableNumber: table.tableNumber }
      : null;
  }

  async hasTableConflict(
    restaurantId: ObjectId,
    tableId: ObjectId,
    startAt: Date,
    endAt: Date,
    excludingReservationId?: ObjectId,
  ): Promise<boolean> {
    const filter: Record<string, unknown> = {
      restaurantId,
      tableId,
      status: { $nin: INACTIVE_RESERVATION_STATUSES },
      startAt: { $lt: endAt },
      endAt: { $gt: startAt },
    };
    if (excludingReservationId) filter._id = { $ne: excludingReservationId };
    return (await this.reservations.findOne(filter, { projection: { _id: 1 } })) !== null;
  }

  async createReservation(reservation: NewReservation, now: Date): Promise<ReservationRecord> {
    const document: ReservationDocument = {
      ...reservation,
      createdAt: now,
      updatedAt: now,
    };
    const result = await this.reservations.insertOne(document);
    const created = await this.findForRestaurant(result.insertedId, reservation.restaurantId);
    if (!created) throw new Error("The new reservation could not be read back.");
    return created;
  }

  listForRestaurant(restaurantId: ObjectId): Promise<ReservationListResult> {
    return this.list({ restaurantId });
  }

  listForCustomer(customerId: ObjectId): Promise<ReservationListResult> {
    return this.list({ customerId });
  }

  async findForRestaurant(
    reservationId: ObjectId,
    restaurantId: ObjectId,
  ): Promise<ReservationRecord | null> {
    const reservation = await this.reservations.findOne({ _id: reservationId, restaurantId });
    if (!reservation) return null;
    return (await this.toRecords([reservation]))[0] ?? null;
  }

  async findForCustomer(
    reservationId: ObjectId,
    customerId: ObjectId,
  ): Promise<ReservationRecord | null> {
    const reservation = await this.reservations.findOne({ _id: reservationId, customerId });
    if (!reservation) return null;
    return (await this.toRecords([reservation]))[0] ?? null;
  }

  async updateForRestaurant(
    reservationId: ObjectId,
    restaurantId: ObjectId,
    expectedUpdatedAt: Date,
    changes: ReservationChanges,
    now: Date,
  ): Promise<ReservationRecord | null> {
    const result = await this.reservations.updateOne(
      { _id: reservationId, restaurantId, updatedAt: expectedUpdatedAt },
      toUpdate(changes, now),
    );
    if (result.matchedCount === 0) return null;
    return this.findForRestaurant(reservationId, restaurantId);
  }

  async updateForCustomer(
    reservationId: ObjectId,
    customerId: ObjectId,
    expectedUpdatedAt: Date,
    changes: ReservationChanges,
    now: Date,
  ): Promise<ReservationRecord | null> {
    const result = await this.reservations.updateOne(
      { _id: reservationId, customerId, updatedAt: expectedUpdatedAt },
      toUpdate(changes, now),
    );
    if (result.matchedCount === 0) return null;
    return this.findForCustomer(reservationId, customerId);
  }

  async setTableOccupancy(
    restaurantId: ObjectId,
    tableId: ObjectId,
    reservationId: ObjectId | null,
    now: Date,
    releasingReservationId?: ObjectId,
  ): Promise<boolean> {
    if (reservationId) {
      const result = await this.tables.updateOne(
        { _id: tableId, restaurantId, status: { $in: ["available", "reserved", "occupied"] } },
        { $set: { status: "occupied", currentReservationId: reservationId, updatedAt: now } },
      );
      return result.modifiedCount > 0;
    }
    const result = await this.tables.updateOne(
      { _id: tableId, restaurantId, currentReservationId: releasingReservationId ?? null },
      { $set: { status: "available", currentReservationId: null, updatedAt: now } },
    );
    return result.modifiedCount > 0;
  }

  private async list(filter: Record<string, unknown>): Promise<ReservationListResult> {
    const documents = await this.reservations
      .find(filter)
      .sort({ startAt: 1, _id: 1 })
      .limit(RESERVATION_LIST_LIMIT + 1)
      .toArray();
    const truncated = documents.length > RESERVATION_LIST_LIMIT;
    return {
      reservations: await this.toRecords(documents.slice(0, RESERVATION_LIST_LIMIT)),
      truncated,
    };
  }

  private async toRecords(
    documents: Array<WithId<ReservationDocument>>,
  ): Promise<ReservationRecord[]> {
    if (documents.length === 0) return [];

    const customerIds = [
      ...new Map(
        documents.map((document) => [document.customerId.toHexString(), document.customerId]),
      ).values(),
    ];
    const restaurantIds = [
      ...new Map(
        documents.map((document) => [document.restaurantId.toHexString(), document.restaurantId]),
      ).values(),
    ];
    const tableLookups = documents.flatMap((document) =>
      document.tableId ? [{ _id: document.tableId, restaurantId: document.restaurantId }] : [],
    );
    const [customers, tables, restaurants] = await Promise.all([
      this.customers.find({ _id: { $in: customerIds } }).toArray(),
      tableLookups.length > 0
        ? this.tables.find({ $or: tableLookups }).toArray()
        : Promise.resolve([]),
      this.restaurants.find({ _id: { $in: restaurantIds } }).toArray(),
    ]);
    const customerNames = new Map(
      customers.map((customer) => [customer._id.toHexString(), customer.displayName]),
    );
    const restaurantNames = new Map(
      restaurants.map((restaurant) => [restaurant._id.toHexString(), restaurant.name]),
    );
    const tableNumbers = new Map(
      tables.map((table) => [table._id.toHexString(), table.tableNumber]),
    );

    return documents.map((document) => ({
      id: document._id,
      restaurantId: document.restaurantId,
      restaurantName: restaurantNames.get(document.restaurantId.toHexString()) ?? "Restaurant",
      guestName: customerNames.get(document.customerId.toHexString()) ?? "Guest",
      partySize: document.partySize,
      startAt: document.startAt,
      endAt: document.endAt,
      tableId: document.tableId ?? null,
      tableNumber: document.tableId
        ? (tableNumbers.get(document.tableId.toHexString()) ?? null)
        : null,
      status: document.status,
      ...(document.notes === undefined ? {} : { notes: document.notes }),
      ...(isOccasion(document.occasion) ? { occasion: document.occasion } : {}),
      ...(document.dietaryNotes ? { dietaryNotes: document.dietaryNotes } : {}),
      ...(document.arrivedAt ? { arrivedAt: document.arrivedAt } : {}),
      ...(document.seatedAt ? { seatedAt: document.seatedAt } : {}),
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }));
  }
}

const OCCASIONS = new Set<string>(RESERVATION_OCCASIONS);

function isOccasion(value: unknown): value is ReservationOccasion {
  return typeof value === "string" && OCCASIONS.has(value);
}

/** Null occasion or dietary notes clear the stored field; a null table stays an explicit null. */
function toUpdate(changes: ReservationChanges, now: Date) {
  const { occasion, dietaryNotes, ...rest } = changes;
  const set: Record<string, unknown> = { ...rest, updatedAt: now };
  const unset: Record<string, ""> = {};
  if (occasion === null) unset.occasion = "";
  else if (occasion !== undefined) set.occasion = occasion;
  if (dietaryNotes === null) unset.dietaryNotes = "";
  else if (dietaryNotes !== undefined) set.dietaryNotes = dietaryNotes;
  return Object.keys(unset).length > 0 ? { $set: set, $unset: unset } : { $set: set };
}
