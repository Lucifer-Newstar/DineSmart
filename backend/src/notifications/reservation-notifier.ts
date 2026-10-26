import type { Db, ObjectId } from "mongodb";
import {
  COLLECTIONS,
  type CustomerDocument,
  type ReservationDocument,
  type RestaurantDocument,
  type TableDocument,
  type UserDocument,
} from "../database/schema.js";
import type { EmailMessage } from "../email/email-transport.js";
import {
  type BookingEmailDetails,
  bookingCancelledEmail,
  bookingChangedEmail,
  bookingConfirmedEmail,
} from "../email/templates/booking.js";
import type { ReservationRecord } from "../reservations/reservation.types.js";
import type { NewNotification } from "./notification.types.js";

/**
 * Tells guests about staff decisions on their bookings (S5-04, FR-4): a
 * confirmation, a change of time or party size, or a cancellation. Each one is
 * an in-app notification and, when the guest allows booking emails, an email.
 */

export type ReservationChangeActor = "staff" | "customer";

export interface ReservationChange {
  previous: ReservationRecord | null;
  updated: ReservationRecord;
  actor: ReservationChangeActor;
}

export type ReservationChangeNotifier = (change: ReservationChange) => void;

export type ReservationNotice = "confirmed" | "changed" | "cancelled";

const CHANGE_NOTICE_STATUSES = new Set(["Awaiting", "Confirmed"]);

/** Which guest-facing notice a change deserves, if any. Guests are not told about their own edits. */
export function noticeFor(change: ReservationChange): ReservationNotice | null {
  if (change.actor !== "staff") return null;
  const { previous, updated } = change;
  if (updated.status === "Cancelled") {
    return previous && previous.status !== "Cancelled" ? "cancelled" : null;
  }
  if (updated.status === "Confirmed" && previous?.status !== "Confirmed") return "confirmed";
  if (
    previous &&
    CHANGE_NOTICE_STATUSES.has(updated.status) &&
    (previous.startAt.getTime() !== updated.startAt.getTime() ||
      previous.partySize !== updated.partySize)
  ) {
    return "changed";
  }
  return null;
}

export interface ReservationContact extends Omit<BookingEmailDetails, "email"> {
  userId: ObjectId | null;
  email: string | null;
  bookingEmails: boolean;
}

export interface ReservationContactLookup {
  find(restaurantId: ObjectId, reservationId: ObjectId): Promise<ReservationContact | null>;
}

export interface ReservationNotifierDependencies {
  contacts: ReservationContactLookup;
  sendEmail: (message: EmailMessage) => Promise<void>;
  createNotification: (notification: NewNotification) => Promise<unknown>;
  clock?: () => Date;
  onError?: (error: unknown) => void;
}

function inAppNotice(
  notice: ReservationNotice,
  contact: ReservationContact,
  reservation: ReservationRecord,
) {
  const when = new Intl.DateTimeFormat("en-IN", {
    timeZone: contact.timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(reservation.startAt);
  const party = `${reservation.partySize} ${reservation.partySize === 1 ? "guest" : "guests"}`;
  if (notice === "cancelled") {
    return {
      type: "reservation.cancelled",
      title: `Your booking at ${contact.restaurantName} was cancelled`,
      body: `${party} on ${when}. Please contact the restaurant if you did not expect this.`,
    };
  }
  if (notice === "changed") {
    return {
      type: "reservation.changed",
      title: `Your booking at ${contact.restaurantName} has changed`,
      body: `It is now for ${party} on ${when}.`,
    };
  }
  return {
    type: "reservation.confirmed",
    title: `Your table at ${contact.restaurantName} is confirmed`,
    body: `${party} on ${when}.`,
  };
}

function emailFor(
  notice: ReservationNotice,
  contact: ReservationContact,
  reservation: ReservationRecord,
  now: Date,
): EmailMessage | null {
  if (!contact.email || !contact.bookingEmails) return null;
  const details = { ...contact, email: contact.email };
  if (notice === "cancelled") return bookingCancelledEmail(details, now);
  if (notice === "changed") return bookingChangedEmail(details, reservation.status, now);
  return bookingConfirmedEmail(details, now);
}

/** Runs in the background: a failed email or notification never fails the staff action. */
export function createReservationNotifier(
  deps: ReservationNotifierDependencies,
): ReservationChangeNotifier {
  const clock = deps.clock ?? (() => new Date());
  const onError = deps.onError ?? (() => undefined);
  return (change) => {
    const notice = noticeFor(change);
    if (!notice) return;
    void (async () => {
      const contact = await deps.contacts.find(change.updated.restaurantId, change.updated.id);
      if (!contact) return;
      const now = clock();
      const tasks: Promise<unknown>[] = [];
      if (contact.userId) {
        tasks.push(
          deps.createNotification({
            restaurantId: change.updated.restaurantId,
            recipientUserId: contact.userId,
            ...inAppNotice(notice, contact, change.updated),
            relatedEntity: { type: "reservation", id: change.updated.id },
          }),
        );
      }
      const email = emailFor(notice, contact, change.updated, now);
      if (email) tasks.push(deps.sendEmail(email));
      const results = await Promise.allSettled(tasks);
      for (const result of results) if (result.status === "rejected") onError(result.reason);
    })().catch(onError);
  };
}

export class MongoReservationContactLookup implements ReservationContactLookup {
  constructor(private readonly db: Db) {}

  async find(restaurantId: ObjectId, reservationId: ObjectId): Promise<ReservationContact | null> {
    const reservation = await this.db
      .collection<ReservationDocument>(COLLECTIONS.reservations)
      .findOne({ _id: reservationId, restaurantId });
    if (!reservation) return null;
    const [customer, restaurant, table] = await Promise.all([
      this.db
        .collection<CustomerDocument>(COLLECTIONS.customers)
        .findOne({ _id: reservation.customerId }),
      this.db
        .collection<RestaurantDocument>(COLLECTIONS.restaurants)
        .findOne({ _id: restaurantId }),
      reservation.tableId
        ? this.db
            .collection<TableDocument>(COLLECTIONS.tables)
            .findOne({ _id: reservation.tableId, restaurantId }, { projection: { tableNumber: 1 } })
        : Promise.resolve(null),
    ]);
    if (!customer || !restaurant) return null;
    const user = customer.userId
      ? await this.db
          .collection<UserDocument>(COLLECTIONS.users)
          .findOne({ _id: customer.userId, status: "active" }, { projection: { email: 1 } })
      : null;
    const address = restaurant.address
      ? Object.values(restaurant.address).filter(Boolean).join(", ")
      : "";
    return {
      reservationId: reservation._id.toHexString(),
      userId: user ? user._id : null,
      email: user?.email ?? customer.email ?? null,
      bookingEmails: customer.contactPreferences?.email !== false,
      guestName: customer.displayName,
      restaurantName: restaurant.name,
      ...(address ? { restaurantAddress: address } : {}),
      timeZone: restaurant.timezone || "Asia/Kolkata",
      partySize: reservation.partySize,
      startAt: reservation.startAt,
      endAt: reservation.endAt,
      ...(table ? { tableNumber: table.tableNumber } : {}),
    };
  }
}
