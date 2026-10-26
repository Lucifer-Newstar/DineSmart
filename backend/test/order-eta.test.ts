import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import type { OrderRecord } from "../src/orders/order.types.js";
import {
  DEFAULT_PREP_MINUTES,
  estimateOrderEta,
  MAX_QUEUE_MINUTES,
  MongoOrderEtaEstimator,
  QUEUE_MINUTES_PER_ORDER,
} from "../src/orders/order-eta.js";

const placedAt = new Date("2026-10-26T13:00:00.000Z");
const minutes = (count: number) => new Date(placedAt.getTime() + count * 60_000);

test("an empty queue is ready after the slowest dish", () => {
  const eta = estimateOrderEta({
    placedAt,
    status: "Created",
    prepMinutes: [8, 18, 12],
    ordersAhead: 0,
    now: placedAt,
  });
  assert.deepEqual(eta, { totalMinutes: 18, readyAt: minutes(18), minutesLeft: 18, late: false });
});

test("each open order ahead adds queue time, up to a cap", () => {
  const busy = estimateOrderEta({
    placedAt,
    status: "Accepted",
    prepMinutes: [10],
    ordersAhead: 3,
    now: minutes(5),
  });
  assert.equal(busy?.totalMinutes, 10 + 3 * QUEUE_MINUTES_PER_ORDER);
  assert.equal(busy?.minutesLeft, 10 + 3 * QUEUE_MINUTES_PER_ORDER - 5);
  const slammed = estimateOrderEta({
    placedAt,
    status: "Preparing",
    prepMinutes: [10],
    ordersAhead: 500,
    now: placedAt,
  });
  assert.equal(slammed?.totalMinutes, 10 + MAX_QUEUE_MINUTES);
});

test("dishes without prep minutes count as the default", () => {
  const eta = estimateOrderEta({
    placedAt,
    status: "Created",
    prepMinutes: [undefined, 5, -3, Number.NaN],
    ordersAhead: 0,
    now: placedAt,
  });
  assert.equal(eta?.totalMinutes, DEFAULT_PREP_MINUTES);
  assert.equal(
    estimateOrderEta({
      placedAt,
      status: "Created",
      prepMinutes: [],
      ordersAhead: 0,
      now: placedAt,
    })?.totalMinutes,
    DEFAULT_PREP_MINUTES,
  );
});

test("an overdue order says it is late and never shows zero minutes", () => {
  const eta = estimateOrderEta({
    placedAt,
    status: "Preparing",
    prepMinutes: [10],
    ordersAhead: 0,
    now: minutes(14),
  });
  assert.equal(eta?.late, true);
  assert.equal(eta?.minutesLeft, 1);
});

test("finished orders have no estimate", () => {
  for (const status of ["Ready", "Served", "Completed", "Cancelled"] as const) {
    assert.equal(
      estimateOrderEta({ placedAt, status, prepMinutes: [10], ordersAhead: 0, now: placedAt }),
      null,
    );
  }
});

test("the Mongo estimator reads prep minutes and counts only earlier open orders", async () => {
  const restaurantId = new ObjectId();
  const dosa = new ObjectId();
  const queries: Array<Record<string, unknown>> = [];
  const db = {
    collection: (name: string) =>
      name === "menu_items"
        ? {
            find: (filter: Record<string, unknown>) => {
              queries.push(filter);
              return { toArray: async () => [{ _id: dosa, prepMinutes: 14 }] };
            },
          }
        : {
            countDocuments: async (filter: Record<string, unknown>) => {
              queries.push(filter);
              return 2;
            },
          },
  } as unknown as ConstructorParameters<typeof MongoOrderEtaEstimator>[0];
  const order: OrderRecord = {
    id: new ObjectId(),
    restaurantId,
    restaurantName: "Saffron & Co.",
    status: "Created",
    totalMinor: 100,
    currency: "INR",
    items: [
      {
        id: new ObjectId(),
        menuItemId: dosa,
        nameSnapshot: "Dosa",
        unitPriceMinor: 100,
        quantity: 1,
        preparationStatus: "Created",
      },
    ],
    createdAt: placedAt,
    updatedAt: placedAt,
  };
  const eta = await new MongoOrderEtaEstimator(db).estimate(order, placedAt);
  assert.equal(eta?.totalMinutes, 14 + 2 * QUEUE_MINUTES_PER_ORDER);
  const count = queries.find((query) => "createdAt" in query) as {
    restaurantId: ObjectId;
    createdAt: { $lt: Date };
  };
  assert.ok(count.restaurantId.equals(restaurantId));
  assert.equal(count.createdAt.$lt.getTime(), placedAt.getTime());
  assert.equal(
    await new MongoOrderEtaEstimator(db).estimate({ ...order, status: "Ready" }, placedAt),
    null,
  );
});
