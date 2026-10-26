import { type BookingRules, turnTimeMinutes } from "./booking-rules.js";

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

export type SlotUnavailableReason = "past" | "no_table";

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
    if (startAt <= input.now) {
      slot.available = false;
      slot.reason = "past";
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
