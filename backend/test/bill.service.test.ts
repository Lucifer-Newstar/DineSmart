import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { BillError, BillService } from "../src/bills/bill.service.js";
import type {
  BillCreateResult,
  BillOrderSource,
  BillRecord,
  BillRepository,
  NewBill,
} from "../src/bills/bill.types.js";

const now = new Date("2026-10-11T08:00:00.000Z");
const restaurantId = new ObjectId();
const orderId = new ObjectId();
const billId = new ObjectId();
const userId = new ObjectId();
const customerId = new ObjectId();
const defaultLines = [
  { nameSnapshot: "Ghee podi dosa", quantity: 2, unitPriceMinor: 28_500 },
  { nameSnapshot: "Madras filter coffee", quantity: 1, unitPriceMinor: 9_500 },
];
const orderSource: BillOrderSource = {
  status: "Ready",
  totalMinor: 66_500,
  currency: "INR",
  lineItems: defaultLines,
};

function record(overrides: Partial<BillRecord> = {}): BillRecord {
  return {
    id: billId,
    restaurantId,
    orderId,
    lineItems: defaultLines,
    subtotalMinor: 66_500,
    taxMinor: 0,
    adjustmentsMinor: 0,
    totalMinor: 66_500,
    currency: "INR",
    status: "issued",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class FakeBillRepository implements BillRepository {
  order: BillOrderSource | null = orderSource;
  existingBill: BillRecord | null = null;
  customerIdForUser: ObjectId | null = customerId;
  customerBill: BillRecord | null = record();
  createResult?: BillCreateResult;
  created?: NewBill;
  calls: string[] = [];
  customerProfileLookup?: { userId: ObjectId; now: Date };

  async getCustomerIdForUser(userId: ObjectId, at: Date): Promise<ObjectId | null> {
    this.customerProfileLookup = { userId, now: at };
    return this.customerIdForUser;
  }

  async findForRestaurant(billIdArg: ObjectId, restaurantIdArg: ObjectId) {
    this.calls.push("findForRestaurant");
    return billIdArg.equals(billId) && restaurantIdArg.equals(restaurantId)
      ? this.existingBill
      : null;
  }

  async findByOrderForRestaurant(orderIdArg: ObjectId, restaurantIdArg: ObjectId) {
    this.calls.push("findByOrderForRestaurant");
    if (!orderIdArg.equals(orderId) || !restaurantIdArg.equals(restaurantId)) return null;
    return this.existingBill;
  }

  async findForCustomer(billIdArg: ObjectId, customerIdArg: ObjectId) {
    this.calls.push("findForCustomer");
    return billIdArg.equals(billId) && customerIdArg.equals(customerId) ? this.customerBill : null;
  }

  async findByOrderForCustomer(orderIdArg: ObjectId, customerIdArg: ObjectId) {
    this.calls.push("findByOrderForCustomer");
    return orderIdArg.equals(orderId) && customerIdArg.equals(customerId)
      ? this.customerBill
      : null;
  }

  async findOrderForRestaurant(
    orderIdArg: ObjectId,
    restaurantIdArg: ObjectId,
  ): Promise<BillOrderSource | null> {
    this.calls.push("findOrderForRestaurant");
    return orderIdArg.equals(orderId) && restaurantIdArg.equals(restaurantId) ? this.order : null;
  }

  async createIfAbsent(bill: NewBill, at: Date): Promise<BillCreateResult> {
    this.calls.push("createIfAbsent");
    this.created = bill;
    return (
      this.createResult ?? {
        bill: record({ ...bill, createdAt: at, updatedAt: at }),
        created: true,
      }
    );
  }
}

function serviceWith(repository = new FakeBillRepository()) {
  return { repository, service: new BillService(repository, () => now) };
}

test("bill generation creates an immutable issued snapshot using the order's amounts and currency", async () => {
  const { repository, service } = serviceWith();
  const result = await service.generateForRestaurant(restaurantId, orderId);

  assert.equal(result.created, true);
  assert.equal(result.bill.status, "issued");
  assert.equal(result.bill.subtotalMinor, 66_500);
  assert.equal(result.bill.taxMinor, 0);
  assert.equal(result.bill.adjustmentsMinor, 0);
  assert.equal(result.bill.totalMinor, 66_500);
  assert.equal(result.bill.currency, "INR");
  assert.deepEqual(repository.created?.lineItems, defaultLines);
  assert.equal(repository.created?.restaurantId, restaurantId);
  assert.equal(repository.created?.orderId, orderId);
  assert.deepEqual(repository.calls, [
    "findByOrderForRestaurant",
    "findOrderForRestaurant",
    "createIfAbsent",
  ]);
});

test("bill generation returns an existing bill without reading or changing order snapshots", async () => {
  const { repository, service } = serviceWith();
  repository.existingBill = record({ subtotalMinor: 50_000, totalMinor: 50_000 });

  const result = await service.generateForRestaurant(restaurantId, orderId);

  assert.equal(result.created, false);
  assert.equal(result.bill.subtotalMinor, 50_000);
  assert.deepEqual(repository.calls, ["findByOrderForRestaurant"]);
  assert.equal(repository.created, undefined);
});

test("bill generation accepts Ready, Served, and Completed orders only", async () => {
  for (const status of ["Ready", "Served", "Completed"] as const) {
    const { service, repository } = serviceWith();
    repository.order = { ...orderSource, status };
    const result = await service.generateForRestaurant(restaurantId, orderId);
    assert.equal(result.bill.status, "issued");
  }

  for (const status of ["Created", "Accepted", "Preparing", "Cancelled"] as const) {
    const { service, repository } = serviceWith();
    repository.order = { ...orderSource, status };
    await assert.rejects(
      service.generateForRestaurant(restaurantId, orderId),
      (error: unknown) => error instanceof BillError && error.code === "bill_order_not_ready",
    );
    assert.equal(repository.created, undefined);
  }
});

test("bill generation refuses missing orders and inconsistent or malformed source snapshots", async () => {
  const missing = serviceWith();
  missing.repository.order = null;
  await assert.rejects(
    missing.service.generateForRestaurant(restaurantId, orderId),
    (error: unknown) => error instanceof BillError && error.statusCode === 404,
  );

  const invalidCases: Array<Partial<BillOrderSource>> = [
    { totalMinor: 1 },
    { currency: "rupees" },
    { lineItems: [] },
    { lineItems: [{ nameSnapshot: " ", quantity: 1, unitPriceMinor: 100 }] },
    { lineItems: [{ nameSnapshot: "Item", quantity: 1, unitPriceMinor: Number.MAX_SAFE_INTEGER }] },
    { lineItems: [{ nameSnapshot: "Item", quantity: 0, unitPriceMinor: 100 }] },
  ];
  for (const change of invalidCases) {
    const { service, repository } = serviceWith();
    repository.order = { ...orderSource, ...change } as BillOrderSource;
    await assert.rejects(
      service.generateForRestaurant(restaurantId, orderId),
      (error: unknown) => error instanceof BillError && error.code === "bill_source_unavailable",
    );
    assert.equal(repository.created, undefined);
  }
});

test("a raced unique-index insert returns the existing bill without replacing it", async () => {
  const { repository, service } = serviceWith();
  repository.createResult = { bill: record({ totalMinor: 66_500 }), created: false };
  const result = await service.generateForRestaurant(restaurantId, orderId);
  assert.equal(result.created, false);
  assert.equal(result.bill.id, billId);
});

test("customer bill reads resolve the active global profile and rely on order ownership", async () => {
  const { repository, service } = serviceWith();
  const byId = await service.getForCustomer(userId, billId);
  assert.equal(byId.id, billId);
  assert.deepEqual(repository.customerProfileLookup, { userId, now });
  assert.ok(repository.calls.includes("findForCustomer"));

  repository.calls = [];
  const byOrder = await service.getByOrderForCustomer(userId, orderId);
  assert.equal(byOrder.orderId, orderId);
  assert.deepEqual(repository.calls, ["findByOrderForCustomer"]);
});

test("customer bill reads fail closed for missing profiles and non-owned/missing bills", async () => {
  const missingProfile = serviceWith();
  missingProfile.repository.customerIdForUser = null;
  await assert.rejects(
    missingProfile.service.getForCustomer(userId, billId),
    (error: unknown) => error instanceof BillError && error.code === "customer_profile_required",
  );
  assert.deepEqual(missingProfile.repository.calls, []);

  const inaccessible = serviceWith();
  inaccessible.repository.customerBill = null;
  await assert.rejects(
    inaccessible.service.getForCustomer(userId, billId),
    (error: unknown) => error instanceof BillError && error.code === "bill_not_found",
  );
});

test("staff bill reads pass through restaurant-scoped repository queries", async () => {
  const { repository, service } = serviceWith();
  repository.existingBill = record();
  assert.equal((await service.getForRestaurant(billId, restaurantId)).id, billId);
  assert.equal((await service.getByOrderForRestaurant(orderId, restaurantId)).orderId, orderId);
  assert.deepEqual(repository.calls, ["findForRestaurant", "findByOrderForRestaurant"]);
});
