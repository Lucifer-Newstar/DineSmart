import type { EmailMessage } from "../email-transport.js";
import { buildIcs } from "./calendar.js";
import { composeEmail } from "./layout.js";

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
  return composeEmail({
    to: details.email,
    subject: `Your table at ${details.restaurantName} is confirmed`,
    blocks: [
      `Hi ${details.guestName},`,
      `Your table for ${guests(details.partySize)} at ${details.restaurantName} is confirmed for ${when}.`,
      ...(details.tableNumber ? [{ label: "Table", value: details.tableNumber }] : []),
      ...(details.restaurantAddress
        ? [{ label: "Address", value: details.restaurantAddress }]
        : []),
      "The attached calendar file adds the booking to your calendar.",
      "To change or cancel, open My bookings in DineSmart.",
    ],
    attachments: [bookingCalendarFile(details, now)],
  });
}

export function bookingReminderEmail(details: BookingEmailDetails): EmailMessage {
  const when = formatVisitTime(details.startAt, details.timeZone);
  return composeEmail({
    to: details.email,
    subject: `Reminder: your table at ${details.restaurantName}`,
    blocks: [
      `Hi ${details.guestName},`,
      `This is a reminder of your table for ${guests(details.partySize)} at ${details.restaurantName} on ${when}.`,
      ...(details.restaurantAddress
        ? [{ label: "Address", value: details.restaurantAddress }]
        : []),
      "If your plans have changed, please change or cancel in My bookings so the table can go to someone else.",
    ],
  });
}

/** Staff moved the time or changed the party size; a confirmed booking gets an updated calendar file. */
export function bookingChangedEmail(
  details: BookingEmailDetails,
  status: string,
  now: Date,
): EmailMessage {
  const when = formatVisitTime(details.startAt, details.timeZone);
  const confirmed = status === "Confirmed";
  return composeEmail({
    to: details.email,
    subject: `Your booking at ${details.restaurantName} has changed`,
    blocks: [
      `Hi ${details.guestName},`,
      `${details.restaurantName} has updated your booking. It is now for ${guests(details.partySize)} on ${when}.`,
      ...(details.tableNumber ? [{ label: "Table", value: details.tableNumber }] : []),
      ...(details.restaurantAddress
        ? [{ label: "Address", value: details.restaurantAddress }]
        : []),
      confirmed
        ? "The attached calendar file replaces the earlier one in your calendar."
        : "The booking is waiting for the restaurant to confirm it.",
      "If the new time does not suit you, change or cancel it in My bookings.",
    ],
    ...(confirmed ? { attachments: [bookingCalendarFile(details, now)] } : {}),
  });
}

/** Staff cancelled the booking; the calendar file removes it from the guest's calendar. */
export function bookingCancelledEmail(details: BookingEmailDetails, now: Date): EmailMessage {
  const when = formatVisitTime(details.startAt, details.timeZone);
  return composeEmail({
    to: details.email,
    subject: `Your booking at ${details.restaurantName} was cancelled`,
    blocks: [
      `Hi ${details.guestName},`,
      `${details.restaurantName} has cancelled your booking for ${guests(details.partySize)} on ${when}.`,
      "Please contact the restaurant if you did not expect this. You can book again from DineSmart.",
      "The attached calendar file removes the booking from your calendar.",
    ],
    attachments: [bookingCalendarFile(details, now, "CANCELLED")],
  });
}
