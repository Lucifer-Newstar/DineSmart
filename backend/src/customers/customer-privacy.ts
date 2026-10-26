import type { ObjectId } from "mongodb";
import {
  type BillDocument,
  COLLECTIONS,
  type NotificationDocument,
  type OrderDocument,
  type OrderItemDocument,
  type ReservationDocument,
  type RestaurantDocument,
} from "../database/schema.js";
import { contactPreferencesOf, MongoCustomerAccountRepository } from "./customer-account.js";

/**
 * Data export and account erasure for customers (S5-02). The export holds the
 * customer's own profile, bookings, orders, bills and notifications; restaurant
 * staff notes about the guest are the restaurant's records and are not included.
 */

export const EXPORT_LIST_LIMIT = 5_000;

export interface AccountExport {
  exportedAt: string;
  account: {
    name: string;
    email: string;
    signInMethod: string;
    createdAt: string;
    contactPreferences: Record<string, boolean>;
  };
  reservations: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  bills: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
}

function iso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

export class MongoCustomerPrivacyRepository extends MongoCustomerAccountRepository {
  async exportData(userId: ObjectId, now: Date): Promise<AccountExport> {
    const { user, customerId, customer } = await this.owner(userId, now);
    const reservations = await this.db
      .collection<ReservationDocument>(COLLECTIONS.reservations)
      .find({ customerId })
      .sort({ startAt: -1 })
      .limit(EXPORT_LIST_LIMIT)
      .toArray();
    const orders = await this.db
      .collection<OrderDocument>(COLLECTIONS.orders)
      .find({ customerId })
      .sort({ createdAt: -1 })
      .limit(EXPORT_LIST_LIMIT)
      .toArray();
    const orderIds = orders.map((order) => order._id);
    const [items, bills, notifications] = await Promise.all([
      this.db
        .collection<OrderItemDocument>(COLLECTIONS.orderItems)
        .find({ orderId: { $in: orderIds } })
        .toArray(),
      this.db
        .collection<BillDocument>(COLLECTIONS.bills)
        .find({ orderId: { $in: orderIds } })
        .toArray(),
      this.db
        .collection<NotificationDocument>(COLLECTIONS.notifications)
        .find({ recipientUserId: userId })
        .sort({ createdAt: -1 })
        .limit(EXPORT_LIST_LIMIT)
        .toArray(),
    ]);
    const restaurantIds = [
      ...new Map(
        [...reservations, ...orders].map((entry) => [
          entry.restaurantId.toHexString(),
          entry.restaurantId,
        ]),
      ).values(),
    ];
    const restaurants = await this.db
      .collection<RestaurantDocument>(COLLECTIONS.restaurants)
      .find({ _id: { $in: restaurantIds } }, { projection: { name: 1 } })
      .toArray();
    const restaurantName = (id: ObjectId) =>
      restaurants.find((restaurant) => restaurant._id.equals(id))?.name ?? null;

    return {
      exportedAt: now.toISOString(),
      account: {
        name: user.name,
        email: user.email,
        signInMethod: user.authProvider ?? (user.passwordHash ? "email" : "google"),
        createdAt: user.createdAt.toISOString(),
        contactPreferences: contactPreferencesOf(customer.contactPreferences),
      },
      reservations: reservations.map((reservation) => ({
        id: reservation._id.toHexString(),
        restaurant: restaurantName(reservation.restaurantId),
        partySize: reservation.partySize,
        startAt: reservation.startAt.toISOString(),
        endAt: reservation.endAt.toISOString(),
        status: reservation.status,
        notes: reservation.notes ?? null,
        occasion: reservation.occasion ?? null,
        dietaryNotes: reservation.dietaryNotes ?? null,
        createdAt: reservation.createdAt.toISOString(),
      })),
      orders: orders.map((order) => ({
        id: order._id.toHexString(),
        restaurant: restaurantName(order.restaurantId),
        status: order.status,
        totalMinor: order.totalMinor,
        currency: order.currency,
        createdAt: order.createdAt.toISOString(),
        items: items
          .filter((item) => item.orderId.equals(order._id))
          .map((item) => ({
            name: item.nameSnapshot,
            quantity: item.quantity,
            unitPriceMinor: item.unitPriceMinor,
            options: item.options ?? [],
            notes: item.notes ?? null,
          })),
      })),
      bills: bills.map((bill) => ({
        orderId: bill.orderId.toHexString(),
        lineItems: bill.lineItems,
        subtotalMinor: bill.subtotalMinor,
        taxMinor: bill.taxMinor,
        adjustmentsMinor: bill.adjustmentsMinor,
        totalMinor: bill.totalMinor,
        currency: bill.currency,
        status: bill.status,
        createdAt: bill.createdAt.toISOString(),
      })),
      notifications: notifications.map((notification) => ({
        type: notification.type,
        title: notification.title,
        body: notification.body,
        createdAt: notification.createdAt.toISOString(),
        readAt: iso(notification.readAt),
      })),
    };
  }
}
