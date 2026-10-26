import type { Db, ObjectId } from "mongodb";
import {
  COLLECTIONS,
  type RestaurantDocument,
  type TableDocument,
  type WaitlistDocument,
} from "../database/schema.js";
import {
  type BookingRules,
  resolveBookingRules,
  turnTimeMinutes,
} from "../reservations/booking-rules.js";

/**
 * Walk-in wait quotes from the current floor and turn times (S5-01).
 *
 * Each table that seats the party frees up when its current party's turn ends
 * (occupied since + the turn time for a party of the table's size). Parties ahead
 * in the queue take the earliest tables they fit, one after another, and the new
 * party gets the first table left after them. The quote is rounded up to five
 * minutes and capped, because a long quote is a guess, not a promise.
 */

export const WAIT_QUOTE_STEP_MINUTES = 5;
export const WAIT_QUOTE_CAP_MINUTES = 120;
const MINUTE_MS = 60_000;
const UNSEATABLE = new Set(["disabled", "out_of_service", "out-of-service"]);

export interface WaitTable {
  capacity: number;
  status: string;
  /** When the current party sat down; only meaningful for occupied tables. */
  occupiedSince?: Date;
}

export interface WaitEstimateInput {
  partySize: number;
  /** Party sizes ahead in the queue, oldest first. */
  partiesAhead: readonly number[];
  tables: readonly WaitTable[];
  rules: BookingRules;
  now: Date;
}

function roundQuote(minutes: number): number {
  if (minutes <= 0) return 0;
  const rounded = Math.ceil(minutes / WAIT_QUOTE_STEP_MINUTES) * WAIT_QUOTE_STEP_MINUTES;
  return Math.min(rounded, WAIT_QUOTE_CAP_MINUTES);
}

/** Minutes until the party is likely seated; 0 when a fitting table is free now. */
export function estimateWaitMinutes(input: WaitEstimateInput): number {
  const now = input.now.getTime();
  // Free-at time (ms) for every seatable table, as a mutable timeline.
  const timeline = input.tables
    .filter((table) => !UNSEATABLE.has(table.status.trim().toLowerCase()))
    .map((table) => {
      if (table.status !== "occupied") return { capacity: table.capacity, freeAt: now };
      const turn = turnTimeMinutes(input.rules, table.capacity) * MINUTE_MS;
      const since = table.occupiedSince?.getTime();
      const freeAt = since === undefined || !Number.isFinite(since) ? now + turn / 2 : since + turn;
      // A party that has overstayed is about to leave; never quote the past.
      return { capacity: table.capacity, freeAt: Math.max(freeAt, now) };
    });

  const take = (partySize: number): number | null => {
    let best = -1;
    for (let index = 0; index < timeline.length; index += 1) {
      const table = timeline[index];
      if (table.capacity < partySize) continue;
      if (
        best < 0 ||
        table.freeAt < timeline[best].freeAt ||
        (table.freeAt === timeline[best].freeAt && table.capacity < timeline[best].capacity)
      ) {
        best = index;
      }
    }
    if (best < 0) return null;
    const seatedAt = timeline[best].freeAt;
    timeline[best].freeAt = seatedAt + turnTimeMinutes(input.rules, partySize) * MINUTE_MS;
    return seatedAt;
  };

  for (const party of input.partiesAhead) take(party);
  const seatedAt = take(input.partySize);
  if (seatedAt === null) return WAIT_QUOTE_CAP_MINUTES;
  return roundQuote((seatedAt - now) / MINUTE_MS);
}

export interface WaitQuoteRepository {
  getBookingRules(restaurantId: ObjectId): Promise<{ found: boolean; rules?: unknown }>;
  listTables(restaurantId: ObjectId): Promise<WaitTable[]>;
  listWaiting(restaurantId: ObjectId): Promise<Array<{ id: ObjectId; partySize: number }>>;
}

export interface WaitQuoter {
  /** Quote for a party joining the back of the queue now; null for an unknown restaurant. */
  quoteNewParty(restaurantId: ObjectId, partySize: number): Promise<number | null>;
  /** Quote for every waiting entry, keyed by entry ID. */
  quoteQueue(restaurantId: ObjectId): Promise<Map<string, number>>;
}

export class WaitQuoteService implements WaitQuoter {
  constructor(
    private readonly repository: WaitQuoteRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async quoteNewParty(restaurantId: ObjectId, partySize: number): Promise<number | null> {
    const [restaurant, tables, waiting] = await Promise.all([
      this.repository.getBookingRules(restaurantId),
      this.repository.listTables(restaurantId),
      this.repository.listWaiting(restaurantId),
    ]);
    if (!restaurant.found) return null;
    return estimateWaitMinutes({
      partySize,
      partiesAhead: waiting.map((entry) => entry.partySize),
      tables,
      rules: resolveBookingRules(restaurant.rules),
      now: this.clock(),
    });
  }

  async quoteQueue(restaurantId: ObjectId): Promise<Map<string, number>> {
    const [restaurant, tables, waiting] = await Promise.all([
      this.repository.getBookingRules(restaurantId),
      this.repository.listTables(restaurantId),
      this.repository.listWaiting(restaurantId),
    ]);
    const rules = resolveBookingRules(restaurant.rules);
    const now = this.clock();
    const quotes = new Map<string, number>();
    waiting.forEach((entry, index) => {
      quotes.set(
        entry.id.toHexString(),
        estimateWaitMinutes({
          partySize: entry.partySize,
          partiesAhead: waiting.slice(0, index).map((ahead) => ahead.partySize),
          tables,
          rules,
          now,
        }),
      );
    });
    return quotes;
  }
}

const WAIT_QUOTE_RECORD_LIMIT = 200;

export class MongoWaitQuoteRepository implements WaitQuoteRepository {
  private readonly restaurants;
  private readonly tables;
  private readonly waitlist;

  constructor(db: Db) {
    this.restaurants = db.collection<RestaurantDocument>(COLLECTIONS.restaurants);
    this.tables = db.collection<TableDocument>(COLLECTIONS.tables);
    this.waitlist = db.collection<WaitlistDocument>(COLLECTIONS.waitlist);
  }

  async getBookingRules(restaurantId: ObjectId): Promise<{ found: boolean; rules?: unknown }> {
    const restaurant = await this.restaurants.findOne(
      { _id: restaurantId, status: "active" },
      { projection: { bookingRules: 1 } },
    );
    if (!restaurant) return { found: false };
    return { found: true, ...(restaurant.bookingRules ? { rules: restaurant.bookingRules } : {}) };
  }

  async listTables(restaurantId: ObjectId): Promise<WaitTable[]> {
    const tables = await this.tables
      .find({ restaurantId }, { projection: { capacity: 1, status: 1, updatedAt: 1 } })
      .limit(WAIT_QUOTE_RECORD_LIMIT)
      .toArray();
    return tables.map((table) => ({
      capacity: table.capacity,
      status: table.status,
      ...(table.status === "occupied" ? { occupiedSince: table.updatedAt } : {}),
    }));
  }

  async listWaiting(restaurantId: ObjectId): Promise<Array<{ id: ObjectId; partySize: number }>> {
    const entries = await this.waitlist
      .find({ restaurantId, status: "waiting" }, { projection: { partySize: 1 } })
      .sort({ createdAt: 1, _id: 1 })
      .limit(WAIT_QUOTE_RECORD_LIMIT)
      .toArray();
    return entries.map((entry) => ({ id: entry._id, partySize: entry.partySize }));
  }
}
