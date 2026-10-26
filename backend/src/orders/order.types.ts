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
  /** The signed link from a table's QR card (S5-03); ties the order to that table. */
  tableToken?: string;
}

/** Resolves a QR table token; throws when it is invalid. */
export type TableTokenResolver = (
  token: string,
) => Promise<{ restaurantId: ObjectId; tableId: ObjectId; tableNumber: string }>;

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
  tableId?: ObjectId;
}

export interface OrderRecord {
  id: ObjectId;
  restaurantId: ObjectId;
  restaurantName: string;
  status: OrderStatus;
  totalMinor: number;
  currency: string;
  items: OrderItemRecord[];
  /** Dine-in orders placed from a table QR link (S5-03). */
  tableId?: ObjectId;
  tableNumber?: string;
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
  /** One of the customer's own orders, for live tracking (S5-03). */
  getForCustomer?(userId: ObjectId, orderId: ObjectId): Promise<OrderRecord>;
  listForCustomer(userId: ObjectId): Promise<OrderListResult>;
  cancelForCustomer(userId: ObjectId, orderId: ObjectId): Promise<OrderRecord>;
}
