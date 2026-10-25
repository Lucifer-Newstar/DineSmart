import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { ObjectId } from "mongodb";
import type { AuthPrincipal } from "../src/auth/auth.service.js";
import { createMenuRouter } from "../src/menu/menu.router.js";
import type { MenuReader, PublicMenu, PublicMenuItem } from "../src/menu/menu.types.js";
import { createOrderRouter } from "../src/orders/order.router.js";
import { OrderService } from "../src/orders/order.service.js";
import type {
  NewOrder,
  OrderItemSnapshot,
  OrderListResult,
  OrderRecord,
  OrderRepository,
} from "../src/orders/order.types.js";

const NOW = new Date("2026-10-12T06:00:00.000Z");
const RESTAURANT_ID = new ObjectId("730000000000000000000001");
const DOSA_ID = new ObjectId("730000000000000000000002");
const COFFEE_ID = new ObjectId("730000000000000000000003");
const CUSTOMER_A_USER_ID = new ObjectId("730000000000000000000004");
const CUSTOMER_A_PROFILE_ID = new ObjectId("730000000000000000000005");
const CUSTOMER_B_USER_ID = new ObjectId("730000000000000000000006");
const CUSTOMER_B_PROFILE_ID = new ObjectId("730000000000000000000007");

interface StoredMenuItem extends PublicMenuItem {
  isAvailable: boolean;
}

class CustomerWorkflowRepository implements MenuReader, OrderRepository {
  readonly menuItems: StoredMenuItem[] = [
    {
      id: DOSA_ID,
      name: "Ghee podi dosa",
      description: "Crisp dosa with house podi and ghee.",
      category: "Tiffin",
      priceMinor: 28_500,
      dietaryLabels: ["vegetarian"],
      allergenLabels: ["dairy"],
      isAvailable: true,
      optionGroups: [],
    },
    {
      id: COFFEE_ID,
      name: "Madras filter coffee",
      category: "Beverages",
      priceMinor: 9_500,
      dietaryLabels: ["vegetarian"],
      allergenLabels: ["dairy"],
      isAvailable: true,
      optionGroups: [],
    },
  ];

  private readonly customerProfiles = new Map([
    [CUSTOMER_A_USER_ID.toHexString(), CUSTOMER_A_PROFILE_ID],
    [CUSTOMER_B_USER_ID.toHexString(), CUSTOMER_B_PROFILE_ID],
  ]);
  private readonly orders: Array<{ customerId: ObjectId; record: OrderRecord }> = [];
  private active = true;

  get createdOrderCount(): number {
    return this.orders.length;
  }

  async getAvailableMenu(restaurantId: ObjectId): Promise<PublicMenu | null> {
    if (!this.active || !restaurantId.equals(RESTAURANT_ID)) return null;
    return {
      restaurant: { id: RESTAURANT_ID, name: "Saffron & Co.", currency: "INR" },
      categories: ["Tiffin", "Beverages"],
      items: this.menuItems.map(publicMenuItem),
      truncated: false,
    };
  }

  async getCustomerIdForUser(userId: ObjectId): Promise<ObjectId | null> {
    return this.customerProfiles.get(userId.toHexString()) ?? null;
  }

  async getActiveRestaurant(restaurantId: ObjectId) {
    if (!this.active || !restaurantId.equals(RESTAURANT_ID)) return null;
    return { id: RESTAURANT_ID, name: "Saffron & Co.", currency: "INR" };
  }

  async getAvailableMenuItems(restaurantId: ObjectId, menuItemIds: ObjectId[]) {
    if (!this.active || !restaurantId.equals(RESTAURANT_ID)) return [];
    return this.menuItems
      .filter((item) => item.isAvailable && menuItemIds.some((id) => id.equals(item.id)))
      .map((item) => ({ id: item.id, name: item.name, priceMinor: item.priceMinor }));
  }

