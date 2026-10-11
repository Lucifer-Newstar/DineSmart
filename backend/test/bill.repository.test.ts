import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import { MongoBillRepository } from "../src/bills/bill.repository.js";
import type { NewBill } from "../src/bills/bill.types.js";
import {
  type BillDocument,
  COLLECTIONS,
  type OrderDocument,
  type OrderItemDocument,
} from "../src/database/schema.js";

const now = new Date("2026-10-11T08:00:00.000Z");

function fixture(
  options: { existingBill?: boolean; duplicateInsert?: boolean; failInsert?: boolean } = {},
) {
  const restaurantId = new ObjectId();
  const otherRestaurantId = new ObjectId();
  const userId = new ObjectId();
  const customerId = new ObjectId();
  const orderId = new ObjectId();
  const billId = new ObjectId();
  const lineItemId = new ObjectId();
  const order = {
    _id: orderId,
    restaurantId,
    customerId,
    totalMinor: 57_000,
    currency: "INR",
    status: "Ready",
    createdAt: now,
    updatedAt: now,
  } satisfies OrderDocument & { _id: ObjectId };
  const item = {
    _id: lineItemId,
    restaurantId,
    orderId,
    menuItemId: new ObjectId(),
    nameSnapshot: "Ghee podi dosa",
    unitPriceMinor: 28_500,
    quantity: 2,
    preparationStatus: "Ready",
    createdAt: now,
    updatedAt: now,
  } satisfies OrderItemDocument & { _id: ObjectId };
  const seedBill = {
    _id: billId,
    restaurantId,
    orderId,
    lineItems: [{ nameSnapshot: "Ghee podi dosa", quantity: 2, unitPriceMinor: 28_500 }],
    subtotalMinor: 57_000,
    taxMinor: 0,
    adjustmentsMinor: 0,
    totalMinor: 57_000,
    currency: "INR",
    status: "issued",
    createdAt: now,
    updatedAt: now,
  } satisfies BillDocument & { _id: ObjectId };
  const user = {
    _id: userId,
    name: "Ananya Menon",
    email: "ananya@example.test",
    normalizedEmail: "ananya@example.test",
    role: "Customer",
    restaurantId: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  const customer = { _id: customerId, userId, displayName: "Ananya Menon" };
  const findOneCalls: Array<{
    collection: string;
    filter: Record<string, unknown>;
    options?: unknown;
  }> = [];
  let currentBill: (BillDocument & { _id: ObjectId }) | null = options.existingBill
    ? seedBill
    : null;
  let inserted: (BillDocument & { _id: ObjectId }) | null = null;
  let orderItemsFilter: Record<string, unknown> | undefined;
  let orderItemsSort: Record<string, 1 | -1> | undefined;

  const db = {
    collection(name: string) {
      return {
        async findOne(filter: Record<string, unknown>, findOptions?: unknown) {
          findOneCalls.push({ collection: name, filter, options: findOptions });
          if (name === COLLECTIONS.bills) {
            const requestedId = filter._id as ObjectId | undefined;
            const requestedOrder = filter.orderId as ObjectId | undefined;
            const requestedRestaurant = filter.restaurantId as ObjectId | undefined;
            return currentBill &&
              (!requestedId || requestedId.equals(currentBill._id)) &&
              (!requestedOrder || requestedOrder.equals(currentBill.orderId)) &&
              (!requestedRestaurant || requestedRestaurant.equals(currentBill.restaurantId))
              ? currentBill
              : null;
          }
          if (name === COLLECTIONS.orders) {
            const requestedId = filter._id as ObjectId | undefined;
            const requestedRestaurant = filter.restaurantId as ObjectId | undefined;
            const requestedCustomer = filter.customerId as ObjectId | undefined;
            return requestedId?.equals(orderId) &&
              (!requestedRestaurant || requestedRestaurant.equals(restaurantId)) &&
              (!requestedCustomer || requestedCustomer.equals(customerId))
              ? order
              : null;
          }
          if (name === COLLECTIONS.users) {
            const requestedId = filter._id as ObjectId | undefined;
            return requestedId?.equals(userId) ? user : null;
          }
          return null;
        },
        async findOneAndUpdate(
          filter: Record<string, unknown>,
          _update: unknown,
          _updateOptions: unknown,
        ) {
          const requestedUserId = filter.userId as ObjectId | undefined;
          return name === COLLECTIONS.customers && requestedUserId?.equals(userId)
            ? customer
            : null;
        },
        find(filter: Record<string, unknown>) {
          orderItemsFilter = filter;
          const cursor = {
            sort(sort: Record<string, 1 | -1>) {
              orderItemsSort = sort;
              return cursor;
            },
            async toArray() {
              return filter.orderId instanceof ObjectId &&
                filter.orderId.equals(orderId) &&
                (filter.restaurantId as ObjectId | undefined)?.equals(restaurantId)
                ? [item]
                : [];
            },
          };
          return cursor;
        },
        async insertOne(document: BillDocument & { _id: ObjectId }) {
          if (options.failInsert) throw new Error("injected write failure");
          if (options.duplicateInsert || currentBill) {
            const error = new Error("duplicate bill") as Error & { code: number };
            error.code = 11000;
            throw error;
          }
          inserted = document;
          currentBill = document;
          return { acknowledged: true, insertedId: document._id };
        },
      };
    },
  } as unknown as Db;

  return {
    repository: new MongoBillRepository(db),
    restaurantId,
    otherRestaurantId,
    userId,
    customerId,
    orderId,
    billId,
    order,
    item,
    seedBill,
    findOneCalls,
    get currentBill() {
      return currentBill;
    },
    get inserted() {
      return inserted;
    },
    get orderItemsFilter() {
      return orderItemsFilter;
    },
    get orderItemsSort() {
      return orderItemsSort;
    },
  };
}

const newBill: (restaurantId: ObjectId, orderId: ObjectId) => NewBill = (
  restaurantId,
  orderId,
) => ({
  restaurantId,
  orderId,
  lineItems: [{ nameSnapshot: "Ghee podi dosa", quantity: 2, unitPriceMinor: 28_500 }],
  subtotalMinor: 57_000,
  taxMinor: 0,
  adjustmentsMinor: 0,
  totalMinor: 57_000,
  currency: "INR",
  status: "issued",
});

test("Mongo repository scopes bill reads by the signed restaurant and order", async () => {
  const harness = fixture({ existingBill: true });
  const bill = await harness.repository.findForRestaurant(harness.billId, harness.restaurantId);
  assert.equal(bill?.id, harness.billId);
  assert.deepEqual(harness.findOneCalls.at(-1)?.filter, {
    _id: harness.billId,
    restaurantId: harness.restaurantId,
  });

  await harness.repository.findByOrderForRestaurant(harness.orderId, harness.restaurantId);
  assert.deepEqual(harness.findOneCalls.at(-1)?.filter, {
    orderId: harness.orderId,
    restaurantId: harness.restaurantId,
  });

  assert.equal(
    await harness.repository.findForRestaurant(harness.billId, harness.otherRestaurantId),
    null,
  );
});

test("Mongo repository loads only same-tenant order item snapshots in stable order", async () => {
  const harness = fixture();
  const order = await harness.repository.findOrderForRestaurant(
    harness.orderId,
    harness.restaurantId,
  );
  assert.equal(order?.status, "Ready");
  assert.equal(order?.totalMinor, 57_000);
  assert.deepEqual(order?.lineItems, [
    { nameSnapshot: "Ghee podi dosa", quantity: 2, unitPriceMinor: 28_500 },
  ]);
  assert.deepEqual(harness.findOneCalls.at(-1)?.filter, {
    _id: harness.orderId,
    restaurantId: harness.restaurantId,
  });
  assert.deepEqual(harness.orderItemsFilter, {
    restaurantId: harness.restaurantId,
    orderId: harness.orderId,
  });
  assert.deepEqual(harness.orderItemsSort, { createdAt: 1, _id: 1 });
});

test("customer lookups require order ownership and carry its restaurant into the bill query", async () => {
  const harness = fixture({ existingBill: true });
  const byId = await harness.repository.findForCustomer(harness.billId, harness.customerId);
  assert.equal(byId?.id, harness.billId);
  assert.deepEqual(harness.findOneCalls.at(-1)?.filter, {
    _id: harness.orderId,
    restaurantId: harness.restaurantId,
    customerId: harness.customerId,
  });
  assert.equal(await harness.repository.findForCustomer(harness.billId, new ObjectId()), null);

  const byOrder = await harness.repository.findByOrderForCustomer(
    harness.orderId,
    harness.customerId,
  );
  assert.equal(byOrder?.id, harness.billId);
  assert.deepEqual(harness.findOneCalls.at(-2)?.filter, {
    _id: harness.orderId,
    customerId: harness.customerId,
  });
  assert.deepEqual(harness.findOneCalls.at(-1)?.filter, {
    orderId: harness.orderId,
    restaurantId: harness.restaurantId,
  });

  const stranger = await harness.repository.findByOrderForCustomer(harness.orderId, new ObjectId());
  assert.equal(stranger, null);
});

test("Mongo repository creates an issued bill with server timestamps", async () => {
  const harness = fixture();
  const bill = await harness.repository.createIfAbsent(
    newBill(harness.restaurantId, harness.orderId),
    now,
  );
  assert.equal(bill.created, true);
  assert.equal(bill.bill.id, harness.inserted?._id);
  assert.equal(harness.inserted?.createdAt, now);
  assert.equal(harness.inserted?.updatedAt, now);
  assert.equal(harness.inserted?.status, "issued");
});

test("Mongo repository resolves a duplicate-index race to the existing tenant bill", async () => {
  const harness = fixture({ existingBill: true, duplicateInsert: true });
  const result = await harness.repository.createIfAbsent(
    newBill(harness.restaurantId, harness.orderId),
    now,
  );
  assert.equal(result.created, false);
  assert.equal(result.bill.id, harness.billId);
});

test("Mongo repository rethrows unrelated duplicate-key errors and ordinary write failures", async () => {
  const harness = fixture({ duplicateInsert: true });
  await assert.rejects(
    harness.repository.createIfAbsent(newBill(harness.restaurantId, harness.orderId), now),
    (error: unknown) => error instanceof Error && error.message === "duplicate bill",
  );

  const failed = fixture({ failInsert: true });
  await assert.rejects(
    failed.repository.createIfAbsent(newBill(failed.restaurantId, failed.orderId), now),
    /injected write failure/,
  );
});

test("Mongo repository resolves the authenticated active Customer profile", async () => {
  const harness = fixture();
  const customerId = await harness.repository.getCustomerIdForUser(harness.userId, now);
  assert.equal(customerId?.toHexString(), harness.customerId.toHexString());
  assert.ok(harness.findOneCalls.some((call) => call.collection === COLLECTIONS.users));
});
