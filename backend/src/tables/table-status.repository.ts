import { type Db, ObjectId, type WithId } from "mongodb";
import {
  COLLECTIONS,
  type OrderDocument,
  type ReservationDocument,
  type TableDocument,
  type WaitlistDocument,
} from "../database/schema.js";
import type {
  TableOperationalStatus,
  TableStatusRecord,
  TableStatusRepository,
  TableStatusUpdateResult,
} from "./table-status.types.js";

const ALLOWED_TRANSITIONS: Readonly<
  Record<TableOperationalStatus, readonly TableOperationalStatus[]>
> = {
  available: ["reserved", "occupied", "disabled", "out_of_service"],
  reserved: ["occupied", "available"],
  occupied: ["available"],
  disabled: ["available"],
  out_of_service: ["available"],
};

const TERMINAL_ORDER_STATUSES = new Set(["completed", "cancelled", "canceled"]);
const TERMINAL_RESERVATION_STATUSES = new Set(["completed", "cancelled", "canceled", "noshow"]);

export class TableStatusTransitionError extends Error {
  constructor() {
    super("The table status transition is not allowed.");
    this.name = "TableStatusTransitionError";
  }
}

export class TableStatusReferenceError extends Error {
  constructor() {
    super("The table has an active, missing, or inconsistent assignment.");
    this.name = "TableStatusReferenceError";
  }
}

export class TableStatusWriteConflictError extends Error {
  constructor() {
    super("The table changed before the status update could be applied.");
    this.name = "TableStatusWriteConflictError";
  }
}

