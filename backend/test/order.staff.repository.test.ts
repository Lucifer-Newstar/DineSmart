import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import {
  COLLECTIONS,
  type OrderDocument,
  type OrderItemDocument,
  type OrderStatus,
  type PreparationStatus,
  type RestaurantDocument,
} from "../src/database/schema.js";
import { MongoOrderRepository } from "../src/orders/order.repository.js";

const at = new Date("2026-10-11T06:00:00.000Z");

function fixture(options: { queueOrderCount?: number } = {}) {
  const restaurantId = new ObjectId();
  const otherRestaurantId = new ObjectId();
  const orderId = new ObjectId();
  const itemId = new ObjectId();
  const order: OrderDocument & { _id: ObjectId } = {
    _id: orderId,
    restaurantId,
    customerId: new ObjectId(),
    totalMinor: 28_500,
    currency: "INR",
    status: "Accepted" as OrderStatus,
    statusTimestamps: { Created: at, Accepted: at },
    createdAt: at,
    updatedAt: at,
  };
  const queueOrders = Array.from({ length: options.queueOrderCount ?? 1 }, (_unused, index) =>
    index === 0
      ? order
      : { ...order, _id: new ObjectId(), createdAt: new Date(at.getTime() + index) },
  );
  const item = {
    _id: itemId,
    restaurantId,
    orderId,
    menuItemId: new ObjectId(),
    nameSnapshot: "Ghee podi dosa",
    unitPriceMinor: 28_500,
    quantity: 1,
    preparationStatus: "Created" as PreparationStatus,
    createdAt: at,
    updatedAt: at,
  } satisfies OrderItemDocument & { _id: ObjectId };
  const restaurant = {
    _id: restaurantId,
    name: "Saffron & Co.",
    timezone: "Asia/Kolkata",
    currency: "INR",
    status: "active",
    createdAt: at,
    updatedAt: at,
  } satisfies RestaurantDocument & { _id: ObjectId };
  const queries: Array<{ collection: string; filter: Record<string, unknown> }> = [];
  const sorts: Array<{ collection: string; sort: Record<string, 1 | -1> }> = [];
  const limits: Array<{ collection: string; limit: number }> = [];

  const db = {
    collection(name: string) {
      return {
        async findOne(filter: Record<string, unknown>) {
          queries.push({ collection: name, filter });
          if (name === COLLECTIONS.orders) {
            return order._id.equals(filter._id as ObjectId) &&
              order.restaurantId.equals(filter.restaurantId as ObjectId)
              ? order
              : null;
          }
          if (name === COLLECTIONS.restaurants) {
            return restaurant._id.equals(filter._id as ObjectId) ? restaurant : null;
          }
          return null;
        },
        find(filter: Record<string, unknown>) {
          queries.push({ collection: name, filter });
          let records: unknown[] = [];
          if (name === COLLECTIONS.orders) {
            const statusFilter = filter.status as { $in?: string[] } | undefined;
            const tenant = filter.restaurantId as ObjectId | undefined;
            if (tenant?.equals(restaurantId) && statusFilter?.$in?.includes(order.status)) {
              records = queueOrders;
            }
          } else if (name === COLLECTIONS.orderItems) {
            const tenant = filter.restaurantId as ObjectId | undefined;
            const orderFilter = filter.orderId as ObjectId | { $in: ObjectId[] } | undefined;
            const matchesOrder =
              orderFilter instanceof ObjectId
                ? orderFilter.equals(orderId)
                : (orderFilter?.$in.some((candidate) => candidate.equals(orderId)) ?? false);
            if (tenant?.equals(restaurantId) && matchesOrder) records = [item];
          }

          let cursorLimit = Number.POSITIVE_INFINITY;
          const cursor = {
            sort(specification: Record<string, 1 | -1>) {
              sorts.push({ collection: name, sort: specification });
              return cursor;
            },
            limit(value: number) {
              limits.push({ collection: name, limit: value });
              cursorLimit = value;
              return cursor;
            },
            async toArray() {
              return records.slice(0, cursorLimit);
            },
          };
          return cursor;
        },
        async updateOne(
          filter: Record<string, unknown>,
          update: { $set: Record<string, unknown> },
        ) {
          queries.push({ collection: name, filter });
          if (name === COLLECTIONS.orders) {
            const matches =
              order._id.equals(filter._id as ObjectId) &&
              order.restaurantId.equals(filter.restaurantId as ObjectId) &&
              order.status === filter.status &&
              (filter.updatedAt as Date).getTime() === order.updatedAt.getTime();
            if (!matches) return { matchedCount: 0 };
            order.status = update.$set.status as OrderStatus;
            order.updatedAt = update.$set.updatedAt as Date;
            const timestampPath = `statusTimestamps.${order.status}`;
            order.statusTimestamps = {
              ...order.statusTimestamps,
              [order.status]: update.$set[timestampPath] as Date,
            };
            return { matchedCount: 1 };
          }
          if (name === COLLECTIONS.orderItems) {
            const matches =
              item._id.equals(filter._id as ObjectId) &&
              item.restaurantId.equals(filter.restaurantId as ObjectId) &&
              item.orderId.equals(filter.orderId as ObjectId) &&
              item.preparationStatus === filter.preparationStatus;
            if (!matches) return { matchedCount: 0 };
            item.preparationStatus = update.$set.preparationStatus as PreparationStatus;
            item.updatedAt = update.$set.updatedAt as Date;
            return { matchedCount: 1 };
          }
          return { matchedCount: 0 };
        },
      };
    },
  } as unknown as Db;

  return {
    db,
    restaurantId,
    otherRestaurantId,
    orderId,
    itemId,
    order,
    item,
    queries,
    sorts,
    limits,
  };
}