  async createOrder(order: NewOrder, items: OrderItemSnapshot[], now: Date): Promise<OrderRecord> {
    const record: OrderRecord = {
      id: new ObjectId(),
      restaurantId: order.restaurantId,
      restaurantName: "Saffron & Co.",
      status: order.status,
      totalMinor: order.totalMinor,
      currency: order.currency,
      items: items.map((item) => ({ id: new ObjectId(), ...item })),
      createdAt: now,
      updatedAt: now,
    };
    this.orders.push({ customerId: order.customerId, record });
    return record;
  }

  async listForCustomer(customerId: ObjectId): Promise<OrderListResult> {
    return {
      orders: this.orders
        .filter((entry) => entry.customerId.equals(customerId))
        .map((entry) => entry.record),
      truncated: false,
    };
  }

  async findForCustomer(orderId: ObjectId, customerId: ObjectId): Promise<OrderRecord | null> {
    return (
      this.orders.find(
        (entry) => entry.record.id.equals(orderId) && entry.customerId.equals(customerId),
      )?.record ?? null
    );
  }

  async cancelForCustomer(
    orderId: ObjectId,
    customerId: ObjectId,
    expectedUpdatedAt: Date,
    now: Date,
  ): Promise<OrderRecord | null> {
    const entry = this.orders.find(
      (candidate) => candidate.record.id.equals(orderId) && candidate.customerId.equals(customerId),
    );
    if (!entry || entry.record.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return null;
    entry.record = { ...entry.record, status: "Cancelled", updatedAt: now };
    return entry.record;
  }
}

function publicMenuItem(item: StoredMenuItem): PublicMenuItem {
  return { ...item };
}

function principalForToken(token: string): AuthPrincipal {
  if (token === "customer-a-token") {
    return {
      userId: CUSTOMER_A_USER_ID.toHexString(),
      role: "Customer",
      restaurantId: null,
    };
  }
  if (token === "customer-b-token") {
    return {
      userId: CUSTOMER_B_USER_ID.toHexString(),
      role: "Customer",
      restaurantId: null,
    };
  }
  throw new Error("Invalid test access token.");
}

function createCustomerWorkflowApp(repository: CustomerWorkflowRepository) {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/menu", createMenuRouter({ createReader: async () => repository }));
  app.use(
    "/api/v1/orders",
    createOrderRouter({
      createRuntime: async () => ({
        service: new OrderService(repository, () => NOW),
        verifyAccessToken: async (token) => principalForToken(token),
      }),
    }),
  );
  return app;
}

async function withServer<T>(
  app: express.Express,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function customerHeaders(token = "customer-a-token") {
  return { authorization: `Bearer ${token}` };
}

test("customer browses the public menu, places an order, and retrieves the saved order", async () => {
  const repository = new CustomerWorkflowRepository();
  const app = createCustomerWorkflowApp(repository);

  await withServer(app, async (baseUrl) => {
    const menuResponse = await fetch(
      `${baseUrl}/api/v1/menu?restaurantId=${RESTAURANT_ID.toHexString()}`,
    );
    assert.equal(menuResponse.status, 200);
    const menu = (await menuResponse.json()) as {
      restaurant: { id: string; currency: string };
      items: Array<{ id: string; name: string; priceMinor: number }>;
    };
    assert.equal(menu.restaurant.id, RESTAURANT_ID.toHexString());
    assert.equal(menu.restaurant.currency, "INR");
    assert.deepEqual(
      menu.items.map(({ id, name, priceMinor }) => ({ id, name, priceMinor })),
      [
        { id: DOSA_ID.toHexString(), name: "Ghee podi dosa", priceMinor: 28_500 },
        { id: COFFEE_ID.toHexString(), name: "Madras filter coffee", priceMinor: 9_500 },
      ],
    );

    const orderResponse = await fetch(`${baseUrl}/api/v1/orders`, {
      method: "POST",
      headers: { ...customerHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        restaurantId: RESTAURANT_ID.toHexString(),
        items: [{ menuItemId: DOSA_ID.toHexString(), quantity: 2 }],
      }),
    });
    assert.equal(orderResponse.status, 201);
    const created = (await orderResponse.json()) as {
      order: {
        id: string;
        restaurantId: string;
        restaurantName: string;
        status: string;
        totalMinor: number;
        currency: string;
        items: Array<{
          id: string;
          menuItemId: string;
          name: string;
          unitPriceMinor: number;
          quantity: number;
        }>;
        createdAt: string;
        updatedAt: string;
        customerId?: string;
      };
    };
    assert.equal(created.order.restaurantId, RESTAURANT_ID.toHexString());
    assert.equal(created.order.status, "Created");
    assert.equal(created.order.totalMinor, 57_000);
    assert.equal(created.order.currency, "INR");
    assert.deepEqual(created.order.items, [
      {
        id: created.order.items[0].id,
        menuItemId: DOSA_ID.toHexString(),
        name: "Ghee podi dosa",
        unitPriceMinor: 28_500,
        quantity: 2,
      },
    ]);
    assert.equal(created.order.customerId, undefined);
    assert.equal(repository.createdOrderCount, 1);

    const historyResponse = await fetch(`${baseUrl}/api/v1/orders/history`, {
      headers: customerHeaders(),
    });
    assert.equal(historyResponse.status, 200);
    const history = (await historyResponse.json()) as {
      orders: Array<typeof created.order>;
      truncated: boolean;
    };
    assert.equal(history.truncated, false);
    assert.deepEqual(history.orders, [created.order]);
  });
});

test("menu availability is rechecked at order time and order history stays customer-owned", async () => {
  const repository = new CustomerWorkflowRepository();
  const app = createCustomerWorkflowApp(repository);

  await withServer(app, async (baseUrl) => {
    const createdResponse = await fetch(`${baseUrl}/api/v1/orders`, {
      method: "POST",
      headers: { ...customerHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        restaurantId: RESTAURANT_ID.toHexString(),
        items: [{ menuItemId: DOSA_ID.toHexString(), quantity: 1 }],
      }),
    });
    assert.equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as { order: { id: string } };

    const dosa = repository.menuItems.find((item) => item.id.equals(DOSA_ID));
    assert.ok(dosa);
    dosa.isAvailable = false;

    const refreshedMenu = await fetch(
      `${baseUrl}/api/v1/menu?restaurantId=${RESTAURANT_ID.toHexString()}`,
    );
    assert.equal(refreshedMenu.status, 200);
    const currentMenu = (await refreshedMenu.json()) as {
      items: Array<{ id: string; isAvailable: boolean }>;
    };
    // A sold-out item stays on the menu, flagged, so customers see it greyed out.
    assert.deepEqual(
      currentMenu.items.map((item) => [item.id, item.isAvailable]),
      [
        [DOSA_ID.toHexString(), false],
        [COFFEE_ID.toHexString(), true],
      ],
    );

    const staleCartOrder = await fetch(`${baseUrl}/api/v1/orders`, {
      method: "POST",
      headers: { ...customerHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        restaurantId: RESTAURANT_ID.toHexString(),
        items: [{ menuItemId: DOSA_ID.toHexString(), quantity: 1 }],
      }),
    });
    assert.equal(staleCartOrder.status, 409);
    assert.equal(
      ((await staleCartOrder.json()) as { error: { code: string } }).error.code,
      "order_menu_item_unavailable",
    );
    assert.equal(repository.createdOrderCount, 1);

    const otherCustomerHistory = await fetch(`${baseUrl}/api/v1/orders/history`, {
      headers: customerHeaders("customer-b-token"),
    });
    assert.equal(otherCustomerHistory.status, 200);
    assert.deepEqual(((await otherCustomerHistory.json()) as { orders: unknown[] }).orders, []);

    const otherCustomerCancel = await fetch(`${baseUrl}/api/v1/orders/${created.order.id}/cancel`, {
      method: "PUT",
      headers: customerHeaders("customer-b-token"),
    });
    assert.equal(otherCustomerCancel.status, 404);
    assert.equal(
      ((await otherCustomerCancel.json()) as { error: { code: string } }).error.code,
      "order_not_found",
    );
  });
});
