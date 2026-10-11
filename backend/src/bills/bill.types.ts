import type { ObjectId } from "mongodb";
import type { OrderStatus } from "../database/schema.js";

export type BillStatus = "issued";

export interface BillLineItem {
  nameSnapshot: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface BillRecord {
  id: ObjectId;
  restaurantId: ObjectId;
  orderId: ObjectId;
  lineItems: BillLineItem[];
  subtotalMinor: number;
  taxMinor: number;
  adjustmentsMinor: number;
  totalMinor: number;
  currency: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NewBill = Omit<BillRecord, "id" | "createdAt" | "updatedAt" | "status"> & {
  status: BillStatus;
};

export interface BillOrderItemSource {
  nameSnapshot: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface BillOrderSource {
  status: OrderStatus;
  totalMinor: number;
  currency: string;
  lineItems: BillOrderItemSource[];
}

export interface BillCreateResult {
  bill: BillRecord;
  created: boolean;
}

export interface BillRepository {
  getCustomerIdForUser(userId: ObjectId, now: Date): Promise<ObjectId | null>;
  findForRestaurant(billId: ObjectId, restaurantId: ObjectId): Promise<BillRecord | null>;
  findByOrderForRestaurant(orderId: ObjectId, restaurantId: ObjectId): Promise<BillRecord | null>;
  findForCustomer(billId: ObjectId, customerId: ObjectId): Promise<BillRecord | null>;
  findByOrderForCustomer(orderId: ObjectId, customerId: ObjectId): Promise<BillRecord | null>;
  findOrderForRestaurant(
    orderId: ObjectId,
    restaurantId: ObjectId,
  ): Promise<BillOrderSource | null>;
  createIfAbsent(bill: NewBill, now: Date): Promise<BillCreateResult>;
}

export interface BillServiceReader {
  generateForRestaurant(restaurantId: ObjectId, orderId: ObjectId): Promise<BillCreateResult>;
  getForRestaurant(billId: ObjectId, restaurantId: ObjectId): Promise<BillRecord>;
  getByOrderForRestaurant(orderId: ObjectId, restaurantId: ObjectId): Promise<BillRecord>;
  getForCustomer(userId: ObjectId, billId: ObjectId): Promise<BillRecord>;
  getByOrderForCustomer(userId: ObjectId, orderId: ObjectId): Promise<BillRecord>;
}
