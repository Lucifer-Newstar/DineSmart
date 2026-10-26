/** Parsing and grouping for the customer's My bookings page (S5-01). */

export interface CustomerBooking {
  id: string;
  restaurantId: string;
  restaurantName: string;
  partySize: number;
  startAt: string;
  endAt: string;
  status: string;
  tableNumber: string | null;
  notes?: string;
  occasion?: string;
  dietaryNotes?: string;
}

const OBJECT_ID = /^[a-f\d]{24}$/i;
const CHANGEABLE = new Set(["Awaiting", "Confirmed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function parseBooking(value: unknown): CustomerBooking | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    !OBJECT_ID.test(value.id) ||
    typeof value.restaurantId !== "string" ||
    typeof value.partySize !== "number" ||
    typeof value.startAt !== "string" ||
    !Number.isFinite(Date.parse(value.startAt)) ||
    typeof value.endAt !== "string" ||
    typeof value.status !== "string"
  ) {
    return null;
  }
  const notes = optionalText(value.notes);
  const occasion = optionalText(value.occasion);
  const dietaryNotes = optionalText(value.dietaryNotes);
  return {
    id: value.id,
    restaurantId: value.restaurantId,
    restaurantName: typeof value.restaurantName === "string" ? value.restaurantName : "Restaurant",
    partySize: value.partySize,
    startAt: value.startAt,
    endAt: value.endAt,
    status: value.status,
    tableNumber: typeof value.tableNumber === "string" ? value.tableNumber : null,
    ...(notes ? { notes } : {}),
    ...(occasion ? { occasion } : {}),
    ...(dietaryNotes ? { dietaryNotes } : {}),
  };
}

export function parseBookingList(payload: unknown): CustomerBooking[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.reservations)) return null;
  return payload.reservations
    .map(parseBooking)
    .filter((booking): booking is CustomerBooking => booking !== null);
}

/**
 * Upcoming: still ahead and not cancelled or a no-show, soonest first.
 * Past: everything else, most recent first.
 */
export function groupBookings(
  bookings: readonly CustomerBooking[],
  now: Date,
): { upcoming: CustomerBooking[]; past: CustomerBooking[] } {
  const upcoming: CustomerBooking[] = [];
  const past: CustomerBooking[] = [];
  for (const booking of bookings) {
    const ahead = Date.parse(booking.startAt) > now.getTime();
    if (ahead && booking.status !== "Cancelled" && booking.status !== "NoShow") {
      upcoming.push(booking);
    } else {
      past.push(booking);
    }
  }
  upcoming.sort((left, right) => left.startAt.localeCompare(right.startAt));
  past.sort((left, right) => right.startAt.localeCompare(left.startAt));
  return { upcoming, past };
}

/** The server applies the restaurant's cutoff; this only hides controls that cannot work. */
export function canChangeBooking(booking: CustomerBooking, now: Date): boolean {
  return CHANGEABLE.has(booking.status) && Date.parse(booking.startAt) > now.getTime();
}

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  Awaiting: "Awaiting confirmation",
  Confirmed: "Confirmed",
  Arrived: "Arrived",
  Seated: "Seated",
  Completed: "Completed",
  Cancelled: "Cancelled",
  NoShow: "Missed",
};

export function bookingStatusLabel(status: string): string {
  return BOOKING_STATUS_LABELS[status] ?? status;
}

/** Restaurant-local date (YYYY-MM-DD) and time (HH:MM) of an instant. */
export function localParts(instant: string, timeZone: string): { date: string; time: string } {
  const date = new Date(instant);
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return { date: day, time };
}
