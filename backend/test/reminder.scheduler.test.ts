import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import type { EmailMessage } from "../src/email/email-transport.js";
import type { NewNotification } from "../src/notifications/notification.types.js";
import {
  type DueReminder,
  MongoReminderStore,
  REMINDER_LEAD_MS,
  REMINDER_MIN_LEAD_MS,
  ReminderScheduler,
  type ReminderStore,
  sendDueReminders,
} from "../src/notifications/reminder.scheduler.js";
import type { ReservationContact } from "../src/notifications/reservation-notifier.js";

const now = new Date("2026-10-27T08:00:00.000Z");
const restaurantId = new ObjectId();

/** A store that remembers claims the way reminderSentAt does in MongoDB. */
class MemoryStore implements ReminderStore {
  claimedIds = new Set<string>();
  constructor(private readonly bookings: Array<{ id: ObjectId; status: string; startAt: Date }>) {}
  async claimDue(at: Date, limit: number): Promise<DueReminder[]> {
    const due = this.bookings.filter(
      (booking) =>
        booking.status === "Confirmed" &&
        booking.startAt.getTime() > at.getTime() + REMINDER_MIN_LEAD_MS &&
        booking.startAt.getTime() <= at.getTime() + REMINDER_LEAD_MS &&
        !this.claimedIds.has(booking.id.toHexString()),
    );
    return due.slice(0, limit).map((booking) => {
      this.claimedIds.add(booking.id.toHexString());
      return { restaurantId, reservationId: booking.id };
    });
  }
}

function contactFor(id: ObjectId): ReservationContact {
  return {
    reservationId: id.toHexString(),
    userId: new ObjectId(),
    email: "guest@example.test",
    bookingEmails: true,
    guestName: "Guest",
    restaurantName: "Saffron & Co.",
    timeZone: "Asia/Kolkata",
    partySize: 2,
    startAt: new Date(now.getTime() + 20 * 3_600_000),
    endAt: new Date(now.getTime() + 21 * 3_600_000),
  };
}

const hours = (count: number) => new Date(now.getTime() + count * 3_600_000);

test("one reminder per booking, cancelled and far-off bookings skipped, and a rerun sends nothing", async () => {
  const tomorrow = new ObjectId();
  const store = new MemoryStore([
    { id: tomorrow, status: "Confirmed", startAt: hours(20) },
    { id: new ObjectId(), status: "Cancelled", startAt: hours(20) },
    { id: new ObjectId(), status: "Awaiting", startAt: hours(20) },
    { id: new ObjectId(), status: "Confirmed", startAt: hours(40) },
    { id: new ObjectId(), status: "Confirmed", startAt: hours(0.5) },
  ]);
  const emails: EmailMessage[] = [];
  const notifications: NewNotification[] = [];
  const deps = {
    store,
    contacts: { find: async (_restaurant: ObjectId, id: ObjectId) => contactFor(id) },
    sendEmail: async (message: EmailMessage) => {
      emails.push(message);
    },
    createNotification: async (notification: NewNotification) => notifications.push(notification),
    clock: () => now,
  };
  assert.equal(await sendDueReminders(deps), 1);
  assert.equal(emails.length, 1);
  assert.match(emails[0]?.subject ?? "", /^Reminder: your table at Saffron & Co\./);
  assert.equal(notifications[0]?.type, "reservation.reminder");
  assert.ok(notifications[0]?.relatedEntity?.id.equals(tomorrow));

  // A restart runs the pass again; the claim already recorded means no resend.
  assert.equal(await sendDueReminders(deps), 0);
  assert.equal(emails.length, 1);
});

test("guests who turned off booking emails get only the in-app reminder", async () => {
  const id = new ObjectId();
  const emails: EmailMessage[] = [];
  const notifications: NewNotification[] = [];
  await sendDueReminders({
    store: new MemoryStore([{ id, status: "Confirmed", startAt: hours(5) }]),
    contacts: { find: async () => ({ ...contactFor(id), bookingEmails: false }) },
    sendEmail: async (message) => {
      emails.push(message);
    },
    createNotification: async (notification) => notifications.push(notification),
    clock: () => now,
  });
  assert.equal(emails.length, 0);
  assert.equal(notifications.length, 1);
});

test("the Mongo claim filters on confirmed, unreminded bookings in the window and marks them", async () => {
  const calls: Array<{ filter: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const found = [{ _id: new ObjectId(), restaurantId }];
  const db = {
    collection: () => ({
      findOneAndUpdate: async (
        filter: Record<string, unknown>,
        update: Record<string, unknown>,
      ) => {
        calls.push({ filter, update });
        return found.shift() ?? null;
      },
    }),
  } as unknown as ConstructorParameters<typeof MongoReminderStore>[0];
  const claimed = await new MongoReminderStore(db).claimDue(now, 10);
  assert.equal(claimed.length, 1);
  assert.equal(calls.length, 2);
  const filter = calls[0]?.filter as {
    status: string;
    startAt: { $gt: Date; $lte: Date };
    reminderSentAt: { $exists: boolean };
  };
  assert.equal(filter.status, "Confirmed");
  assert.deepEqual(filter.reminderSentAt, { $exists: false });
  assert.equal(filter.startAt.$gt.getTime(), now.getTime() + REMINDER_MIN_LEAD_MS);
  assert.equal(filter.startAt.$lte.getTime(), now.getTime() + REMINDER_LEAD_MS);
  assert.deepEqual(calls[0]?.update, { $set: { reminderSentAt: now } });
});

test("overlapping scheduler runs are skipped", async () => {
  let release: () => void = () => undefined;
  let runs = 0;
  const scheduler = new ReminderScheduler(async () => ({
    store: {
      claimDue: async () => {
        runs += 1;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return [];
      },
    },
    contacts: { find: async () => null },
    sendEmail: async () => undefined,
    createNotification: async () => undefined,
  }));
  const first = scheduler.runOnce();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await scheduler.runOnce(), 0);
  release();
  await first;
  assert.equal(runs, 1);
  scheduler.stop();
});
