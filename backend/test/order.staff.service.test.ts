import assert from "node:assert/strict";
import { test } from "node:test";
import { ObjectId } from "mongodb";
import { OrderError } from "../src/orders/order.service.js";
import { StaffOrderService } from "../src/orders/order.staff.service.js";
import type { KitchenQueueResult, StaffOrderRepository } from "../src/orders/order.staff.types.js";
import type { OrderRecord } from "../src/orders/order.types.js";

const at = new Date("2026-10-11T06:00:00.000Z");
const restaurantId = new ObjectId();
const otherRestaurantId = new ObjectId();
const orderId = new ObjectId();
const firstItemId = new ObjectId();
const secondItemId = new ObjectId();

function makeOrder(status: OrderRecord["status"] = "Accepted"): OrderRecord {
  return {
    id: orderId,
    restaurantId,
    restaurantName: "Saffron & Co.",
    status,
    totalMinor: 38_000,
    currency: "INR",
    items: [
      {
        id: firstItemId,
        menuItemId: new ObjectId(),
        nameSnapshot: "Ghee podi dosa",
        unitPriceMinor: 28_500,
        quantity: 1,
        preparationStatus: "Created",
      },
      {
        id: secondItemId,
        menuItemId: new ObjectId(),
        nameSnapshot: "Filter coffee",
        unitPriceMinor: 9_500,
        quantity: 1,
        preparationStatus: "Created",
      },
    ],
    createdAt: at,
    updatedAt: at,
  };
}

class FakeStaffOrderRepository implements StaffOrderRepository {
  order: OrderRecord | null = makeOrder();
  listResult: KitchenQueueResult = { tickets: [], truncated: false };
  failNextHeaderUpdate = false;
  failNextItemUpdate = false;
  readonly headerTransitions: Array<{ from: string; to: string }> = [];
  readonly itemTransitions: Array<{ from: string; to: string }> = [];
  lastQueueRestaurantId?: ObjectId;

  listKitchenQueue(tenantId: ObjectId): Promise<KitchenQueueResult> {
    this.lastQueueRestaurantId = tenantId;
    return Promise.resolve(this.listResult);
  }

  findForRestaurant(id: ObjectId, tenantId: ObjectId): Promise<OrderRecord | null> {
    const order = this.order;
    if (!order?.id.equals(id) || !order.restaurantId.equals(tenantId)) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      ...order,
      items: order.items.map((item) => ({ ...item })),
    });
  }

  async updateOrderStatusIfCurrent(
    id: ObjectId,
    tenantId: ObjectId,
    expectedStatus: OrderRecord["status"],
    expectedUpdatedAt: Date,
    nextStatus: OrderRecord["status"],
    now: Date,
  ): Promise<boolean> {
    if (this.failNextHeaderUpdate) {
      this.failNextHeaderUpdate = false;
      return false;
    }
    const order = this.order;
    if (
      !order?.id.equals(id) ||
      !order.restaurantId.equals(tenantId) ||
      order.status !== expectedStatus ||
      order.updatedAt.getTime() !== expectedUpdatedAt.getTime()
    ) {
      return false;
    }
    this.headerTransitions.push({ from: order.status, to: nextStatus });
    this.order = { ...order, status: nextStatus, updatedAt: now };
    return true;
  }

  async updateItemPreparationStatusIfCurrent(
    id: ObjectId,
    tenantId: ObjectId,
    itemId: ObjectId,
    expectedStatus: "Created" | "Preparing" | "Ready",
    nextStatus: "Created" | "Preparing" | "Ready",
  ): Promise<boolean> {
    if (this.failNextItemUpdate) {
      this.failNextItemUpdate = false;
      return false;
    }
    const order = this.order;
    if (!order?.id.equals(id) || !order.restaurantId.equals(tenantId)) {
      return false;
    }
    const item = order.items.find((candidate) => candidate.id.equals(itemId));
    if (!item || item.preparationStatus !== expectedStatus) return false;
    this.itemTransitions.push({ from: expectedStatus, to: nextStatus });
    this.order = {
      ...order,
      items: order.items.map((candidate) =>
        candidate.id.equals(itemId) ? { ...candidate, preparationStatus: nextStatus } : candidate,
      ),
    };
    return true;
  }

  listItemPreparationStatuses(
    id: ObjectId,
    tenantId: ObjectId,
  ): Promise<Array<"Created" | "Preparing" | "Ready">> {
    const order = this.order;
    if (!order?.id.equals(id) || !order.restaurantId.equals(tenantId)) {
      return Promise.resolve([]);
    }
    return Promise.resolve(order.items.map((item) => item.preparationStatus));
  }
}

function serviceWith(repository = new FakeStaffOrderRepository()) {
  let tick = 0;
  const service = new StaffOrderService(repository, () => new Date(at.getTime() + ++tick * 1_000));
  return { repository, service };
}

