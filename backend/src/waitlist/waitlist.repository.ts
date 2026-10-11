import type { Db, ObjectId, WithId } from "mongodb";
import { ObjectId as MongoObjectId } from "mongodb";
import { COLLECTIONS, type TableDocument, type WaitlistDocument } from "../database/schema.js";
import {
  WAITLIST_LIST_LIMIT,
  type WaitlistCreateInput,
  type WaitlistListResult,
  type WaitlistRecord,
  type WaitlistRepository,
  type WaitlistResolution,
} from "./waitlist.types.js";

export class WaitlistEntryConflictError extends Error {
  constructor() {
    super("The waitlist entry changed before it could be resolved.");
    this.name = "WaitlistEntryConflictError";
  }
}

export class WaitlistTableNotFoundError extends Error {
  constructor() {
    super("The requested table does not exist in this restaurant.");
    this.name = "WaitlistTableNotFoundError";
  }
}

export class WaitlistTableUnavailableError extends Error {
  constructor() {
    super("The table is not available for this party.");
    this.name = "WaitlistTableUnavailableError";
  }
}

export class WaitlistSynchronizationError extends Error {
  constructor() {
    super("The table assignment could not be synchronized with the waitlist entry.");
    this.name = "WaitlistSynchronizationError";
  }
}

function toRecord(document: WithId<WaitlistDocument>): WaitlistRecord {
  return {
    id: document._id,
    restaurantId: document.restaurantId,
    guestName: document.guestName,
    partySize: document.partySize,
    ...(document.phone === undefined ? {} : { phone: document.phone }),
    ...(document.notes === undefined ? {} : { notes: document.notes }),
    status: document.status,
    ...(document.tableId === undefined ? {} : { tableId: document.tableId }),
    ...(document.seatedAt === undefined ? {} : { seatedAt: document.seatedAt }),
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

export class MongoWaitlistRepository implements WaitlistRepository {
  private readonly waitlist;
  private readonly tables;

  constructor(db: Db) {
    this.waitlist = db.collection<WaitlistDocument>(COLLECTIONS.waitlist);
    this.tables = db.collection<TableDocument>(COLLECTIONS.tables);
  }

  async listWaitingForRestaurant(restaurantId: ObjectId): Promise<WaitlistListResult> {
    const documents = await this.waitlist
      .find({ restaurantId, status: "waiting" })
      .sort({ createdAt: 1, _id: 1 })
      .limit(WAITLIST_LIST_LIMIT + 1)
      .toArray();
    return {
      entries: documents.slice(0, WAITLIST_LIST_LIMIT).map((document) => toRecord(document)),
      truncated: documents.length > WAITLIST_LIST_LIMIT,
    };
  }

  async addForRestaurant(
    restaurantId: ObjectId,
    input: WaitlistCreateInput,
    now: Date,
  ): Promise<WaitlistRecord> {
    const document: WithId<WaitlistDocument> = {
      _id: new MongoObjectId(),
      restaurantId,
      guestName: input.guestName,
      partySize: input.partySize,
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      status: "waiting",
      createdAt: now,
      updatedAt: now,
    };
    await this.waitlist.insertOne(document);
    return toRecord(document);
  }

  async resolveWaitingForRestaurant(
    restaurantId: ObjectId,
    entryId: ObjectId,
    resolution: WaitlistResolution,
    now: Date,
  ): Promise<WaitlistRecord | null> {
    const current = await this.waitlist.findOne({ _id: entryId, restaurantId });
    if (!current?._id) return null;
    if (current.status !== "waiting") throw new WaitlistEntryConflictError();

    if (resolution.status !== "seated") {
      const updated = await this.waitlist.findOneAndUpdate(
        {
          _id: entryId,
          restaurantId,
          status: "waiting",
          updatedAt: current.updatedAt,
        },
        { $set: { status: resolution.status, updatedAt: now } },
        { returnDocument: "after", includeResultMetadata: false },
      );
      if (updated?._id) return toRecord(updated);
      return this.resolveConflictOrMissing(restaurantId, entryId);
    }

    const tableId = resolution.tableId;
    if (!tableId) throw new WaitlistTableNotFoundError();
    const table = await this.tables.findOneAndUpdate(
      {
        _id: tableId,
        restaurantId,
        status: "available",
        capacity: { $gte: current.partySize },
        currentReservationId: null,
        currentOrderId: null,
        currentWaitlistId: null,
      },
      {
        $set: {
          status: "occupied",
          currentWaitlistId: entryId,
          updatedAt: now,
        },
      },
      {
        returnDocument: "after",
        includeResultMetadata: false,
        projection: { _id: 1 },
      },
    );
    if (!table?._id) {
      const sameRestaurantTable = await this.tables.findOne({ _id: tableId, restaurantId });
      if (!sameRestaurantTable?._id) throw new WaitlistTableNotFoundError();
      throw new WaitlistTableUnavailableError();
    }

    let updatedEntry: WithId<WaitlistDocument> | null;
    try {
      updatedEntry = await this.waitlist.findOneAndUpdate(
        {
          _id: entryId,
          restaurantId,
          status: "waiting",
          updatedAt: current.updatedAt,
        },
        {
          $set: {
            status: "seated",
            tableId,
            seatedAt: now,
            updatedAt: now,
          },
        },
        { returnDocument: "after", includeResultMetadata: false },
      );
    } catch {
      const observed = await this.readAfterUncertainUpdate(restaurantId, entryId);
      if (observed?.status === "seated" && observed.tableId?.equals(tableId)) {
        return toRecord(observed);
      }
      await this.releaseTableOrThrow(restaurantId, tableId, entryId, now);
      throw new WaitlistSynchronizationError();
    }

    if (updatedEntry?._id) return toRecord(updatedEntry);

    const observed = await this.waitlist.findOne({ _id: entryId, restaurantId });
    if (observed?.status === "seated" && observed.tableId?.equals(tableId)) {
      return toRecord(observed);
    }
    await this.releaseTableOrThrow(restaurantId, tableId, entryId, now);
    if (!observed?._id) return null;
    throw new WaitlistEntryConflictError();
  }

  private async resolveConflictOrMissing(restaurantId: ObjectId, entryId: ObjectId): Promise<null> {
    const current = await this.waitlist.findOne({ _id: entryId, restaurantId });
    if (!current?._id) return null;
    throw new WaitlistEntryConflictError();
  }

  private async readAfterUncertainUpdate(
    restaurantId: ObjectId,
    entryId: ObjectId,
  ): Promise<WithId<WaitlistDocument> | null> {
    try {
      return await this.waitlist.findOne({ _id: entryId, restaurantId });
    } catch {
      // Do not release a potentially seated table if the write outcome cannot be read back.
      throw new WaitlistSynchronizationError();
    }
  }

  private async releaseTableOrThrow(
    restaurantId: ObjectId,
    tableId: ObjectId,
    entryId: ObjectId,
    now: Date,
  ): Promise<void> {
    try {
      const released = await this.tables.updateOne(
        {
          _id: tableId,
          restaurantId,
          status: "occupied",
          currentWaitlistId: entryId,
          currentReservationId: null,
          currentOrderId: null,
        },
        {
          $set: { status: "available", updatedAt: now },
          $unset: { currentWaitlistId: "" },
        },
      );
      if (released.matchedCount !== 1) throw new Error("Conditional table rollback did not match.");
    } catch {
      throw new WaitlistSynchronizationError();
    }
  }
}
