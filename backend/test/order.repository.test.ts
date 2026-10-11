import assert from "node:assert/strict";
import { test } from "node:test";
import { type Db, ObjectId } from "mongodb";
import {
  COLLECTIONS,
  type CustomerDocument,
  type MenuItemDocument,
  type OrderDocument,
  type OrderItemDocument,
  type RestaurantDocument,
  type UserDocument,
} from "../src/database/schema.js";
import { MongoOrderRepository } from "../src/orders/order.repository.js";
import type { OrderItemSnapshot } from "../src/orders/order.types.js";

const now = new Date("2026-10-11T06:00:00.000Z");

function createDatabase(options: { failOrderInsert?: boolean } = {}) {
  const restaurantId = new ObjectId();
  const userId = new ObjectId();
  const customerId = new ObjectId();
  const menuItemId = new ObjectId();
  const otherMenuItemId = new ObjectId();
  const restaurant = {
    _id: restaurantId,
    name: "Saffron & Co.",
    timezone: "Asia/Kolkata",
    currency: "INR",
    status: "active",
    createdAt: now,
    updatedAt: now,
  } satisfies RestaurantDocument & { _id: ObjectId };
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
  } satisfies UserDocument & { _id: ObjectId };
  const customer = {
    _id: customerId,
    userId,
    displayName: "Ananya Menon",
    createdAt: now,
    updatedAt: now,
  } satisfies CustomerDocument & { _id: ObjectId };
  const menuDocuments = [
    {
      _id: menuItemId,
      restaurantId,
      category: "Tiffin",
      name: "Ghee podi dosa",
      priceMinor: 28_500,
      isAvailable: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: otherMenuItemId,
      restaurantId,
      category: "Beverages",
      name: "Filter coffee",
      priceMinor: 9_500,
      isAvailable: false,
      createdAt: now,
      updatedAt: now,
    },
  ] satisfies Array<MenuItemDocument & { _id: ObjectId }>;
  const operations: string[] = [];
  const filters: Array<{ collection: string; filter: Record<string, unknown> }> = [];
  const insertedItems: Array<OrderItemDocument & { _id: ObjectId }> = [];
  let order: (OrderDocument & { _id: ObjectId }) | null = null;

  const db = {
    collection(name: string) {
      return {
        async findOne(filter: Record<string, unknown>, _options?: Record<string, unknown>) {
          filters.push({ collection: name, filter });
          const id = filter._id as ObjectId | undefined;
          if (name === COLLECTIONS.users) return id?.equals(userId) ? user : null;
          if (name === COLLECTIONS.restaurants) {
            if (filter.status === "active") return restaurant;
            return id?.equals(restaurantId) ? restaurant : null;
          }
          if (name === COLLECTIONS.orders) {
            const customerFilter = filter.customerId as ObjectId | undefined;
            return order && id?.equals(order._id) && customerFilter?.equals(order.customerId)
              ? order
              : null;
          }
          return null;
        },
        async findOneAndUpdate(
          filter: Record<string, unknown>,
          _update: Record<string, unknown>,
          _options: Record<string, unknown>,
        ) {
          filters.push({ collection: name, filter });
          const profileUserId = filter.userId as ObjectId | undefined;
          return name === COLLECTIONS.customers && profileUserId?.equals(userId) ? customer : null;
        },
        find(filter: Record<string, unknown>) {
          filters.push({ collection: name, filter });
          let result: unknown[] = [];
          if (name === COLLECTIONS.menuItems) {
            const ids = (filter._id as { $in?: ObjectId[] } | undefined)?.$in;
            const restaurantFilter = filter.restaurantId as ObjectId | undefined;
            result = menuDocuments.filter(
              (item) =>
                restaurantFilter?.equals(item.restaurantId) &&
                item.isAvailable === filter.isAvailable &&
                ids?.some((id) => id.equals(item._id)),
            );
          } else if (name === COLLECTIONS.orders) {
            const customerFilter = filter.customerId as ObjectId | undefined;
            result = order && customerFilter?.equals(order.customerId) ? [order] : [];
          } else if (name === COLLECTIONS.orderItems) {
            const clauses = filter.$or as
              | Array<{ orderId: ObjectId; restaurantId: ObjectId }>
              | undefined;
            if (clauses) {
              result = insertedItems.filter((item) =>
                clauses.some(
                  (clause) =>
                    item.orderId.equals(clause.orderId) &&
                    item.restaurantId.equals(clause.restaurantId),
                ),
              );
            } else {
              const orderFilter = filter.orderId as ObjectId | undefined;
              const restaurantFilter = filter.restaurantId as ObjectId | undefined;
              result = insertedItems.filter(
                (item) =>
                  orderFilter?.equals(item.orderId) && restaurantFilter?.equals(item.restaurantId),
              );
            }
          } else if (name === COLLECTIONS.restaurants) {
            result = [restaurant];
          }

          const cursor = {
            sort(specification: Record<string, 1 | -1>) {
              if (name === COLLECTIONS.orders) {
                assert.deepEqual(specification, { createdAt: -1, _id: -1 });
              }
              if (name === COLLECTIONS.orderItems) {
                assert.deepEqual(specification, { createdAt: 1, _id: 1 });
              }
              return cursor;
            },
            limit(value: number) {
              assert.equal(value, 101);
              return cursor;
            },
            async toArray() {
              return result;
            },
          };
          return cursor;
        },
        async insertMany(documents: Array<OrderItemDocument & { _id: ObjectId }>) {
          operations.push("items.insertMany");
          insertedItems.push(...documents);
          return { insertedCount: documents.length };
        },
        async insertOne(document: OrderDocument & { _id: ObjectId }) {
          operations.push("orders.insertOne");
          if (options.failOrderInsert) throw new Error("injected parent insert failure");
          order = document;
          return { insertedId: document._id };
        },
        async deleteMany(filter: Record<string, ObjectId>) {
          operations.push("items.deleteMany");
          for (let index = insertedItems.length - 1; index >= 0; index--) {
            if (
              insertedItems[index].restaurantId.equals(filter.restaurantId) &&
              insertedItems[index].orderId.equals(filter.orderId)
            ) {
              insertedItems.splice(index, 1);
            }
          }
          return { deletedCount: 1 };
        },
        async deleteOne(filter: Record<string, unknown>) {
          operations.push("orders.deleteOne");
          const id = filter._id as ObjectId | undefined;
          if (id && order?._id.equals(id)) order = null;
          return { deletedCount: 0 };
        },
        async updateOne(
          filter: Record<string, unknown>,
          update: { $set: Record<string, unknown> },
        ) {
          filters.push({ collection: name, filter });
          const id = filter._id as ObjectId | undefined;
          const customerFilter = filter.customerId as ObjectId | undefined;
          const expectedUpdatedAt = filter.updatedAt as Date | undefined;
          if (
            name !== COLLECTIONS.orders ||
            !order ||
            !id?.equals(order._id) ||
            !customerFilter?.equals(order.customerId) ||
            order.status !== filter.status ||
            !expectedUpdatedAt ||
            order.updatedAt.getTime() !== expectedUpdatedAt.getTime()
          ) {
            return { matchedCount: 0 };
          }
          order = {
            ...order,
            status: update.$set.status as OrderDocument["status"],
            updatedAt: update.$set.updatedAt as Date,
            statusTimestamps: {
              ...order.statusTimestamps,
              Cancelled: update.$set["statusTimestamps.Cancelled"] as Date,
            },
          };
          return { matchedCount: 1 };
        },
      };
    },
  } as unknown as Db;

  return {
    db,
    restaurantId,
    userId,
    customerId,
    menuItemId,
    otherMenuItemId,
    restaurant,
    operations,
    filters,
    insertedItems,
    get order() {
      return order;
    },
  };
}