test("kitchen queue delegates using the signed tenant", async () => {
  const repository = new FakeStaffOrderRepository();
  const expected: KitchenQueueResult = { tickets: [], truncated: true };
  repository.listResult = expected;
  const { service } = serviceWith(repository);
  assert.deepEqual(await service.listKitchenQueue(restaurantId), expected);
  assert.equal(repository.lastQueueRestaurantId?.toHexString(), restaurantId.toHexString());
});

test("kitchen item progress derives Preparing and Ready from all order items", async () => {
  const { repository, service } = serviceWith();

  let updated = await service.updateItemPreparationStatus(
    restaurantId,
    orderId,
    firstItemId,
    "Preparing",
  );
  assert.equal(updated.status, "Preparing");
  assert.deepEqual(repository.headerTransitions, [{ from: "Accepted", to: "Preparing" }]);

  updated = await service.updateItemPreparationStatus(
    restaurantId,
    orderId,
    secondItemId,
    "Preparing",
  );
  updated = await service.updateItemPreparationStatus(restaurantId, orderId, firstItemId, "Ready");
  assert.equal(updated.status, "Preparing");

  updated = await service.updateItemPreparationStatus(restaurantId, orderId, secondItemId, "Ready");
  assert.equal(updated.status, "Ready");
  assert.deepEqual(repository.headerTransitions, [
    { from: "Accepted", to: "Preparing" },
    { from: "Preparing", to: "Ready" },
  ]);
  assert.ok(updated.items.every((item) => item.preparationStatus === "Ready"));
});

test("idempotent item retry reconciles an order header after a partial write", async () => {
  const repository = new FakeStaffOrderRepository();
  repository.order = {
    ...makeOrder("Accepted"),
    items: makeOrder().items.map((item) =>
      item.id.equals(firstItemId) ? { ...item, preparationStatus: "Preparing" } : item,
    ),
  };
  const { service } = serviceWith(repository);

  const result = await service.updateItemPreparationStatus(
    restaurantId,
    orderId,
    firstItemId,
    "Preparing",
  );
  assert.equal(result.status, "Preparing");
  assert.deepEqual(repository.itemTransitions, []);
  assert.deepEqual(repository.headerTransitions, [{ from: "Accepted", to: "Preparing" }]);
});

test("staff order lifecycle permits only accept, serve, and complete transitions", async () => {
  const repository = new FakeStaffOrderRepository();
  const { service } = serviceWith(repository);
  repository.order = makeOrder("Created");
  assert.equal(
    (await service.updateOrderStatus(restaurantId, orderId, "Accepted")).status,
    "Accepted",
  );

  repository.order = { ...makeOrder("Ready"), updatedAt: new Date(at.getTime() + 2_000) };
  assert.equal((await service.updateOrderStatus(restaurantId, orderId, "Served")).status, "Served");

  repository.order = { ...makeOrder("Served"), updatedAt: new Date(at.getTime() + 3_000) };
  assert.equal(
    (await service.updateOrderStatus(restaurantId, orderId, "Completed")).status,
    "Completed",
  );

  repository.order = makeOrder("Created");
  await assert.rejects(
    service.updateOrderStatus(restaurantId, orderId, "Cancelled"),
    (error: unknown) => error instanceof OrderError && error.code === "invalid_order_transition",
  );
  await assert.rejects(
    service.updateOrderStatus(restaurantId, orderId, "Preparing"),
    (error: unknown) => error instanceof OrderError && error.code === "invalid_order_transition",
  );
});

test("stale writes, invalid item transitions, and cross-tenant records fail closed", async () => {
  const repository = new FakeStaffOrderRepository();
  const { service } = serviceWith(repository);

  repository.order = makeOrder("Created");
  repository.failNextHeaderUpdate = true;
  await assert.rejects(
    service.updateOrderStatus(restaurantId, orderId, "Accepted"),
    (error: unknown) => error instanceof OrderError && error.code === "order_changed",
  );

  await assert.rejects(
    service.updateOrderStatus(otherRestaurantId, orderId, "Accepted"),
    (error: unknown) => error instanceof OrderError && error.code === "order_not_found",
  );

  await assert.rejects(
    service.updateItemPreparationStatus(restaurantId, orderId, firstItemId, "Ready"),
    (error: unknown) =>
      error instanceof OrderError && error.code === "invalid_preparation_transition",
  );

  await assert.rejects(
    service.updateItemPreparationStatus(restaurantId, orderId, new ObjectId(), "Preparing"),
    (error: unknown) => error instanceof OrderError && error.code === "order_item_not_found",
  );

  repository.order = makeOrder("Accepted");
  repository.failNextItemUpdate = true;
  await assert.rejects(
    service.updateItemPreparationStatus(restaurantId, orderId, firstItemId, "Preparing"),
    (error: unknown) => error instanceof OrderError && error.code === "order_changed",
  );
});
