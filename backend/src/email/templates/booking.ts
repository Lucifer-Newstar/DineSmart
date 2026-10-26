import type { EmailMessage } from "../email-transport.js";
import { buildIcs } from "./calendar.js";

/** Booking emails (S5-04). Times are shown in the restaurant's time zone. */

export interface BookingEmailDetails {
  reservationId: string;
  guestName: string;
  email: string;
  restaurantName: string;
  restaurantAddress?: string;
  timeZone: string;
  partySize: number;
  startAt: Date;
  endAt: Date;
  tableNumber?: string;
}

export function formatVisitTime(startAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(startAt);
}

function guests(count: number): string {
  return `${count} ${count === 1 ? "guest" : "guests"}`;
}

/** The calendar UID stays the same for a booking, so updates replace the entry. */
export function bookingCalendarUid(reservationId: string): string {
  return `reservation-${reservationId}@dinesmart`;
}

export function bookingCalendarFile(
  details: BookingEmailDetails,
  stamp: Date,
  status: "CONFIRMED" | "CANCELLED" = "CONFIRMED",
) {
  return {
    filename: "dinesmart-booking.ics",
    contentType: "text/calendar; charset=utf-8",
    content: buildIcs({
      uid: bookingCalendarUid(details.reservationId),
      start: details.startAt,
      end: details.endAt,
      summary: `Table at ${details.restaurantName}`,
      ...(details.restaurantAddress ? { location: details.restaurantAddress } : {}),
      description: `Booking for ${guests(details.partySize)}. Booking reference ${details.reservationId.slice(-6).toUpperCase()}.`,
      // Seconds since 2026 keep the sequence increasing with each update.
      sequence: Math.max(0, Math.floor((stamp.getTime() - Date.UTC(2026, 0, 1)) / 1_000)),
      status,
      stamp,
    }),
  };
}

export function bookingConfirmedEmail(details: BookingEmailDetails, now: Date): EmailMessage {
  const when = formatVisitTime(details.startAt, details.timeZone);
  return {
    to: details.email,
    subject: `Your table at ${details.restaurantName} is confirmed`,
    text: [
      `Hi ${details.guestName},`,
      `Your table for ${guests(details.partySize)} at ${details.restaurantName} is confirmed for ${when}.`,
      ...(details.tableNumber ? [`Table: ${details.tableNumber}`] : []),
      ...(details.restaurantAddress ? [`Address: ${details.restaurantAddress}`] : []),
      "The attached calendar file adds the booking to your calendar.",
      "To change or cancel, open My bookings in DineSmart.",
    ].join("\n\n"),
    attachments: [bookingCalendarFile(details, now)],
  };
}

export function bookingReminderEmail(details: BookingEmailDetails): EmailMessage {
  const when = formatVisitTime(details.startAt, details.timeZone);
  return {
    to: details.email,
    subject: `Reminder: your table at ${details.restaurantName}`,
    text: [
      `Hi ${details.guestName},`,
      `This is a reminder of your table for ${guests(details.partySize)} at ${details.restaurantName} on ${when}.`,
      ...(details.restaurantAddress ? [`Address: ${details.restaurantAddress}`] : []),
      "If your plans have changed, please change or cancel in My bookings so the table can go to someone else.",
    ].join("\n\n"),
  };
}
