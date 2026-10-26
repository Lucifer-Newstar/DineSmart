/** Layout for the day timeline of bookings by table (S5-01). Pure and testable. */

export interface TimelineReservation {
  id: string;
  guest: string;
  party: number;
  table: string;
  status: string;
  startAt?: string;
  endAt?: string;
}

export interface TimelineBlock {
  id: string;
  guest: string;
  party: number;
  status: string;
  /** Offset from the timeline start and width, as percentages of the visible day. */
  leftPercent: number;
  widthPercent: number;
  label: string;
}

export interface TimelineRow {
  table: string;
  blocks: TimelineBlock[];
}

export interface TimelineWindow {
  /** Local date shown, YYYY-MM-DD. */
  date: string;
  startHour: number;
  endHour: number;
  timeZone: string;
}

const HIDDEN_STATUSES = new Set(["Cancelled", "NoShow"]);
const FALLBACK_TURN_MS = 90 * 60_000;

function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function localMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

function clockLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "pm" : "am";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** Shifts a YYYY-MM-DD date by whole days. */
export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function hourMarks(window: TimelineWindow): string[] {
  const marks: string[] = [];
  for (let hour = window.startHour; hour <= window.endHour; hour += 1) {
    marks.push(clockLabel(hour * 60));
  }
  return marks;
}

/**
 * Groups the day's active bookings into one row per table (unassigned last), and
 * positions each booking by its start and end inside the visible hours. Bookings
 * on other days, cancelled ones and no-shows are left out.
 */
export function buildTimeline(
  reservations: readonly TimelineReservation[],
  window: TimelineWindow,
): TimelineRow[] {
  const spanMinutes = (window.endHour - window.startHour) * 60;
  const rows = new Map<string, TimelineBlock[]>();
  for (const reservation of reservations) {
    if (!reservation.startAt || HIDDEN_STATUSES.has(reservation.status)) continue;
    const start = new Date(reservation.startAt);
    if (!Number.isFinite(start.getTime())) continue;
    if (localDate(start, window.timeZone) !== window.date) continue;
    const parsedEnd = reservation.endAt ? new Date(reservation.endAt) : null;
    const end =
      parsedEnd && Number.isFinite(parsedEnd.getTime()) && parsedEnd > start
        ? parsedEnd
        : new Date(start.getTime() + FALLBACK_TURN_MS);
    const startMinutes = localMinutes(start, window.timeZone);
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
    const fromStart = startMinutes - window.startHour * 60;
    const left = Math.max(0, fromStart);
    const right = Math.min(spanMinutes, fromStart + durationMinutes);
    if (right <= 0 || left >= spanMinutes) continue;
    const block: TimelineBlock = {
      id: reservation.id,
      guest: reservation.guest,
      party: reservation.party,
      status: reservation.status,
      leftPercent: (left / spanMinutes) * 100,
      widthPercent: ((right - left) / spanMinutes) * 100,
      label: `${clockLabel(startMinutes)} – ${clockLabel(startMinutes + durationMinutes)}`,
    };
    const table = reservation.table || "Unassigned";
    rows.set(table, [...(rows.get(table) ?? []), block]);
  }
  return [...rows.entries()]
    .sort(([left], [right]) => {
      if (left === "Unassigned") return 1;
      if (right === "Unassigned") return -1;
      return left.localeCompare(right, undefined, { numeric: true });
    })
    .map(([table, blocks]) => ({
      table,
      blocks: blocks.sort((left, right) => left.leftPercent - right.leftPercent),
    }));
}