test("order repository snapshots selected menu items and writes children before the visible header", async () => {
  const fixture = createDatabase();
  const repository = new MongoOrderRepository(fixture.db);
  const customer = await repository.getCustomerIdForUser(fixture.userId, now);
  assert.equal(customer?.toHexString(), fixture.customerId.toHexString());

  const available = await repository.getAvailableMenuItems(fixture.restaurantId, [
    fixture.menuItemId,
    fixture.otherMenuItemId,
  ]);
  assert.deepEqual(
    available.map((item) => item.id.toHexString()),
    [fixture.menuItemId.toHexString()],
  );

  const snapshots: OrderItemSnapshot[] = [
    {
      menuItemId: fixture.menuItemId,
      nameSnapshot: "Ghee podi dosa",
      unitPriceMinor: 28_500,
      quantity: 2,
      preparationStatus: "Created",
    },
  ];
  const order = await repository.createOrder(
    {
      restaurantId: fixture.restaurantId,
      customerId: fixture.customerId,
      totalMinor: 57_000,
      currency: "INR",
      status: "Created",
      statusTimestamps: { Created: now },
    },
    snapshots,
    now,
  );

  assert.deepEqual(fixture.operations, ["items.insertMany", "orders.insertOne"]);
  assert.equal(fixture.order?._id.toHexString(), order.id.toHexString());
  assert.equal(fixture.order?.restaurantId.toHexString(), fixture.restaurantId.toHexString());
  assert.equal(fixture.order?.customerId.toHexString(), fixture.customerId.toHexString());
  assert.equal(fixture.insertedItems.length, 1);
  assert.equal(fixture.insertedItems[0].orderId.toHexString(), order.id.toHexString());
  assert.equal(fixture.insertedItems[0].nameSnapshot, "Ghee podi dosa");
  assert.equal(fixture.insertedItems[0].unitPriceMinor, 28_500);
  assert.equal(fixture.insertedItems[0].quantity, 2);
  assert.equal(order.totalMinor, 57_000);
});