test("kitchen queue query is tenant/status scoped, oldest-first, capped, and price-free", async () => {
  const data = fixture();
  const repository = new MongoOrderRepository(data.db);
  const result = await repository.listKitchenQueue(data.restaurantId);

  assert.equal(result.tickets.length, 1);
  assert.equal(result.truncated, false);
  assert.equal(result.tickets[0].id.toHexString(), data.orderId.toHexString());
  assert.equal(result.tickets[0].status, "Accepted");
  assert.deepEqual(result.tickets[0].items, [
    {
      id: data.itemId,
      name: "Ghee podi dosa",
      quantity: 1,
      preparationStatus: "Created",
    },
  ]);

  const queueQuery = data.queries.find(
    (query) => query.collection === COLLECTIONS.orders && "$in" in (query.filter.status as object),
  );
  assert.deepEqual(queueQuery?.filter, {
    restaurantId: data.restaurantId,
    status: { $in: ["Accepted", "Preparing", "Ready"] },
  });
  assert.ok(
    data.sorts.some(
      (entry) =>
        entry.collection === COLLECTIONS.orders &&
        JSON.stringify(entry.sort) === JSON.stringify({ createdAt: 1, _id: 1 }),
    ),
  );
  assert.ok(
    data.limits.some((entry) => entry.collection === COLLECTIONS.orders && entry.limit === 201),
  );
  const itemQuery = data.queries.find((query) => {
    const orderFilter = query.filter.orderId;
    return (
      query.collection === COLLECTIONS.orderItems &&
      typeof orderFilter === "object" &&
      orderFilter !== null &&
      "$in" in orderFilter
    );
  });
  assert.deepEqual(itemQuery?.filter, {
    restaurantId: data.restaurantId,
    orderId: { $in: [data.orderId] },
  });
});

test("kitchen queue returns no more than 200 orders and reports truncation", async () => {
  const data = fixture({ queueOrderCount: 201 });
  const repository = new MongoOrderRepository(data.db);
  const result = await repository.listKitchenQueue(data.restaurantId);
  assert.equal(result.tickets.length, 200);
  assert.equal(result.truncated, true);
  assert.equal(result.tickets[0].id.toHexString(), data.orderId.toHexString());
});

test("staff order and item writes match signed tenant, observed status, and update time", async () => {
  const data = fixture();
  const repository = new MongoOrderRepository(data.db);

  const current = await repository.findForRestaurant(data.orderId, data.restaurantId);
  assert.equal(current?.status, "Accepted");
  assert.equal(current?.items[0].preparationStatus, "Created");
  assert.equal(await repository.findForRestaurant(data.orderId, data.otherRestaurantId), null);

  const nextAt = new Date(at.getTime() + 1_000);
  assert.equal(
    await repository.updateOrderStatusIfCurrent(
      data.orderId,
      data.restaurantId,
      "Accepted",
      at,
      "Preparing",
      nextAt,
    ),
    true,
  );
  const orderWrite = data.queries.find(
    (query) => query.collection === COLLECTIONS.orders && query.filter.status === "Accepted",
  );
  assert.deepEqual(orderWrite?.filter, {
    _id: data.orderId,
    restaurantId: data.restaurantId,
    status: "Accepted",
    updatedAt: at,
  });
  assert.equal(data.order.status, "Preparing");
  assert.equal(data.order.statusTimestamps?.Preparing?.getTime(), nextAt.getTime());

  assert.equal(
    await repository.updateOrderStatusIfCurrent(
      data.orderId,
      data.restaurantId,
      "Accepted",
      at,
      "Ready",
      new Date(nextAt.getTime() + 1_000),
    ),
    false,
  );

  assert.equal(
    await repository.updateItemPreparationStatusIfCurrent(
      data.orderId,
      data.restaurantId,
      data.itemId,
      "Created",
      "Preparing",
      nextAt,
    ),
    true,
  );
  const itemWrite = data.queries.find(
    (query) => query.collection === COLLECTIONS.orderItems && query.filter._id === data.itemId,
  );
  assert.deepEqual(itemWrite?.filter, {
    _id: data.itemId,
    restaurantId: data.restaurantId,
    orderId: data.orderId,
    preparationStatus: "Created",
  });
  assert.equal(data.item.preparationStatus, "Preparing");

  assert.equal(
    await repository.updateItemPreparationStatusIfCurrent(
      data.orderId,
      data.otherRestaurantId,
      data.itemId,
      "Preparing",
      "Ready",
      nextAt,
    ),
    false,
  );
  assert.deepEqual(await repository.listItemPreparationStatuses(data.orderId, data.restaurantId), [
    "Preparing",
  ]);
});
