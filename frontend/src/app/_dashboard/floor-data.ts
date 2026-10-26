function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const TABLE_STATUS_LABELS: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  occupied: "Occupied",
  disabled: "Disabled",
  out_of_service: "Out of service",
};

/** Mirrors the backend transition table for PUT /tables/:id/status (S2-18). */
export const TABLE_TRANSITIONS: Record<string, string[]> = {
  available: ["reserved", "occupied", "out_of_service"],
  reserved: ["occupied", "available"],
  occupied: ["available"],
  disabled: ["available"],
  out_of_service: ["available"],
};

export interface FloorTable {
  id: string;
  tableNumber: string;
  capacity: number;
  zone?: string;
  status: string;
}

export interface WaitlistEntry {
  id: string;
  guestName: string;
  partySize: number;
  phone?: string;
  notes?: string;
  /** Minutes the API quotes until this party is likely seated (S5-01). */
  quotedWaitMinutes?: number;
  createdAt: string;
}

export function parseTables(value: unknown): FloorTable[] | null {
  if (!isRecord(value) || !Array.isArray(value.tables)) return null;
  return value.tables.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    if (typeof raw.id !== "string" || typeof raw.tableNumber !== "string") return [];
    if (typeof raw.capacity !== "number" || typeof raw.status !== "string") return [];
    return [
      {
        id: raw.id,
        tableNumber: raw.tableNumber,
        capacity: raw.capacity,
        status: raw.status,
        ...(typeof raw.zone === "string" ? { zone: raw.zone } : {}),
      },
    ];
  });
}

export function parseWaitlist(value: unknown): WaitlistEntry[] | null {
  if (!isRecord(value) || !Array.isArray(value.entries)) return null;
  return value.entries.flatMap((raw) => {
    if (!isRecord(raw)) return [];
    if (typeof raw.id !== "string" || typeof raw.guestName !== "string") return [];
    if (typeof raw.partySize !== "number" || typeof raw.createdAt !== "string") return [];
    return [
      {
        id: raw.id,
        guestName: raw.guestName,
        partySize: raw.partySize,
        createdAt: raw.createdAt,
        ...(typeof raw.phone === "string" ? { phone: raw.phone } : {}),
        ...(typeof raw.notes === "string" ? { notes: raw.notes } : {}),
        ...(typeof raw.quotedWaitMinutes === "number" && raw.quotedWaitMinutes >= 0
          ? { quotedWaitMinutes: raw.quotedWaitMinutes }
          : {}),
      },
    ];
  });
}

/** Available tables that can seat the party, smallest first. */
export function tablesForParty(tables: readonly FloorTable[], partySize: number): FloorTable[] {
  return tables
    .filter((table) => table.status === "available" && table.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity || a.tableNumber.localeCompare(b.tableNumber));
}

export function minutesWaiting(createdAt: string, now = Date.now()): number {
  const created = Date.parse(createdAt);
  return Number.isNaN(created) ? 0 : Math.max(0, Math.round((now - created) / 60_000));
}

/** Reads the quote from POST /waitlist's entry, if the API sent one. */
export function quotedWaitOf(payload: unknown): number | null {
  if (!isRecord(payload) || !isRecord(payload.entry)) return null;
  const minutes = payload.entry.quotedWaitMinutes;
  return typeof minutes === "number" && minutes >= 0 ? minutes : null;
}

/** "Ready now", "About 25 min", or "Over 2 hours" for the cap. */
export function formatQuotedWait(minutes: number, capMinutes = 120): string {
  if (minutes <= 0) return "Table ready now";
  if (minutes >= capMinutes) return "Over 2 hours";
  return `About ${minutes} min`;
}