test("customer history is ownership-scoped and cancellation conditionally changes Created only", async () => {
  const fixture = createDatabase();
  const repository = new MongoOrderRepository(fixture.db);
  const order = await repository.createOrder(
    {
      restaurantId: fixture.restaurantId,
      customerId: fixture.customerId,
      totalMinor: 28_500,
      currency: "INR",
      status: "Created",
      statusTimestamps: { Created: now },
    },
    [
      {
        menuItemId: fixture.menuItemId,
        nameSnapshot: "Ghee podi dosa",
        unitPriceMinor: 28_500,
        quantity: 1,
        preparationStatus: "Created",
      },
    ],
    now,
  );

  const history = await repository.listForCustomer(fixture.customerId);
  assert.equal(history.orders.length, 1);
  assert.equal(history.truncated, false);
  assert.equal(history.orders[0].restaurantName, "Saffron & Co.");
  assert.equal(history.orders[0].items[0].nameSnapshot, "Ghee podi dosa");

  const cancelled = await repository.cancelForCustomer(
    order.id,
    fixture.customerId,
    now,
    new Date(now.getTime() + 1_000),
  );
  assert.equal(cancelled?.status, "Cancelled");
  const cancellationFilter = fixture.filters.find(
    (entry) => entry.collection === COLLECTIONS.orders && entry.filter.status === "Created",
  );
  assert.deepEqual(cancellationFilter?.filter, {
    _id: order.id,
    customerId: fixture.customerId,
    status: "Created",
    updatedAt: now,
  });
  assert.equal(
    await repository.cancelForCustomer(
      order.id,
      fixture.customerId,
      now,
      new Date(now.getTime() + 2_000),
    ),
    null,
  );
});

test("repository compensates child items when parent order insertion fails", async () => {
  const fixture = createDatabase({ failOrderInsert: true });
  const repository = new MongoOrderRepository(fixture.db);
  await assert.rejects(
    repository.createOrder(
      {
        restaurantId: fixture.restaurantId,
        customerId: fixture.customerId,
        totalMinor: 28_500,
        currency: "INR",
        status: "Created",
        statusTimestamps: { Created: now },
      },
      [
        {
          menuItemId: fixture.menuItemId,
          nameSnapshot: "Ghee podi dosa",
          unitPriceMinor: 28_500,
          quantity: 1,
          preparationStatus: "Created",
        },
      ],
      now,
    ),
    /injected parent insert failure/,
  );
  assert.deepEqual(fixture.operations, [
    "items.insertMany",
    "orders.insertOne",
    "items.deleteMany",
    "orders.deleteOne",
  ]);
  assert.equal(fixture.insertedItems.length, 0);
  assert.equal(fixture.order, null);
});
