import type { ObjectId } from "mongodb";
import type { OrderItemOption, OrderStatus, PreparationStatus } from "../database/schema.js";
import type { OrderRecord } from "./order.types.js";

export const KITCHEN_QUEUE_LIMIT = 200;
export const KITCHEN_QUEUE_STATUSES = ["Accepted", "Preparing", "Ready"] as const;
export const STAFF_ORDER_LIST_LIMIT = 200;
export const STAFF_ORDER_LIST_STATUSES = [
  "Created",
  "Accepted",
  "Preparing",
  "Ready",
  "Served",
] as const satisfies readonly OrderStatus[];

export type KitchenTicketStatus = (typeof KITCHEN_QUEUE_STATUSES)[number];
export type KitchenPreparationUpdate = Exclude<PreparationStatus, "Created">;
export type StaffOrderView = "floor" | "kitchen";

export interface StaffOrderListResult {
  orders: OrderRecord[];
  truncated: boolean;
}

export interface KitchenTicketItem {
  id: ObjectId;
  name: string;
  quantity: number;
  options?: OrderItemOption[];
  /** The guest's special request, printed on the ticket (S5-03). */
  notes?: string;
  preparationStatus: PreparationStatus;
}

export interface KitchenTicket {
  id: ObjectId;
  status: KitchenTicketStatus;
  /** Set for dine-in orders placed from a table QR link. */
  tableNumber?: string;
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
  listRestaurantOrders(
    restaurantId: ObjectId,
    statuses: readonly OrderStatus[],
  ): Promise<StaffOrderListResult>;
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
  listRestaurantOrders(restaurantId: ObjectId, view: StaffOrderView): Promise<StaffOrderListResult>;
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
