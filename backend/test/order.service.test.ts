import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { OrderError, OrderService } from "../src/orders/order.service.js";
import type {
  NewOrder,
  OrderItemSnapshot,
  OrderListResult,
  OrderRecord,
  OrderRepository,
} from "../src/orders/order.types.js";

const now = new Date("2026-10-11T06:00:00.000Z");
const restaurantId = new ObjectId();
const userId = new ObjectId();
const customerId = new ObjectId();
const menuDosaId = new ObjectId();
const menuCoffeeId = new ObjectId();
const orderId = new ObjectId();

class FakeOrderRepository implements OrderRepository {
  restaurantFound = true;
  customerIdForUser: ObjectId | null = customerId;
  menuItems: Array<{ id: ObjectId; name: string; priceMinor: number }> = [
    { id: menuDosaId, name: "Ghee podi dosa", priceMinor: 28_500 },
    { id: menuCoffeeId, name: "Madras filter coffee", priceMinor: 9_500 },
  ];
  order: OrderRecord = {
    id: orderId,
    restaurantId,
    restaurantName: "Saffron & Co.",
    status: "Created",
    totalMinor: 66_500,
    currency: "INR",
    items: [],
    createdAt: now,
    updatedAt: now,
  };
  created?: NewOrder;
  snapshots?: OrderItemSnapshot[];
  cancelResult: OrderRecord | null = this.order;

  getCustomerIdForUser(): Promise<ObjectId | null> {
    return Promise.resolve(this.customerIdForUser);
  }

  getActiveRestaurant(): Promise<{ id: ObjectId; name: string; currency: string } | null> {
    return Promise.resolve(
      this.restaurantFound ? { id: restaurantId, name: "Saffron & Co.", currency: "INR" } : null,
    );
  }

  getAvailableMenuItems(_restaurantId: ObjectId, ids: ObjectId[]) {
    return Promise.resolve(this.menuItems.filter((item) => ids.some((id) => id.equals(item.id))));
  }

  async createOrder(order: NewOrder, items: OrderItemSnapshot[]): Promise<OrderRecord> {
    this.created = order;
    this.snapshots = items;
    this.order = {
      ...this.order,
      ...order,
      restaurantName: "Saffron & Co.",
      items: items.map((item) => ({ id: new ObjectId(), ...item })),
    };
    return this.order;
  }

  listForCustomer(): Promise<OrderListResult> {
    return Promise.resolve({ orders: [this.order], truncated: false });
  }

  findForCustomer(): Promise<OrderRecord | null> {
    return Promise.resolve(this.order);
  }

  cancelForCustomer(): Promise<OrderRecord | null> {
    if (!this.cancelResult) return Promise.resolve(null);
    this.order = { ...this.order, status: "Cancelled", updatedAt: new Date(now.getTime() + 1) };
    return Promise.resolve(this.order);
  }
}

function serviceWith(repository = new FakeOrderRepository(), clock = () => now) {
  return { repository, service: new OrderService(repository, clock) };
}

test("customer order uses available database prices and stores integer-minor-unit snapshots", async () => {
  const { repository, service } = serviceWith();
  const order = await service.createForCustomer({
    userId,
    restaurantId,
    items: [
      { menuItemId: menuDosaId, quantity: 2 },
      { menuItemId: menuCoffeeId, quantity: 1 },
    ],
  });

  assert.equal(order.status, "Created");
  assert.equal(order.totalMinor, 66_500);
  assert.equal(order.currency, "INR");
  assert.equal(repository.created?.customerId, customerId);
  assert.deepEqual(repository.created?.statusTimestamps, { Created: now });
  assert.deepEqual(repository.snapshots, [
    {
      menuItemId: menuDosaId,
      nameSnapshot: "Ghee podi dosa",
      unitPriceMinor: 28_500,
      quantity: 2,
      preparationStatus: "Created",
    },
    {
      menuItemId: menuCoffeeId,
      nameSnapshot: "Madras filter coffee",
      unitPriceMinor: 9_500,
      quantity: 1,
      preparationStatus: "Created",
    },
  ]);
});

test("order creation rejects invalid quantities, repeated items, excessive units, and unavailable IDs", async () => {
  const invalidLines = [
    [],
    [{ menuItemId: menuDosaId, quantity: 0 }],
    [{ menuItemId: menuDosaId, quantity: 21 }],
    [
      { menuItemId: menuDosaId, quantity: 1 },
      { menuItemId: menuDosaId, quantity: 1 },
    ],
    [
      { menuItemId: menuDosaId, quantity: 20 },
      { menuItemId: menuCoffeeId, quantity: 20 },
      { menuItemId: new ObjectId(), quantity: 11 },
    ],
  ];

  for (const items of invalidLines) {
    const { repository, service } = serviceWith();
    await assert.rejects(
      service.createForCustomer({ userId, restaurantId, items }),
      (error: unknown) => error instanceof OrderError,
    );
    assert.equal(repository.created, undefined);
  }

  const unavailable = serviceWith();
  await assert.rejects(
    unavailable.service.createForCustomer({
      userId,
      restaurantId,
      items: [{ menuItemId: new ObjectId(), quantity: 1 }],
    }),
    (error: unknown) => error instanceof OrderError && error.code === "order_menu_item_unavailable",
  );
});

test("order creation requires an active restaurant, active Customer profile, and valid currency", async () => {
  const inactiveRestaurant = new FakeOrderRepository();
  inactiveRestaurant.restaurantFound = false;
  await assert.rejects(
    serviceWith(inactiveRestaurant).service.createForCustomer({
      userId,
      restaurantId,
      items: [{ menuItemId: menuDosaId, quantity: 1 }],
    }),
    (error: unknown) => error instanceof OrderError && error.code === "restaurant_not_found",
  );

  const missingProfile = new FakeOrderRepository();
  missingProfile.customerIdForUser = null;
  await assert.rejects(
    serviceWith(missingProfile).service.createForCustomer({
      userId,
      restaurantId,
      items: [{ menuItemId: menuDosaId, quantity: 1 }],
    }),
    (error: unknown) => error instanceof OrderError && error.code === "customer_profile_required",
  );

  const malformedCurrency = new FakeOrderRepository();
  malformedCurrency.getActiveRestaurant = async () => ({
    id: restaurantId,
    name: "Saffron & Co.",
    currency: "rupees",
  });
  await assert.rejects(
    serviceWith(malformedCurrency).service.createForCustomer({
      userId,
      restaurantId,
      items: [{ menuItemId: menuDosaId, quantity: 1 }],
    }),
    (error: unknown) =>
      error instanceof OrderError && error.code === "order_configuration_unavailable",
  );
});

test("customers can cancel only an order that is still Created", async () => {
  const repository = new FakeOrderRepository();
  const { service } = serviceWith(repository, () => new Date(now.getTime() + 1));
  const cancelled = await service.cancelForCustomer(userId, orderId);
  assert.equal(cancelled.status, "Cancelled");

  const accepted = new FakeOrderRepository();
  accepted.order = { ...accepted.order, status: "Accepted" };
  await assert.rejects(
    serviceWith(accepted).service.cancelForCustomer(userId, orderId),
    (error: unknown) => error instanceof OrderError && error.code === "order_cannot_be_cancelled",
  );

  const changedDuringWrite = new FakeOrderRepository();
  changedDuringWrite.cancelResult = null;
  await assert.rejects(
    serviceWith(changedDuringWrite).service.cancelForCustomer(userId, orderId),
    (error: unknown) => error instanceof OrderError && error.code === "order_changed",
  );
});
