/** Parsing and selection rules for the booking page's time slots (S5-01). */

export interface BookingSlot {
  startAt: string;
  endAt: string;
  localTime: string;
  available: boolean;
  reason?: string;
}

export interface DayAvailability {
  date: string;
  partySize: number;
  turnMinutes: number;
  slots: BookingSlot[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const WALL_CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseSlot(value: unknown): BookingSlot | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.startAt !== "string" ||
    !Number.isFinite(Date.parse(value.startAt)) ||
    typeof value.endAt !== "string" ||
    !Number.isFinite(Date.parse(value.endAt)) ||
    typeof value.localTime !== "string" ||
    !WALL_CLOCK.test(value.localTime) ||
    typeof value.available !== "boolean"
  ) {
    return null;
  }
  return {
    startAt: value.startAt,
    endAt: value.endAt,
    localTime: value.localTime,
    available: value.available,
    ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
  };
}

/** Reads GET /reservations/availability; malformed slots are dropped, a bad payload is null. */
export function parseAvailability(payload: unknown): DayAvailability | null {
  if (!isRecord(payload) || !Array.isArray(payload.slots)) return null;
  if (
    typeof payload.date !== "string" ||
    typeof payload.partySize !== "number" ||
    typeof payload.turnMinutes !== "number"
  ) {
    return null;
  }
  return {
    date: payload.date,
    partySize: payload.partySize,
    turnMinutes: payload.turnMinutes,
    slots: payload.slots
      .map(parseSlot)
      .filter((slot): slot is BookingSlot => slot !== null)
      .sort((left, right) => left.localTime.localeCompare(right.localTime)),
  };
}

export function openSlots(day: DayAvailability | null): BookingSlot[] {
  return day ? day.slots.filter((slot) => slot.available) : [];
}

/**
 * Keeps the guest's choice while it is still open; otherwise moves to the nearest
 * open slot after it, then the latest one before it. Null when the day is full.
 */
export function reconcileSelection(day: DayAvailability | null, selected: string): string | null {
  const open = openSlots(day);
  if (open.length === 0) return null;
  if (open.some((slot) => slot.localTime === selected)) return selected;
  const later = open.find((slot) => slot.localTime > selected);
  return (later ?? open[open.length - 1]).localTime;
}

/** True when the day has no open slot, so the page offers the walk-in waitlist instead. */
export function shouldOfferWaitlist(day: DayAvailability | null): boolean {
  return day !== null && openSlots(day).length === 0;
}

export function slotLabel(slot: BookingSlot): string {
  if (slot.available) return "Open";
  if (slot.reason === "past") return "Passed";
  if (slot.reason === "pacing") return "Fully booked";
  return "No table";
}

export function formatSlotTime(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "pm" : "am";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
