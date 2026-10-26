import type { Db, ObjectId } from "mongodb";
import {
  COLLECTIONS,
  type CustomerDocument,
  type OrderDocument,
  type TableDocument,
} from "../database/schema.js";
import type { NewNotification } from "./notification.types.js";

/**
 * "Your order is ready" notices (S5-04). When an order reaches Ready, the
 * customer who placed it gets an in-app notification. The claim on the order
 * (readyNotifiedAt) makes sure it goes out once, however many times the Ready
 * status is published.
 */

export interface ReadyOrder {
  orderId: ObjectId;
  restaurantId: ObjectId;
  /** Short reference shown to guests and staff, for example "#A1B2C3". */
  label: string;
  customerUserId: ObjectId | null;
  /** Dine-in orders from a table QR link. */
  tableNumber?: string;
}

export interface OrderReadyStore {
  /** Marks a Ready order as notified; null when it is not Ready or was already claimed. */
  claimReady(restaurantId: ObjectId, orderId: ObjectId, now: Date): Promise<ReadyOrder | null>;
}

export interface OrderReadyDependencies {
  store: OrderReadyStore;
  createNotification: (notification: NewNotification) => Promise<unknown>;
  clock?: () => Date;
  onError?: (error: unknown) => void;
}

export function orderLabel(orderId: ObjectId): string {
  return `#${orderId.toHexString().slice(-6).toUpperCase()}`;
}

export function customerReadyNotification(
  order: ReadyOrder,
  recipientUserId: ObjectId,
): NewNotification {
  return {
    restaurantId: order.restaurantId,
    recipientUserId,
    type: "order.ready",
    title: `Order ${order.label} is ready`,
    body: order.tableNumber
      ? `It is on its way to table ${order.tableNumber}.`
      : "Please collect it from the counter.",
    relatedEntity: { type: "order", id: order.orderId },
  };
}

/** Handles one Ready event in the background; failures are reported, never thrown. */
export function createOrderReadyNotifier(deps: OrderReadyDependencies) {
  const clock = deps.clock ?? (() => new Date());
  const onError = deps.onError ?? (() => undefined);
  return (restaurantId: ObjectId, orderId: ObjectId): Promise<void> =>
    (async () => {
      const order = await deps.store.claimReady(restaurantId, orderId, clock());
      if (!order) return;
      const notices: NewNotification[] = [];
      if (order.customerUserId)
        notices.push(customerReadyNotification(order, order.customerUserId));
      const results = await Promise.allSettled(
        notices.map((notice) => deps.createNotification(notice)),
      );
      for (const result of results) if (result.status === "rejected") onError(result.reason);
    })().catch(onError);
}

export class MongoOrderReadyStore implements OrderReadyStore {
  constructor(private readonly db: Db) {}

  async claimReady(
    restaurantId: ObjectId,
    orderId: ObjectId,
    now: Date,
  ): Promise<ReadyOrder | null> {
    const order = await this.db
      .collection<OrderDocument>(COLLECTIONS.orders)
      .findOneAndUpdate(
        { _id: orderId, restaurantId, status: "Ready", readyNotifiedAt: { $exists: false } },
        { $set: { readyNotifiedAt: now } },
        { projection: { customerId: 1, tableId: 1 }, includeResultMetadata: false },
      );
    if (!order) return null;
    const [customer, table] = await Promise.all([
      this.db
        .collection<CustomerDocument>(COLLECTIONS.customers)
        .findOne({ _id: order.customerId }, { projection: { userId: 1 } }),
      order.tableId
        ? this.db
            .collection<TableDocument>(COLLECTIONS.tables)
            .findOne({ _id: order.tableId, restaurantId }, { projection: { tableNumber: 1 } })
        : Promise.resolve(null),
    ]);
    return {
      orderId,
      restaurantId,
      label: orderLabel(orderId),
      customerUserId: customer?.userId ?? null,
      ...(table ? { tableNumber: table.tableNumber } : {}),
    };
  }
}
