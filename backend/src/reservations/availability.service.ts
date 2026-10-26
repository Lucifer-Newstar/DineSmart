import type { ObjectId } from "mongodb";
import { suggestTable, type TableSuggestion } from "../tables/table-assignment.js";
import { type BookingRules, resolveBookingRules, turnTimeMinutes } from "./booking-rules.js";
import type { ReservationSlotGuard } from "./reservation.types.js";

/**
 * Open booking slots for one day and party size (S5-01).
 *
 * Pure: every input arrives as data, so the rules are testable with a fixed clock
 * and no database. A slot is open when some bookable table that seats the party
 * has no overlapping booking for the party's whole turn time. Bookings that are
 * not yet assigned to a table still need one, so they are placed greedily (largest
 * party first, smallest table that fits) before the new party is considered.
 */

export const AVAILABILITY_SLOT_MINUTES = 30;
const MINUTE_MS = 60_000;
const UNBOOKABLE_TABLE_STATUSES = new Set(["disabled", "out_of_service", "out-of-service"]);

export interface AvailabilityTable {
  id: string;
  capacity: number;
  status: string;
  tableNumber?: string;
  zone?: string;
  accessible?: boolean;
}

export interface AvailabilityBooking {
  tableId: string | null;
  partySize: number;
  startAt: Date;
  endAt: Date;
}

export interface AvailabilityInput {
  /** Local calendar date in the restaurant's time zone, as YYYY-MM-DD. */
  date: string;
  partySize: number;
  timeZone: string;
  operatingHours?: Record<string, unknown>;
  rules: BookingRules;
  tables: readonly AvailabilityTable[];
  /** Active (not cancelled, not no-show) bookings that may overlap the day. */
  bookings: readonly AvailabilityBooking[];
  now: Date;
  slotMinutes?: number;
}

export type SlotUnavailableReason = "past" | "too_soon" | "too_far" | "no_table" | "pacing";

export const PACING_WINDOW_MINUTES = 15;

export interface AvailabilitySlot {
  startAt: Date;
  endAt: Date;
  /** Wall-clock start in the restaurant's time zone, as HH:MM. */
  localTime: string;
  available: boolean;
  reason?: SlotUnavailableReason;
}

