import type { ObjectId } from "mongodb";
import type { OrderStatus, PreparationStatus } from "../database/schema.js";
import type { OrderRecord } from "./order.types.js";

export const KITCHEN_QUEUE_LIMIT = 200;
export const KITCHEN_QUEUE_STATUSES = ["Accepted", "Preparing", "Ready"] as const;

export type KitchenTicketStatus = (typeof KITCHEN_QUEUE_STATUSES)[number];
export type KitchenPreparationUpdate = Exclude<PreparationStatus, "Created">;

export interface KitchenTicketItem {
  id: ObjectId;
  name: string;
  quantity: number;
  preparationStatus: PreparationStatus;
}

export interface KitchenTicket {
  id: ObjectId;
  status: KitchenTicketStatus;
  items: KitchenTicketItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface KitchenQueueResult {
  tickets: KitchenTicket[];
  truncated: boolean;
}

/** Restaurant-scoped operations used only by staff order/kitchen workflows. */
export interface StaffOrderRepository {
  listKitchenQueue(restaurantId: ObjectId): Promise<KitchenQueueResult>;
  findForRestaurant(orderId: ObjectId, restaurantId: ObjectId): Promise<OrderRecord | null>;
  updateOrderStatusIfCurrent(
    orderId: ObjectId,
    restaurantId: ObjectId,
    expectedStatus: OrderStatus,
    expectedUpdatedAt: Date,
    nextStatus: OrderStatus,
    now: Date,
  ): Promise<boolean>;
  updateItemPreparationStatusIfCurrent(
    orderId: ObjectId,
    restaurantId: ObjectId,
    itemId: ObjectId,
    expectedStatus: PreparationStatus,
    nextStatus: PreparationStatus,
    now: Date,
  ): Promise<boolean>;
  listItemPreparationStatuses(
    orderId: ObjectId,
    restaurantId: ObjectId,
  ): Promise<PreparationStatus[]>;
}

export interface StaffOrderServiceReader {
  listKitchenQueue(restaurantId: ObjectId): Promise<KitchenQueueResult>;
  updateOrderStatus(
    restaurantId: ObjectId,
    orderId: ObjectId,
    nextStatus: OrderStatus,
  ): Promise<OrderRecord>;
  updateItemPreparationStatus(
    restaurantId: ObjectId,
    orderId: ObjectId,
    itemId: ObjectId,
    nextStatus: KitchenPreparationUpdate,
  ): Promise<OrderRecord>;
}
