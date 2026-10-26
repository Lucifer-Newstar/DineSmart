import type { Db, ObjectId } from "mongodb";
import { COLLECTIONS, type ReservationDocument } from "../database/schema.js";
import type { EmailMessage } from "../email/email-transport.js";
import { bookingReminderEmail } from "../email/templates/booking.js";
import type { NewNotification } from "./notification.types.js";
import type { ReservationContactLookup } from "./reservation-notifier.js";

/**
 * Day-before booking reminders (S5-04).
 *
 * Every 15 minutes the scheduler claims confirmed bookings that start within
 * the next 24 hours and have not been reminded. Claiming sets reminderSentAt
 * in the same atomic update, so a restart or a second server never sends a
 * second reminder. Cancelled, completed and unconfirmed bookings are skipped.
 */

export const REMINDER_LEAD_MS = 24 * 60 * 60 * 1_000;
/** Bookings starting sooner than this are not reminded; the guest is nearly there. */
export const REMINDER_MIN_LEAD_MS = 60 * 60 * 1_000;
export const REMINDER_INTERVAL_MS = 15 * 60 * 1_000;
export const REMINDER_BATCH_LIMIT = 100;

export interface DueReminder {
  restaurantId: ObjectId;
  reservationId: ObjectId;
}

export interface ReminderStore {
  /** Atomically marks and returns up to `limit` bookings that are due a reminder. */
  claimDue(now: Date, limit: number): Promise<DueReminder[]>;
}

export class MongoReminderStore implements ReminderStore {
  constructor(private readonly db: Db) {}

  async claimDue(now: Date, limit: number): Promise<DueReminder[]> {
    const reservations = this.db.collection<ReservationDocument>(COLLECTIONS.reservations);
    const claimed: DueReminder[] = [];
    for (let index = 0; index < limit; index += 1) {
      const next = await reservations.findOneAndUpdate(
        {
          status: "Confirmed",
          startAt: {
            $gt: new Date(now.getTime() + REMINDER_MIN_LEAD_MS),
            $lte: new Date(now.getTime() + REMINDER_LEAD_MS),
          },
          reminderSentAt: { $exists: false },
        },
        { $set: { reminderSentAt: now } },
        { sort: { startAt: 1 }, projection: { restaurantId: 1 }, includeResultMetadata: false },
      );
      if (!next) break;
      claimed.push({ restaurantId: next.restaurantId, reservationId: next._id });
    }
    return claimed;
  }
}

export interface ReminderDependencies {
  store: ReminderStore;
  contacts: ReservationContactLookup;
  sendEmail: (message: EmailMessage) => Promise<void>;
  createNotification: (notification: NewNotification) => Promise<unknown>;
  clock?: () => Date;
  onError?: (error: unknown) => void;
}

/** One pass: claims due bookings and reminds each guest. Returns how many were claimed. */
export async function sendDueReminders(deps: ReminderDependencies): Promise<number> {
  const now = (deps.clock ?? (() => new Date()))();
  const onError = deps.onError ?? (() => undefined);
  const due = await deps.store.claimDue(now, REMINDER_BATCH_LIMIT);
  for (const reminder of due) {
    try {
      const contact = await deps.contacts.find(reminder.restaurantId, reminder.reservationId);
      if (!contact) continue;
      const tasks: Promise<unknown>[] = [];
      if (contact.userId) {
        const when = new Intl.DateTimeFormat("en-IN", {
          timeZone: contact.timeZone,
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        }).format(contact.startAt);
        tasks.push(
          deps.createNotification({
            restaurantId: reminder.restaurantId,
            recipientUserId: contact.userId,
            type: "reservation.reminder",
            title: `See you soon at ${contact.restaurantName}`,
            body: `Your table for ${contact.partySize} is booked for ${when}.`,
            relatedEntity: { type: "reservation", id: reminder.reservationId },
          }),
        );
      }
      if (contact.email && contact.bookingEmails) {
        tasks.push(deps.sendEmail(bookingReminderEmail({ ...contact, email: contact.email })));
      }
      const results = await Promise.allSettled(tasks);
      for (const result of results) if (result.status === "rejected") onError(result.reason);
    } catch (error) {
      onError(error);
    }
  }
  return due.length;
}

/** Runs sendDueReminders on a fixed interval; the timer never keeps the process alive. */
export class ReminderScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly createDependencies: () => Promise<ReminderDependencies>,
    private readonly intervalMs = REMINDER_INTERVAL_MS,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  /** Runs once now, then on every interval. Overlapping runs are skipped. */
  async start(): Promise<number> {
    if (!this.timer) {
      this.timer = setInterval(() => void this.runOnce().catch(this.onError), this.intervalMs);
      this.timer.unref();
    }
    return this.runOnce();
  }

  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await sendDueReminders(await this.createDependencies());
    } finally {
      this.running = false;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