function normalizeState(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeLinkedStatus(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Status reads only need the fields the API serializes, plus the three
// assignment pointers the transition guards validate.
const TABLE_STATUS_PROJECTION = {
  tableNumber: 1,
  capacity: 1,
  zone: 1,
  status: 1,
  createdAt: 1,
  updatedAt: 1,
  currentReservationId: 1,
  currentOrderId: 1,
  currentWaitlistId: 1,
} as const;

// Assignment guards compare the linked table and the linked record's status.
const LINKED_REFERENCE_PROJECTION = { tableId: 1, status: 1 } as const;

function toRecord(document: WithId<TableDocument>): TableStatusRecord {
  const status = normalizeState(document.status) as TableOperationalStatus;
  return {
    id: document._id,
    tableNumber: document.tableNumber,
    capacity: document.capacity,
    ...(document.zone === undefined ? {} : { zone: document.zone }),
    status,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function matchesObjectId(value: unknown, expected: ObjectId): boolean {
  return value instanceof ObjectId && value.equals(expected);
}

function hasReference(value: ObjectId | null | undefined): value is ObjectId {
  return value instanceof ObjectId;
}

function hasCurrentReference(table: WithId<TableDocument>): boolean {
  return (
    table.currentReservationId != null ||
    table.currentOrderId != null ||
    table.currentWaitlistId != null
  );
}

export class MongoTableStatusRepository implements TableStatusRepository {
  private readonly tables;
  private readonly reservations;
  private readonly orders;
  private readonly waitlist;

  constructor(db: Db) {
    this.tables = db.collection<TableDocument>(COLLECTIONS.tables);
    this.reservations = db.collection<ReservationDocument>(COLLECTIONS.reservations);
    this.orders = db.collection<OrderDocument>(COLLECTIONS.orders);
    this.waitlist = db.collection<WaitlistDocument>(COLLECTIONS.waitlist);
  }

  async updateStatusForRestaurant(
    restaurantId: ObjectId,
    tableId: ObjectId,
    status: TableOperationalStatus,
    now: Date,
  ): Promise<TableStatusUpdateResult | null> {
    const current = await this.tables.findOne(
      { _id: tableId, restaurantId },
      { projection: TABLE_STATUS_PROJECTION },
    );
    if (!current?._id) return null;

    const currentStatus = normalizeState(current.status);
    if (!Object.hasOwn(ALLOWED_TRANSITIONS, currentStatus)) throw new TableStatusTransitionError();
    if (
      currentStatus !== status &&
      !ALLOWED_TRANSITIONS[currentStatus as TableOperationalStatus].includes(status)
    ) {
      throw new TableStatusTransitionError();
    }

    if (currentStatus === status && (status !== "available" || !hasCurrentReference(current))) {
      return { table: toRecord(current), changed: false };
    }

    if (status === "available") {
      await this.validateAvailableRelease(restaurantId, current);
    } else if (status === "occupied") {
      await this.validateOccupiedReferences(restaurantId, current);
    } else if (status === "reserved") {
      await this.validateReservedReferences(restaurantId, current);
    } else if (hasCurrentReference(current)) {
      throw new TableStatusReferenceError();
    }

    const unset: Record<string, ""> = {};
    if (status === "available") {
      if (hasReference(current.currentReservationId)) unset.currentReservationId = "";
      if (hasReference(current.currentOrderId)) unset.currentOrderId = "";
      if (hasReference(current.currentWaitlistId)) unset.currentWaitlistId = "";
    }

    const updated = await this.tables.findOneAndUpdate(
      {
        _id: tableId,
        restaurantId,
        status: current.status,
        updatedAt: current.updatedAt,
        currentReservationId: current.currentReservationId ?? null,
        currentOrderId: current.currentOrderId ?? null,
        currentWaitlistId: current.currentWaitlistId ?? null,
      },
      {
        $set: { status, updatedAt: now },
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      {
        returnDocument: "after",
        includeResultMetadata: false,
        projection: TABLE_STATUS_PROJECTION,
      },
    );

    if (updated?._id) return { table: toRecord(updated), changed: true };

    const latest = await this.tables.findOne(
      { _id: tableId, restaurantId },
      { projection: TABLE_STATUS_PROJECTION },
    );
    if (!latest?._id) return null;
    if (
      normalizeState(latest.status) === status &&
      (status !== "available" || !hasCurrentReference(latest))
    ) {
      return { table: toRecord(latest), changed: false };
    }
    throw new TableStatusWriteConflictError();
  }

  private async validateAvailableRelease(
    restaurantId: ObjectId,
    table: WithId<TableDocument>,
  ): Promise<void> {
    if (hasReference(table.currentReservationId)) {
      const reservation = await this.reservations.findOne(
        { _id: table.currentReservationId, restaurantId },
        { projection: LINKED_REFERENCE_PROJECTION },
      );
      if (
        !reservation?._id ||
        !matchesObjectId(reservation.tableId, table._id) ||
        !TERMINAL_RESERVATION_STATUSES.has(normalizeLinkedStatus(reservation.status))
      ) {
        throw new TableStatusReferenceError();
      }
    } else if (table.currentReservationId != null) {
      throw new TableStatusReferenceError();
    }

    if (hasReference(table.currentOrderId)) {
      const order = await this.orders.findOne(
        { _id: table.currentOrderId, restaurantId },
        { projection: LINKED_REFERENCE_PROJECTION },
      );
      if (
        !order?._id ||
        !matchesObjectId(order.tableId, table._id) ||
        !TERMINAL_ORDER_STATUSES.has(normalizeLinkedStatus(order.status))
      ) {
        throw new TableStatusReferenceError();
      }
    } else if (table.currentOrderId != null) {
      throw new TableStatusReferenceError();
    }

    if (hasReference(table.currentWaitlistId)) {
      const entry = await this.waitlist.findOne(
        { _id: table.currentWaitlistId, restaurantId, tableId: table._id, status: "seated" },
        { projection: { _id: 1 } },
      );
      if (!entry?._id) throw new TableStatusReferenceError();
    } else if (table.currentWaitlistId != null) {
      throw new TableStatusReferenceError();
    }
  }

  private async validateOccupiedReferences(
    restaurantId: ObjectId,
    table: WithId<TableDocument>,
  ): Promise<void> {
    if (hasReference(table.currentReservationId)) {
      const reservation = await this.reservations.findOne(
        { _id: table.currentReservationId, restaurantId },
        { projection: LINKED_REFERENCE_PROJECTION },
      );
      if (
        !reservation?._id ||
        !matchesObjectId(reservation.tableId, table._id) ||
        TERMINAL_RESERVATION_STATUSES.has(normalizeLinkedStatus(reservation.status))
      ) {
        throw new TableStatusReferenceError();
      }
    } else if (table.currentReservationId != null) {
      throw new TableStatusReferenceError();
    }

    if (hasReference(table.currentOrderId)) {
      const order = await this.orders.findOne(
        { _id: table.currentOrderId, restaurantId },
        { projection: LINKED_REFERENCE_PROJECTION },
      );
      if (
        !order?._id ||
        !matchesObjectId(order.tableId, table._id) ||
        TERMINAL_ORDER_STATUSES.has(normalizeLinkedStatus(order.status))
      ) {
        throw new TableStatusReferenceError();
      }
    } else if (table.currentOrderId != null) {
      throw new TableStatusReferenceError();
    }

    if (hasReference(table.currentWaitlistId)) {
      const entry = await this.waitlist.findOne(
        { _id: table.currentWaitlistId, restaurantId, tableId: table._id, status: "seated" },
        { projection: { _id: 1 } },
      );
      if (!entry?._id) throw new TableStatusReferenceError();
    } else if (table.currentWaitlistId != null) {
      throw new TableStatusReferenceError();
    }
  }

  private async validateReservedReferences(
    restaurantId: ObjectId,
    table: WithId<TableDocument>,
  ): Promise<void> {
    if (table.currentOrderId != null || table.currentWaitlistId != null) {
      throw new TableStatusReferenceError();
    }
    if (!table.currentReservationId) return;
    if (!hasReference(table.currentReservationId)) throw new TableStatusReferenceError();
    const reservation = await this.reservations.findOne(
      { _id: table.currentReservationId, restaurantId },
      { projection: LINKED_REFERENCE_PROJECTION },
    );
    if (
      !reservation?._id ||
      !matchesObjectId(reservation.tableId, table._id) ||
      TERMINAL_RESERVATION_STATUSES.has(normalizeLinkedStatus(reservation.status))
    ) {
      throw new TableStatusReferenceError();
    }
  }
}