export class AvailabilityInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvailabilityInputError";
  }
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WALL_CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parses YYYY-MM-DD and rejects impossible dates such as 2026-02-30. */
export function parseLocalDate(
  value: unknown,
): { year: number; month: number; day: number } | null {
  if (typeof value !== "string") return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function wallClockMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = WALL_CLOCK_PATTERN.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Offset of `timeZone` from UTC at `date`, in milliseconds (positive east of UTC). */
export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a wall-clock time on a local date in `timeZone` to a UTC instant. */
export function zonedTimeToUtc(date: string, minutesAfterMidnight: number, timeZone: string): Date {
  const parsed = parseLocalDate(date);
  if (!parsed) throw new AvailabilityInputError("A valid YYYY-MM-DD date is required.");
  const naive =
    Date.UTC(parsed.year, parsed.month - 1, parsed.day) + minutesAfterMidnight * MINUTE_MS;
  const firstGuess = naive - timeZoneOffsetMs(new Date(naive), timeZone);
  // A second pass settles the offset when the first guess crossed a DST change.
  return new Date(naive - timeZoneOffsetMs(new Date(firstGuess), timeZone));
}

/** The restaurant-local calendar date of an instant, as YYYY-MM-DD. */
export function localDateOf(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function formatWallClock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  return `${String(hour).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function overlaps(booking: AvailabilityBooking, startAt: Date, endAt: Date): boolean {
  return booking.startAt < endAt && booking.endAt > startAt;
}

/**
 * Tables still free for [startAt, endAt) after placing every overlapping booking.
 * Exported for the table suggestion and tests.
 */
export function freeTablesFor(
  tables: readonly AvailabilityTable[],
  bookings: readonly AvailabilityBooking[],
  startAt: Date,
  endAt: Date,
): AvailabilityTable[] {
  const bookable = tables.filter(
    (table) => !UNBOOKABLE_TABLE_STATUSES.has(table.status.trim().toLowerCase()),
  );
  const overlapping = bookings.filter((booking) => overlaps(booking, startAt, endAt));
  const taken = new Set(
    overlapping.flatMap((booking) => (booking.tableId === null ? [] : [booking.tableId])),
  );
  const free = bookable
    .filter((table) => !taken.has(table.id))
    .sort((left, right) => left.capacity - right.capacity || left.id.localeCompare(right.id));
  const unassigned = overlapping
    .filter((booking) => booking.tableId === null)
    .sort((left, right) => right.partySize - left.partySize);
  for (const booking of unassigned) {
    const index = free.findIndex((table) => table.capacity >= booking.partySize);
    if (index >= 0) free.splice(index, 1);
  }
  return free;
}

/** Covers already booked to start inside the 15-minute pacing window that holds `startAt`. */
export function coversInPacingWindow(
  bookings: readonly AvailabilityBooking[],
  startAt: Date,
): number {
  const windowMs = PACING_WINDOW_MINUTES * MINUTE_MS;
  const windowStart = Math.floor(startAt.getTime() / windowMs) * windowMs;
  return bookings
    .filter((booking) => {
      const time = booking.startAt.getTime();
      return time >= windowStart && time < windowStart + windowMs;
    })
    .reduce((total, booking) => total + booking.partySize, 0);
}

/** True when the party would push its pacing window over the restaurant's cover cap. */
export function exceedsPacing(
  rules: BookingRules,
  bookings: readonly AvailabilityBooking[],
  startAt: Date,
  partySize: number,
): boolean {
  return coversInPacingWindow(bookings, startAt) + partySize > rules.pacingCoversPer15Min;
}

export function computeAvailability(input: AvailabilityInput): AvailabilitySlot[] {
  if (!parseLocalDate(input.date)) {
    throw new AvailabilityInputError("A valid YYYY-MM-DD date is required.");
  }
  if (!Number.isInteger(input.partySize) || input.partySize < 1) {
    throw new AvailabilityInputError("Party size must be a positive whole number.");
  }
  const slotMinutes = input.slotMinutes ?? AVAILABILITY_SLOT_MINUTES;
  const opensAt = wallClockMinutes(input.operatingHours?.opensAt) ?? 0;
  const closesAt = wallClockMinutes(input.operatingHours?.closesAt) ?? 24 * 60;
  const turnMinutes = turnTimeMinutes(input.rules, input.partySize);

  const slots: AvailabilitySlot[] = [];
  const firstSlot = Math.ceil(opensAt / slotMinutes) * slotMinutes;
  for (let minute = firstSlot; minute + turnMinutes <= closesAt; minute += slotMinutes) {
    const startAt = zonedTimeToUtc(input.date, minute, input.timeZone);
    const endAt = new Date(startAt.getTime() + turnMinutes * MINUTE_MS);
    const slot: AvailabilitySlot = {
      startAt,
      endAt,
      localTime: formatWallClock(minute),
      available: true,
    };
    const aheadMs = startAt.getTime() - input.now.getTime();
    if (startAt <= input.now) {
      slot.available = false;
      slot.reason = "past";
    } else if (aheadMs < input.rules.minLeadMinutes * MINUTE_MS) {
      slot.available = false;
      slot.reason = "too_soon";
    } else if (aheadMs > input.rules.maxAdvanceDays * 24 * 60 * MINUTE_MS) {
      slot.available = false;
      slot.reason = "too_far";
    } else if (exceedsPacing(input.rules, input.bookings, startAt, input.partySize)) {
      slot.available = false;
      slot.reason = "pacing";
    } else if (
      !freeTablesFor(input.tables, input.bookings, startAt, endAt).some(
        (table) => table.capacity >= input.partySize,
      )
    ) {
      slot.available = false;
      slot.reason = "no_table";
    }
    slots.push(slot);
  }
  return slots;
}

export interface AvailabilityRestaurant {
  timeZone: string;
  operatingHours?: Record<string, unknown>;
  bookingRules?: unknown;
}

export interface AvailabilityRepository {
  getActiveRestaurant(restaurantId: ObjectId): Promise<AvailabilityRestaurant | null>;
  listTables(restaurantId: ObjectId): Promise<AvailabilityTable[]>;
  /** Active bookings overlapping [from, to), optionally ignoring one reservation. */
  listActiveBookings(
    restaurantId: ObjectId,
    from: Date,
    to: Date,
    excludingReservationId?: ObjectId,
  ): Promise<AvailabilityBooking[]>;
  findBooking?(
    restaurantId: ObjectId,
    reservationId: ObjectId,
  ): Promise<{ partySize: number; startAt: Date; endAt: Date } | null>;
}

export interface AvailabilityQuery {
  restaurantId: ObjectId;
  date: string;
  partySize: number;
  /** A booking being moved does not block its own new time. */
  excludingReservationId?: ObjectId;
}

export interface DayAvailability {
  date: string;
  partySize: number;
  timeZone: string;
  turnMinutes: number;
  slots: AvailabilitySlot[];
}

export interface TableSuggestionQuery {
  restaurantId: ObjectId;
  reservationId: ObjectId;
  needsAccessible: boolean;
}

export interface AvailabilityReader {
  getDay(query: AvailabilityQuery): Promise<DayAvailability>;
  /** Null when no free table or same-zone pair can seat the party. */
  suggestTable?(query: TableSuggestionQuery): Promise<TableSuggestion | null>;
}

export class BookingNotFoundError extends Error {
  constructor() {
    super("The reservation was not found.");
    this.name = "BookingNotFoundError";
  }
}

export class AvailabilityNotFoundError extends Error {
  constructor() {
    super("The restaurant was not found.");
    this.name = "AvailabilityNotFoundError";
  }
}

const DAY_MS = 24 * 60 * MINUTE_MS;

/** Loads one day's tables and bookings and runs the pure slot computation. */
export class ReservationAvailabilityService implements AvailabilityReader {
  constructor(
    private readonly repository: AvailabilityRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async getDay(query: AvailabilityQuery): Promise<DayAvailability> {
    const restaurant = await this.repository.getActiveRestaurant(query.restaurantId);
    if (!restaurant) throw new AvailabilityNotFoundError();
    const rules = resolveBookingRules(restaurant.bookingRules);
    const dayStart = zonedTimeToUtc(query.date, 0, restaurant.timeZone);
    // Bookings from the evening before can still hold a table into this day.
    const [tables, bookings] = await Promise.all([
      this.repository.listTables(query.restaurantId),
      this.repository.listActiveBookings(
        query.restaurantId,
        new Date(dayStart.getTime() - DAY_MS),
        new Date(dayStart.getTime() + 2 * DAY_MS),
        query.excludingReservationId,
      ),
    ]);
    return {
      date: query.date,
      partySize: query.partySize,
      timeZone: restaurant.timeZone,
      turnMinutes: turnTimeMinutes(rules, query.partySize),
      slots: computeAvailability({
        date: query.date,
        partySize: query.partySize,
        timeZone: restaurant.timeZone,
        ...(restaurant.operatingHours ? { operatingHours: restaurant.operatingHours } : {}),
        rules,
        tables,
        bookings,
        now: this.clock(),
      }),
    };
  }

  async suggestTable(query: TableSuggestionQuery): Promise<TableSuggestion | null> {
    const booking = await this.repository.findBooking?.(query.restaurantId, query.reservationId);
    if (!booking) throw new BookingNotFoundError();
    const [tables, bookings] = await Promise.all([
      this.repository.listTables(query.restaurantId),
      this.repository.listActiveBookings(
        query.restaurantId,
        booking.startAt,
        booking.endAt,
        query.reservationId,
      ),
    ]);
    const free = new Set(
      freeTablesFor(tables, bookings, booking.startAt, booking.endAt).map((table) => table.id),
    );
    const held = new Set(tables.filter((table) => !free.has(table.id)).map((table) => table.id));
    return suggestTable(
      tables.map((table) => ({
        id: table.id,
        tableNumber: table.tableNumber ?? table.id,
        capacity: table.capacity,
        status: table.status,
        ...(table.zone ? { zone: table.zone } : {}),
        ...(table.accessible ? { accessible: true } : {}),
      })),
      booking.partySize,
      held,
      {
        needsAccessible: query.needsAccessible,
        // Within half an hour of the start, a table still in use cannot be offered.
        skipOccupied: booking.startAt.getTime() - this.clock().getTime() <= 30 * MINUTE_MS,
      },
    );
  }
}

/** Builds the create/change guard: some bookable table must stay free for the whole turn. */
export function createSlotGuard(repository: AvailabilityRepository): ReservationSlotGuard {
  return async ({ restaurantId, partySize, startAt, endAt, excludingReservationId }) => {
    const windowMs = PACING_WINDOW_MINUTES * MINUTE_MS;
    const pacingStart = new Date(Math.floor(startAt.getTime() / windowMs) * windowMs);
    // Read from the pacing window's start so bookings that begin earlier in it count.
    const from = pacingStart < startAt ? pacingStart : startAt;
    const [restaurant, tables, bookings] = await Promise.all([
      repository.getActiveRestaurant(restaurantId),
      repository.listTables(restaurantId),
      repository.listActiveBookings(restaurantId, from, endAt, excludingReservationId),
    ]);
    const rules = resolveBookingRules(restaurant?.bookingRules);
    if (exceedsPacing(rules, bookings, startAt, partySize)) return false;
    return freeTablesFor(tables, bookings, startAt, endAt).some(
      (table) => table.capacity >= partySize,
    );
  };
}
