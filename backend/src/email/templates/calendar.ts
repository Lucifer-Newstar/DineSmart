/**
 * iCalendar (RFC 5545) files for booking emails (S5-04).
 *
 * Times are written in UTC with a trailing Z, which every calendar app reads
 * and shows in the viewer's own time zone. Lines end in CRLF and are folded
 * at 75 octets, and text values are escaped as the RFC requires.
 */

export interface CalendarEvent {
  /** Stable across updates so a changed booking replaces the old entry. */
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  location?: string;
  description?: string;
  /** Raised on every change; calendar apps keep the highest sequence. */
  sequence?: number;
  /** CANCELLED removes the entry from the guest's calendar. */
  status?: "CONFIRMED" | "CANCELLED";
  stamp: Date;
}

const PRODUCT_ID = "-//DineSmart//Reservations//EN";

export function icsDate(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Folds a content line so no physical line exceeds 75 octets (RFC 5545 §3.1). */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char, "utf8");
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(event: CalendarEvent): string {
  const status = event.status ?? "CONFIRMED";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODUCT_ID}`,
    "CALSCALE:GREGORIAN",
    `METHOD:${status === "CANCELLED" ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${icsDate(event.stamp)}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `STATUS:${status}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
