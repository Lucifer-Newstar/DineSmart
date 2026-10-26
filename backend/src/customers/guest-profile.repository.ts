import type { Db, ObjectId } from "mongodb";
import { COLLECTIONS, type GuestProfileDocument } from "../database/schema.js";

/**
 * Per-restaurant guest profiles (S5-02). One customer account can visit many
 * restaurants; each restaurant keeps its own visit history, tags and staff note,
 * and never sees another restaurant's.
 */

export const GUEST_TAGS = [
  "VIP",
  "regular",
  "allergy",
  "accessibility",
  "family",
  "business",
] as const;
export type GuestTag = (typeof GUEST_TAGS)[number];
export const GUEST_NOTE_MAX_LENGTH = 500;

export type GuestOutcome = "visit" | "no_show";

export interface GuestProfileSummary {
  visitCount: number;
  noShowCount: number;
  lastVisitAt: Date | null;
  tags: GuestTag[];
  staffNote: string | null;
}

export const EMPTY_GUEST_PROFILE: Readonly<GuestProfileSummary> = Object.freeze({
  visitCount: 0,
  noShowCount: 0,
  lastVisitAt: null,
  tags: [],
  staffNote: null,
});

const TAGS = new Set<string>(GUEST_TAGS);

export function toGuestSummary(document: GuestProfileDocument | null): GuestProfileSummary {
  if (!document) return { ...EMPTY_GUEST_PROFILE, tags: [] };
  return {
    visitCount: document.visitCount ?? 0,
    noShowCount: document.noShowCount ?? 0,
    lastVisitAt: document.lastVisitAt ?? null,
    tags: (document.tags ?? []).filter((tag): tag is GuestTag => TAGS.has(tag)),
    staffNote: document.staffNote ?? null,
  };
}

export class MongoGuestProfileRepository {
  private readonly profiles;

  constructor(db: Db) {
    this.profiles = db.collection<GuestProfileDocument>(COLLECTIONS.guestProfiles);
  }

  /** Counts a seated visit or a no-show; creates the profile on first contact. */
  async recordOutcome(
    restaurantId: ObjectId,
    customerId: ObjectId,
    outcome: GuestOutcome,
    at: Date,
  ): Promise<void> {
    await this.profiles.updateOne(
      { restaurantId, customerId },
      {
        $inc: outcome === "visit" ? { visitCount: 1 } : { noShowCount: 1 },
        ...(outcome === "visit" ? { $max: { lastVisitAt: at } } : {}),
        $set: { updatedAt: at },
        $setOnInsert: {
          restaurantId,
          customerId,
          tags: [],
          createdAt: at,
          ...(outcome === "visit" ? { noShowCount: 0 } : { visitCount: 0 }),
        },
      },
      { upsert: true },
    );
  }

  async getMany(
    restaurantId: ObjectId,
    customerIds: readonly ObjectId[],
  ): Promise<Map<string, GuestProfileSummary>> {
    if (customerIds.length === 0) return new Map();
    const documents = await this.profiles
      .find({ restaurantId, customerId: { $in: [...customerIds] } })
      .toArray();
    return new Map(
      documents.map((document) => [document.customerId.toHexString(), toGuestSummary(document)]),
    );
  }
}

export interface GuestProfileChanges {
  tags?: GuestTag[];
  staffNote?: string | null;
}

export interface GuestProfileStore {
  /** True when the customer has a booking or an order at this restaurant. */
  isGuestOf(restaurantId: ObjectId, customerId: ObjectId): Promise<boolean>;
  get(restaurantId: ObjectId, customerId: ObjectId): Promise<GuestProfileSummary>;
  update(
    restaurantId: ObjectId,
    customerId: ObjectId,
    changes: GuestProfileChanges,
    now: Date,
  ): Promise<GuestProfileSummary>;
}

export class MongoGuestProfileStore implements GuestProfileStore {
  private readonly profiles;
  private readonly reservations;
  private readonly orders;

  constructor(db: Db) {
    this.profiles = db.collection<GuestProfileDocument>(COLLECTIONS.guestProfiles);
    this.reservations = db.collection(COLLECTIONS.reservations);
    this.orders = db.collection(COLLECTIONS.orders);
  }

  async isGuestOf(restaurantId: ObjectId, customerId: ObjectId): Promise<boolean> {
    const [booking, order] = await Promise.all([
      this.reservations.findOne({ restaurantId, customerId }, { projection: { _id: 1 } }),
      this.orders.findOne({ restaurantId, customerId }, { projection: { _id: 1 } }),
    ]);
    return booking !== null || order !== null;
  }

  async get(restaurantId: ObjectId, customerId: ObjectId): Promise<GuestProfileSummary> {
    return toGuestSummary(await this.profiles.findOne({ restaurantId, customerId }));
  }

  async update(
    restaurantId: ObjectId,
    customerId: ObjectId,
    changes: GuestProfileChanges,
    now: Date,
  ): Promise<GuestProfileSummary> {
    const set: Record<string, unknown> = { updatedAt: now };
    const unset: Record<string, ""> = {};
    if (changes.tags !== undefined) set.tags = changes.tags;
    if (changes.staffNote === null) unset.staffNote = "";
    else if (changes.staffNote !== undefined) set.staffNote = changes.staffNote;
    const updated = await this.profiles.findOneAndUpdate(
      { restaurantId, customerId },
      {
        $set: set,
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
        $setOnInsert: {
          restaurantId,
          customerId,
          visitCount: 0,
          noShowCount: 0,
          ...(changes.tags === undefined ? { tags: [] } : {}),
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after", includeResultMetadata: false },
    );
    return toGuestSummary(updated);
  }
}

/** Validates a staff edit: known tags only, no repeats, and a bounded note. Null clears the note. */
export function parseGuestProfileChanges(value: unknown): GuestProfileChanges | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "tags" && key !== "staffNote")) return null;
  const changes: GuestProfileChanges = {};
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.some((tag) => !TAGS.has(tag as string))) return null;
    changes.tags = [...new Set(body.tags as GuestTag[])];
  }
  if (body.staffNote !== undefined) {
    if (body.staffNote === null) changes.staffNote = null;
    else if (typeof body.staffNote !== "string") return null;
    else {
      const note = body.staffNote.trim();
      if (note.length > GUEST_NOTE_MAX_LENGTH) return null;
      changes.staffNote = note || null;
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export function guestSummaryToJson(summary: GuestProfileSummary) {
  return {
    visitCount: summary.visitCount,
    noShowCount: summary.noShowCount,
    lastVisitAt: summary.lastVisitAt?.toISOString() ?? null,
    tags: summary.tags,
    staffNote: summary.staffNote,
  };
}
