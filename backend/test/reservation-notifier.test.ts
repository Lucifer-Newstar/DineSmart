import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import type { EmailMessage } from "../src/email/email-transport.js";
import {
  bookingCancelledEmail,
  bookingChangedEmail,
  bookingConfirmedEmail,
  formatVisitTime,
} from "../src/email/templates/booking.js";
import { buildIcs, escapeIcsText, foldIcsLine, icsDate } from "../src/email/templates/calendar.js";
import type { NewNotification } from "../src/notifications/notification.types.js";
import {
  createReservationNotifier,
  noticeFor,
  type ReservationChange,
  type ReservationContact,
} from "../src/notifications/reservation-notifier.js";
import type { ReservationRecord } from "../src/reservations/reservation.types.js";

const restaurantId = new ObjectId();
const reservationId = new ObjectId();
const userId = new ObjectId();
const now = new Date("2026-10-26T08:00:00.000Z");
// 7:30 pm in India is 14:00 UTC.
const startAt = new Date("2026-10-28T14:00:00.000Z");
const endAt = new Date("2026-10-28T15:30:00.000Z");

const record = (status: string): ReservationRecord => ({
  id: reservationId,
  restaurantId,
  restaurantName: "Saffron & Co.",
  guestName: "Ananya Menon",
  partySize: 4,
  startAt,
  endAt,
  tableId: null,
  tableNumber: null,
  status,
  createdAt: now,
  updatedAt: now,
});

const contact: ReservationContact = {
  reservationId: reservationId.toHexString(),
  userId,
  email: "ananya@example.test",
  bookingEmails: true,
  guestName: "Ananya Menon",
  restaurantName: "Saffron & Co.",
  restaurantAddress: "12 Lake Road, Chennai",
  timeZone: "Asia/Kolkata",
  partySize: 4,
  startAt,
  endAt,
  tableNumber: "02",
};

test("the confirmation shows the visit in the restaurant's time zone and attaches a calendar file", () => {
  const email = bookingConfirmedEmail({ ...contact, email: "ananya@example.test" }, now);
  assert.equal(email.subject, "Your table at Saffron & Co. is confirmed");
  assert.match(
    email.text,
    /4 guests at Saffron & Co\. is confirmed for Wednesday, 28 October 2026/,
  );
  assert.match(email.text, /7:30\s?pm IST/i);
  assert.match(email.text, /Table: 02/);
  assert.equal(formatVisitTime(startAt, "Asia/Kolkata").includes("IST"), true);

  const ics = email.attachments?.[0];
  assert.equal(ics?.filename, "dinesmart-booking.ics");
  assert.match(ics?.contentType ?? "", /^text\/calendar/);
  const content = ics?.content ?? "";
  assert.ok(content.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(content.endsWith("END:VCALENDAR\r\n"));
  assert.match(content, /\r\nBEGIN:VEVENT\r\n[\s\S]*\r\nEND:VEVENT\r\n/);
  assert.match(content, /\r\nDTSTART:20261028T140000Z\r\n/);
  assert.match(content, /\r\nDTEND:20261028T153000Z\r\n/);
  assert.match(
    content,
    new RegExp(`\\r\\nUID:reservation-${reservationId.toHexString()}@dinesmart\\r\\n`),
  );
  assert.match(content, /\r\nLOCATION:12 Lake Road\\, Chennai\r\n/);
  // Every line ends in CRLF and none is longer than 75 octets.
  for (const line of content.split("\r\n").slice(0, -1)) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, line);
    assert.equal(line.includes("\n"), false);
  }
});

test("calendar text is escaped and long lines are folded", () => {
  assert.equal(escapeIcsText("a;b,c\\d\ne"), "a\\;b\\,c\\\\d\\ne");
  assert.equal(icsDate(new Date("2026-01-02T03:04:05.678Z")), "20260102T030405Z");
  const folded = foldIcsLine(`DESCRIPTION:${"ಅ".repeat(40)}`);
  for (const line of folded.split("\r\n")) assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), `DESCRIPTION:${"ಅ".repeat(40)}`);
  const cancelled = buildIcs({
    uid: "x@dinesmart",
    start: startAt,
    end: endAt,
    summary: "Table",
    status: "CANCELLED",
    stamp: now,
  });
  assert.match(cancelled, /METHOD:CANCEL\r\n/);
  assert.match(cancelled, /STATUS:CANCELLED\r\n/);
});

