import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import type { NewNotification } from "../src/notifications/notification.types.js";
import {
  createOrderReadyNotifier,
  MongoOrderReadyStore,
  type OrderReadyStore,
  orderLabel,
  type ReadyOrder,
} from "../src/notifications/order-notifier.js";

const restaurantId = new ObjectId();
const orderId = new ObjectId();
const customerUserId = new ObjectId();
const waiters = [new ObjectId(), new ObjectId()];
const now = new Date("2026-10-26T14:00:00.000Z");

/** Claims once, like the readyNotifiedAt update in MongoDB. */
function store(order: Omit<ReadyOrder, "orderId" | "restaurantId" | "label">): OrderReadyStore {
  let claimed = false;
  return {
    claimReady: async () => {
      if (claimed) return null;
      claimed = true;
      return { orderId, restaurantId, label: orderLabel(orderId), ...order };
    },
  };
}

async function notify(order: Omit<ReadyOrder, "orderId" | "restaurantId" | "label">, times = 1) {
  const created: NewNotification[] = [];
  const notifier = createOrderReadyNotifier({
    store: store(order),
    waiters: { listWaiters: async () => waiters },
    createNotification: async (notification) => created.push(notification),
    clock: () => now,
  });
  for (let index = 0; index < times; index += 1) await notifier(restaurantId, orderId);
  return created;
}

test("a dine-in order tells its customer and every waiter, once", async () => {
  const created = await notify({ customerUserId, tableNumber: "04" }, 3);
  assert.equal(created.length, 3);
  const customer = created.find((notice) => notice.type === "order.ready");
  assert.ok(customer?.recipientUserId.equals(customerUserId));
  assert.equal(customer?.title, `Order ${orderLabel(orderId)} is ready`);
  assert.match(customer?.body ?? "", /table 04/);
  const staff = created.filter((notice) => notice.type === "staff.order_ready");
  assert.deepEqual(
    staff.map((notice) => notice.recipientUserId.toHexString()).sort(),
    waiters.map((id) => id.toHexString()).sort(),
  );
  assert.match(staff[0]?.title ?? "", /^Table 04: order #[0-9A-F]{6} is ready$/);
});

test("a pickup order tells only its customer; staff are not alerted", async () => {
  const created = await notify({ customerUserId });
  assert.deepEqual(
    created.map((notice) => notice.type),
    ["order.ready"],
  );
  assert.match(created[0]?.body ?? "", /collect it from the counter/);
});

test("an order without a customer account still alerts waiters, and failures are reported", async () => {
  const errors: unknown[] = [];
  const created: NewNotification[] = [];
  await createOrderReadyNotifier({
    store: store({ customerUserId: null, tableNumber: "07" }),
    waiters: { listWaiters: async () => waiters },
    createNotification: async (notification) => {
      if (notification.recipientUserId.equals(waiters[0] as ObjectId)) throw new Error("down");
      created.push(notification);
    },
    onError: (error) => errors.push(error),
  })(restaurantId, orderId);
  assert.equal(created.length, 1);
  assert.equal(errors.length, 1);
});

test("a failed waiter lookup is reported and the customer still hears", async () => {
  const errors: unknown[] = [];
  const created: NewNotification[] = [];
  await createOrderReadyNotifier({
    store: store({ customerUserId, tableNumber: "02" }),
    waiters: {
      listWaiters: async () => {
        throw new Error("users unavailable");
      },
    },
    createNotification: async (notification) => created.push(notification),
    onError: (error) => errors.push(error),
  })(restaurantId, orderId);
  assert.deepEqual(
    created.map((notice) => notice.type),
    ["order.ready"],
  );
  assert.equal(errors.length, 1);
});

test("the Mongo claim only matches a Ready order that was not notified yet", async () => {
  const filters: Array<Record<string, unknown>> = [];
  const db = {
    collection: (name: string) => ({
      findOneAndUpdate: async (filter: Record<string, unknown>) => {
        filters.push(filter);
        return null;
      },
      findOne: async () => {
        throw new Error(`unexpected read of ${name}`);
      },
    }),
  } as unknown as ConstructorParameters<typeof MongoOrderReadyStore>[0];
  assert.equal(await new MongoOrderReadyStore(db).claimReady(restaurantId, orderId, now), null);
  assert.equal(filters[0]?.status, "Ready");
  assert.deepEqual(filters[0]?.readyNotifiedAt, { $exists: false });
  const claimFilter = filters[0] ?? {};
  assert.ok((claimFilter.restaurantId as ObjectId).equals(restaurantId));
});
