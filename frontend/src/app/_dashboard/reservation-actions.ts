/** Which buttons a booking row offers, by status (S5-01). Mirrors the API's transitions. */

export type ReservationActionStatus = "Confirmed" | "Arrived" | "Seated" | "Completed" | "NoShow";

export interface ReservationAction {
  label: string;
  next: ReservationActionStatus;
}

/** The API refuses a no-show until 15 minutes after the booked time. */
export const NO_SHOW_GRACE_MS = 15 * 60_000;

export function reservationActions(
  reservation: { status: string; startAt?: string },
  now: Date,
): ReservationAction[] {
  const start = reservation.startAt ? Date.parse(reservation.startAt) : Number.NaN;
  const pastGrace = Number.isFinite(start) && now.getTime() >= start + NO_SHOW_GRACE_MS;
  switch (reservation.status) {
    case "Awaiting":
      return [
        { label: "Confirm", next: "Confirmed" },
        { label: "Mark arrived", next: "Arrived" },
      ];
    case "Confirmed":
      return [
        { label: "Mark arrived", next: "Arrived" },
        { label: "Seat guest", next: "Seated" },
        ...(pastGrace ? [{ label: "No-show", next: "NoShow" as const }] : []),
      ];
    case "Arrived":
      return [{ label: "Seat guest", next: "Seated" }];
    case "Seated":
      return [{ label: "Complete", next: "Completed" }];
    default:
      return [];
  }
}

export interface TableSuggestionView {
  kind: "single" | "combined";
  tables: Array<{ id: string; tableNumber: string }>;
}

export function parseTableSuggestion(payload: unknown): TableSuggestionView | null {
  if (typeof payload !== "object" || payload === null) return null;
  const suggestion = (payload as { suggestion?: unknown }).suggestion;
  if (typeof suggestion !== "object" || suggestion === null) return null;
  const record = suggestion as Record<string, unknown>;
  if ((record.kind !== "single" && record.kind !== "combined") || !Array.isArray(record.tables)) {
    return null;
  }
  const tables = record.tables.flatMap((table) => {
    if (typeof table !== "object" || table === null) return [];
    const { id, tableNumber } = table as Record<string, unknown>;
    return typeof id === "string" && typeof tableNumber === "string" ? [{ id, tableNumber }] : [];
  });
  return tables.length > 0 ? { kind: record.kind, tables } : null;
}
