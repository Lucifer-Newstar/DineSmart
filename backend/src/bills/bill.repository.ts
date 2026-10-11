import { type Db, ObjectId, type WithId } from "mongodb";
import { MongoCustomerProfileRepository } from "../customers/customer-profile.repository.js";
import {
  type BillDocument,
  COLLECTIONS,
  type OrderDocument,
  type OrderItemDocument,
} from "../database/schema.js";
import type {
  BillCreateResult,
  BillOrderSource,
  BillRecord,
  BillRepository,
  NewBill,
} from "./bill.types.js";

export class MongoBillRepository implements BillRepository {
  private readonly bills;
  private readonly orders;
  private readonly orderItems;
  private readonly customerProfiles: MongoCustomerProfileRepository;

  constructor(db: Db) {
    this.bills = db.collection<BillDocument>(COLLECTIONS.bills);
    this.orders = db.collection<OrderDocument>(COLLECTIONS.orders);
    this.orderItems = db.collection<OrderItemDocument>(COLLECTIONS.orderItems);
    this.customerProfiles = new MongoCustomerProfileRepository(db);
  }

  getCustomerIdForUser(userId: ObjectId, now: Date): Promise<ObjectId | null> {
    return this.customerProfiles.getCustomerIdForUser(userId, now);
  }

  async findForRestaurant(billId: ObjectId, restaurantId: ObjectId): Promise<BillRecord | null> {
    const bill = await this.bills.findOne({ _id: billId, restaurantId });
    return bill ? toBillRecord(bill) : null;
  }

  async findByOrderForRestaurant(
    orderId: ObjectId,
    restaurantId: ObjectId,
  ): Promise<BillRecord | null> {
    const bill = await this.bills.findOne({ orderId, restaurantId });
    return bill ? toBillRecord(bill) : null;
  }

  async findForCustomer(billId: ObjectId, customerId: ObjectId): Promise<BillRecord | null> {
    const bill = await this.bills.findOne({ _id: billId });
    if (!bill) return null;

    const ownedOrder = await this.orders.findOne(
      { _id: bill.orderId, restaurantId: bill.restaurantId, customerId },
      { projection: { _id: 1 } },
    );
    return ownedOrder ? toBillRecord(bill) : null;
  }

  async findByOrderForCustomer(
    orderId: ObjectId,
    customerId: ObjectId,
  ): Promise<BillRecord | null> {
    const ownedOrder = await this.orders.findOne(
      { _id: orderId, customerId },
      { projection: { _id: 1, restaurantId: 1 } },
    );
    if (!ownedOrder) return null;

    const bill = await this.bills.findOne({ orderId, restaurantId: ownedOrder.restaurantId });
    return bill ? toBillRecord(bill) : null;
  }

  async findOrderForRestaurant(
    orderId: ObjectId,
    restaurantId: ObjectId,
  ): Promise<BillOrderSource | null> {
    const order = await this.orders.findOne(
      { _id: orderId, restaurantId },
      { projection: { _id: 1, status: 1, totalMinor: 1, currency: 1 } },
    );
    if (!order) return null;

    const items = await this.orderItems
      .find({ restaurantId, orderId })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();

    return {
      status: order.status,
      totalMinor: order.totalMinor,
      currency: order.currency,
      lineItems: items.map((item) => ({
        nameSnapshot: item.nameSnapshot,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
      })),
    };
  }

  async createIfAbsent(bill: NewBill, now: Date): Promise<BillCreateResult> {
    const document: BillDocument & { _id: ObjectId } = {
      _id: new ObjectId(),
      ...bill,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.bills.insertOne(document);
      return { bill: toBillRecord(document), created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const existing = await this.findByOrderForRestaurant(bill.orderId, bill.restaurantId);
      if (existing) return { bill: existing, created: false };
      throw error;
    }
  }
}

function toBillRecord(bill: WithId<BillDocument>): BillRecord {
  return {
    id: bill._id,
    restaurantId: bill.restaurantId,
    orderId: bill.orderId,
    lineItems: bill.lineItems.map((item) => ({
      nameSnapshot: item.nameSnapshot,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
    })),
    subtotalMinor: bill.subtotalMinor,
    taxMinor: bill.taxMinor,
    adjustmentsMinor: bill.adjustmentsMinor,
    totalMinor: bill.totalMinor,
    currency: bill.currency,
    status: bill.status,
    createdAt: bill.createdAt,
    updatedAt: bill.updatedAt,
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
