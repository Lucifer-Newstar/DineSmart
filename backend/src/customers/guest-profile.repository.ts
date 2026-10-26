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
