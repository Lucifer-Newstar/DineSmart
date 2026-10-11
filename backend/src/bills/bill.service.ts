import type { ObjectId } from "mongodb";
import type { BillRecord, BillRepository, BillServiceReader, NewBill } from "./bill.types.js";

export const BILLABLE_ORDER_STATUSES = ["Ready", "Served", "Completed"] as const;
export const BILL_MAX_LINE_ITEMS = 20;
export const BILL_MAX_TOTAL_UNITS = 50;

export class BillError extends Error {
  constructor(
    readonly statusCode: 400 | 403 | 404 | 409 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BillError";
  }
}

export class BillService implements BillServiceReader {
  constructor(
    private readonly repository: BillRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async generateForRestaurant(restaurantId: ObjectId, orderId: ObjectId) {
    const existing = await this.repository.findByOrderForRestaurant(orderId, restaurantId);
    if (existing) return { bill: existing, created: false };

    const order = await this.repository.findOrderForRestaurant(orderId, restaurantId);
    if (!order) {
      throw new BillError(404, "bill_order_not_found", "The order was not found.");
    }
    if (!(BILLABLE_ORDER_STATUSES as readonly string[]).includes(order.status)) {
      throw new BillError(
        409,
        "bill_order_not_ready",
        "A bill can only be generated for an order that is ready, served, or completed.",
      );
    }

    const subtotalMinor = calculateSnapshotSubtotal(
      order.totalMinor,
      order.currency,
      order.lineItems,
    );
    const bill: NewBill = {
      restaurantId,
      orderId,
      lineItems: order.lineItems.map((item) => ({
        nameSnapshot: item.nameSnapshot,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
      })),
      subtotalMinor,
      taxMinor: 0,
      adjustmentsMinor: 0,
      totalMinor: subtotalMinor,
      currency: order.currency,
      status: "issued",
    };
    return this.repository.createIfAbsent(bill, this.clock());
  }

  async getForRestaurant(billId: ObjectId, restaurantId: ObjectId): Promise<BillRecord> {
    const bill = await this.repository.findForRestaurant(billId, restaurantId);
    if (!bill) throw billNotFoundError();
    return bill;
  }

  async getByOrderForRestaurant(orderId: ObjectId, restaurantId: ObjectId): Promise<BillRecord> {
    const bill = await this.repository.findByOrderForRestaurant(orderId, restaurantId);
    if (!bill) throw billNotFoundError();
    return bill;
  }

  async getForCustomer(userId: ObjectId, billId: ObjectId): Promise<BillRecord> {
    const customerId = await this.customerIdForUser(userId);
    const bill = await this.repository.findForCustomer(billId, customerId);
    if (!bill) throw billNotFoundError();
    return bill;
  }

  async getByOrderForCustomer(userId: ObjectId, orderId: ObjectId): Promise<BillRecord> {
    const customerId = await this.customerIdForUser(userId);
    const bill = await this.repository.findByOrderForCustomer(orderId, customerId);
    if (!bill) throw billNotFoundError();
    return bill;
  }

  private async customerIdForUser(userId: ObjectId): Promise<ObjectId> {
    const customerId = await this.repository.getCustomerIdForUser(userId, this.clock());
    if (!customerId) {
      throw new BillError(
        403,
        "customer_profile_required",
        "An active customer account is required to view customer bills.",
      );
    }
    return customerId;
  }
}

function calculateSnapshotSubtotal(
  orderTotalMinor: number,
  currency: string,
  lineItems: Array<{ nameSnapshot: string; quantity: number; unitPriceMinor: number }>,
): number {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw invalidBillSourceError("The order currency is not valid.");
  }
  if (!Number.isSafeInteger(orderTotalMinor) || orderTotalMinor < 0) {
    throw invalidBillSourceError("The order total is not valid.");
  }
  if (!Array.isArray(lineItems) || lineItems.length < 1 || lineItems.length > BILL_MAX_LINE_ITEMS) {
    throw invalidBillSourceError("The order item snapshots are not valid.");
  }

  let subtotalMinor = 0;
  let totalUnits = 0;
  for (const item of lineItems) {
    if (
      typeof item.nameSnapshot !== "string" ||
      item.nameSnapshot.trim().length === 0 ||
      !Number.isSafeInteger(item.unitPriceMinor) ||
      item.unitPriceMinor <= 0 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 20
    ) {
      throw invalidBillSourceError("An order item snapshot is not valid.");
    }
    const lineTotalMinor = item.unitPriceMinor * item.quantity;
    if (
      !Number.isSafeInteger(lineTotalMinor) ||
      !Number.isSafeInteger(subtotalMinor + lineTotalMinor)
    ) {
      throw invalidBillSourceError("The order item totals exceed the supported range.");
    }
    totalUnits += item.quantity;
    subtotalMinor += lineTotalMinor;
  }

  if (totalUnits > BILL_MAX_TOTAL_UNITS || subtotalMinor !== orderTotalMinor) {
    throw invalidBillSourceError("The order total does not match its item snapshots.");
  }
  return subtotalMinor;
}

function invalidBillSourceError(message: string): BillError {
  return new BillError(
    503,
    "bill_source_unavailable",
    `The order cannot be billed because ${message.toLowerCase()}`,
  );
}

function billNotFoundError(): BillError {
  return new BillError(404, "bill_not_found", "The bill was not found.");
}