test("only a staff confirmation counts as a confirmation notice", () => {
  assert.equal(
    noticeFor({ previous: record("Awaiting"), updated: record("Confirmed"), actor: "staff" }),
    "confirmed",
  );
  assert.equal(
    noticeFor({ previous: null, updated: record("Confirmed"), actor: "staff" }),
    "confirmed",
  );
  assert.equal(noticeFor({ previous: null, updated: record("Awaiting"), actor: "staff" }), null);
  assert.equal(
    noticeFor({ previous: record("Confirmed"), updated: record("Confirmed"), actor: "staff" }),
    null,
  );
  assert.equal(
    noticeFor({ previous: record("Awaiting"), updated: record("Confirmed"), actor: "customer" }),
    null,
  );
});

test("staff cancellations and moves are notices; seating and guest edits are not", () => {
  const later = { ...record("Confirmed"), startAt: new Date("2026-10-28T15:00:00.000Z") };
  const bigger = { ...record("Awaiting"), partySize: 6 };
  assert.equal(
    noticeFor({ previous: record("Confirmed"), updated: record("Cancelled"), actor: "staff" }),
    "cancelled",
  );
  assert.equal(
    noticeFor({ previous: record("Cancelled"), updated: record("Cancelled"), actor: "staff" }),
    null,
  );
  assert.equal(
    noticeFor({ previous: record("Confirmed"), updated: later, actor: "staff" }),
    "changed",
  );
  assert.equal(
    noticeFor({ previous: record("Awaiting"), updated: bigger, actor: "staff" }),
    "changed",
  );
  assert.equal(
    noticeFor({ previous: record("Confirmed"), updated: later, actor: "customer" }),
    null,
  );
  assert.equal(
    noticeFor({ previous: record("Confirmed"), updated: record("Seated"), actor: "staff" }),
    null,
  );
  assert.equal(
    noticeFor({ previous: record("Confirmed"), updated: record("NoShow"), actor: "staff" }),
    null,
  );
});

test("change and cancellation emails carry the right calendar file", () => {
  const details = { ...contact, email: "ananya@example.test" };
  const changed = bookingChangedEmail(details, "Confirmed", now);
  assert.equal(changed.subject, "Your booking at Saffron & Co. has changed");
  assert.match(changed.text, /It is now for 4 guests on Wednesday, 28 October 2026/);
  assert.match(changed.attachments?.[0]?.content ?? "", /STATUS:CONFIRMED\r\n/);
  assert.equal(bookingChangedEmail(details, "Awaiting", now).attachments, undefined);

  const cancelled = bookingCancelledEmail(details, now);
  assert.equal(cancelled.subject, "Your booking at Saffron & Co. was cancelled");
  assert.match(cancelled.attachments?.[0]?.content ?? "", /STATUS:CANCELLED\r\n/);
  assert.ok(cancelled.html?.includes("has cancelled your booking"));
});

async function run(
  found: ReservationContact | null,
  failEmail = false,
  change: ReservationChange = {
    previous: record("Awaiting"),
    updated: record("Confirmed"),
    actor: "staff",
  },
) {
  const emails: EmailMessage[] = [];
  const notifications: NewNotification[] = [];
  const errors: unknown[] = [];
  const notify = createReservationNotifier({
    contacts: { find: async () => found },
    sendEmail: async (message) => {
      if (failEmail) throw new Error("smtp down");
      emails.push(message);
    },
    createNotification: async (notification) => notifications.push(notification),
    clock: () => now,
    onError: (error) => errors.push(error),
  });
  notify(change);
  await new Promise((resolve) => setTimeout(resolve, 10));
  return { emails, notifications, errors };
}

test("a confirmation sends one email and one in-app notice to the guest", async () => {
  const { emails, notifications, errors } = await run(contact);
  assert.equal(emails.length, 1);
  assert.equal(emails[0]?.to, "ananya@example.test");
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.type, "reservation.confirmed");
  assert.ok(notifications[0]?.recipientUserId.equals(userId));
  assert.deepEqual(errors, []);
});

test("guests who turned booking emails off get only the in-app notice", async () => {
  const { emails, notifications } = await run({ ...contact, bookingEmails: false });
  assert.equal(emails.length, 0);
  assert.equal(notifications.length, 1);
});

test("a failed email is reported but the in-app notice still goes out", async () => {
  const { notifications, errors } = await run(contact, true);
  assert.equal(notifications.length, 1);
  assert.equal(errors.length, 1);
  const missing = await run(null);
  assert.equal(missing.notifications.length + missing.emails.length, 0);
});

test("a staff cancellation reaches the guest in the app and by email", async () => {
  const { emails, notifications } = await run(contact, false, {
    previous: record("Confirmed"),
    updated: record("Cancelled"),
    actor: "staff",
  });
  assert.deepEqual(
    notifications.map((notice) => notice.type),
    ["reservation.cancelled"],
  );
  assert.match(notifications[0]?.title ?? "", /was cancelled$/);
  assert.equal(emails[0]?.subject, "Your booking at Saffron & Co. was cancelled");
});
