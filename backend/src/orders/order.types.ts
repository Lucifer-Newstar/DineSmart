import type { ObjectId } from "mongodb";
import type {
  MenuOptionGroup,
  OrderItemOption,
  OrderStatus,
  PreparationStatus,
} from "../database/schema.js";

export const ORDER_HISTORY_LIMIT = 100;

export interface OrderRequestLine {
  menuItemId: ObjectId;
  quantity: number;
  /** Chosen option per group: `{ spice: "hot" }`. */
  options?: Record<string, string>;
}

export interface NewCustomerOrderRequest {
  userId: ObjectId;
  restaurantId: ObjectId;
  items: OrderRequestLine[];
}

export interface ActiveOrderRestaurant {
  id: ObjectId;
  name: string;
  currency: string;
}

export interface OrderItemSnapshot {
  menuItemId: ObjectId;
  nameSnapshot: string;
  unitPriceMinor: number;
  quantity: number;
  options?: OrderItemOption[];
  preparationStatus: PreparationStatus;
}

export interface OrderItemRecord extends OrderItemSnapshot {
  id: ObjectId;
}

export interface NewOrder {
  restaurantId: ObjectId;
  customerId: ObjectId;
  totalMinor: number;
  currency: string;
  status: "Created";
  statusTimestamps: { Created: Date };
}

export interface OrderRecord {
  id: ObjectId;
  restaurantId: ObjectId;
  restaurantName: string;
  status: OrderStatus;
  totalMinor: number;
  currency: string;
  items: OrderItemRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderListResult {
  orders: OrderRecord[];
  truncated: boolean;
}

export interface OrderRepository {
  getCustomerIdForUser(userId: ObjectId, now: Date): Promise<ObjectId | null>;
  getActiveRestaurant(restaurantId: ObjectId): Promise<ActiveOrderRestaurant | null>;
  getAvailableMenuItems(
    restaurantId: ObjectId,
    menuItemIds: ObjectId[],
  ): Promise<
    Array<{
      id: ObjectId;
      name: string;
      priceMinor: number;
      optionGroups?: MenuOptionGroup[];
    }>
  >;
  createOrder(order: NewOrder, items: OrderItemSnapshot[], now: Date): Promise<OrderRecord>;
  listForCustomer(customerId: ObjectId): Promise<OrderListResult>;
  findForCustomer(orderId: ObjectId, customerId: ObjectId): Promise<OrderRecord | null>;
  cancelForCustomer(
    orderId: ObjectId,
    customerId: ObjectId,
    expectedUpdatedAt: Date,
    now: Date,
  ): Promise<OrderRecord | null>;
}

export interface OrderServiceReader {
  createForCustomer(request: NewCustomerOrderRequest): Promise<OrderRecord>;
  listForCustomer(userId: ObjectId): Promise<OrderListResult>;
  cancelForCustomer(userId: ObjectId, orderId: ObjectId): Promise<OrderRecord>;
}
