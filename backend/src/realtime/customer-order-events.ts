import { type Db, ObjectId } from "mongodb";
import { COLLECTIONS, type CustomerDocument, type OrderDocument } from "../database/schema.js";
import type { CustomerOrderPublisher, RestaurantRealtimePublisher } from "./realtime.types.js";

/**
 * Order status changes reach the customer who placed the order (S5-03).
 *
 * Staff services publish restaurant events as before. This wrapper passes each
 * one on unchanged, and for order changes it also finds the order's customer
 * account and sends that account alone an `order.status` event.
 */

/** Finds the user account behind an order; null for unknown orders or guests without an account. */
export type OrderCustomerLookup = (
  restaurantId: ObjectId,
  orderId: ObjectId,
) => Promise<ObjectId | null>;

export function withCustomerOrderEvents(
  publishRestaurant: RestaurantRealtimePublisher,
  lookupCustomer: OrderCustomerLookup,
  publishCustomer: CustomerOrderPublisher,
  onError: (error: unknown) => void = () => undefined,
): RestaurantRealtimePublisher {
  return (event) => {
    publishRestaurant(event);
    if (event.event !== "order.updated" || !ObjectId.isValid(event.data.orderId)) return;
    const { orderId, status } = event.data;
    lookupCustomer(event.restaurantId, new ObjectId(orderId))
      .then((customerUserId) => {
        if (customerUserId) {
          publishCustomer({ customerUserId, restaurantId: event.restaurantId, orderId, status });
        }
      })
      .catch(onError);
  };
}

export function mongoOrderCustomerLookup(getDb: () => Promise<Db>): OrderCustomerLookup {
  return async (restaurantId, orderId) => {
    const db = await getDb();
    const order = await db
      .collection<OrderDocument>(COLLECTIONS.orders)
      .findOne({ _id: orderId, restaurantId }, { projection: { customerId: 1 } });
    if (!order) return null;
    const customer = await db
      .collection<CustomerDocument>(COLLECTIONS.customers)
      .findOne({ _id: order.customerId }, { projection: { userId: 1 } });
    return customer?.userId ?? null;
  };
}
